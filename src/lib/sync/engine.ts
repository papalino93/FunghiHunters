/**
 * Un giro di sincronizzazione del diario: pull, merge, push.
 *
 * **Perché last-write-wins e non un merge campo per campo.** È l'unica regola che l'utente può
 * prevedere guardando "quale modifica ho fatto per ultima", ed è sufficiente qui: una voce di
 * diario ha un solo proprietario, che la modifica da un dispositivo alla volta, quasi mai da due
 * nello stesso minuto. Un merge più fine servirebbe solo per editing condiviso, che questo diario
 * non è.
 *
 * **Perché il pull viene prima del push.** Se si facesse il contrario, un dispositivo rimasto
 * offline a lungo — con una modifica ormai vecchia ma ancora "locale e non sincronizzata" —
 * sovrascriverebbe sul server una modifica più recente fatta da un altro dispositivo, prima ancora
 * di scoprire che esiste. Facendo prima il pull, ogni voce dove il server è più recente viene
 * aggiornata in locale *prima* di decidere cosa spedire: quella voce non fa più parte del push,
 * perché il locale non vince più il confronto.
 *
 * **Perché non si perde mai una modifica in silenzio.** O la voce locale è la più recente e vince
 * (viene inviata), o la voce remota è la più recente e vince (viene applicata in locale): non
 * esiste un terzo caso in cui una modifica scompare senza che il suo timestamp l'abbia persa
 * onestamente al confronto.
 */

import type { SyncBackend, SyncableEntity, SyncOutcome } from '@/lib/sync/types'

/**
 * Cio' che il motore chiede a un repository, a prescindere da cosa stia sincronizzando.
 *
 * Sottoinsieme di `DiaryRepository`: quest'ultimo la implementa gia' di fatto (stessa forma dei
 * tre metodi), quindi passare un `DiaryRepository` qui non richiede alcun adattamento. Un
 * repository nuovo — le zone seguite, o una lista personale futura — deve solo avere questi tre
 * metodi per riusare lo stesso motore, testato qui, invece di riscriverne uno.
 */
export interface SyncRepository<T extends SyncableEntity> {
  /** Voci vive e tombstone: il motore deve vedere le cancellazioni per propagarle. */
  listAll(): Promise<T[]>
  /** Applica una voce arrivata dal server così com'è, senza rigenerare id o timestamp. */
  upsertRaw(entry: T): Promise<void>
  /** Toglie fisicamente la riga, dopo che la cancellazione è stata confermata sincronizzata. */
  purge(id: string): Promise<boolean>
}

export async function runSync<T extends SyncableEntity>(
  repo: SyncRepository<T>,
  backend: SyncBackend<T>,
  lastSyncedAt: string | null,
): Promise<SyncOutcome> {
  /*
   * Catturato PRIMA di ogni `await`, non alla fine. Se si usasse l'ora di fine, una modifica
   * fatta dall'utente mentre il giro è in corso (aggiunge una voce mentre `pull`/`push` sono
   * ancora in volo — possibile: JavaScript è a thread singolo ma cede il controllo a ogni await,
   * e un tocco sull'interfaccia può inserirsi proprio lì) avrebbe un `updatedAt` precedente al
   * prossimo `lastSyncedAt`, pur non essendo mai stata né inviata né vista in questo giro: da quel
   * momento sarebbe esclusa per sempre da `candidates`, sparita in silenzio. Partire da qui
   * garantisce che quella voce resti più recente del prossimo cursore e venga ripresa al giro
   * successivo.
   */
  const startedAt = new Date().toISOString()
  try {
    const localBefore = await repo.listAll()

    // Voci locali cambiate dall'ultima sincronizzazione buona: candidate al push, salvo che il
    // pull qui sotto non le tolga di mezzo perché il server aveva una versione più recente.
    const candidates = new Map(
      (lastSyncedAt === null
        ? localBefore
        : localBefore.filter((e) => e.updatedAt > lastSyncedAt)
      ).map((e) => [e.id, e.updatedAt] as const),
    )

    const remote = await backend.pull(lastSyncedAt)
    let pulled = 0
    for (const remoteEntry of remote) {
      const localEntry = localBefore.find((e) => e.id === remoteEntry.id)
      const remoteWins = localEntry === undefined || remoteEntry.updatedAt > localEntry.updatedAt
      if (remoteWins) {
        await repo.upsertRaw(remoteEntry)
        pulled += 1
        candidates.delete(remoteEntry.id)
      }
    }

    const toPush = localBefore.filter((e) => candidates.has(e.id))
    if (toPush.length > 0) await backend.push(toPush)

    // I tombstone appena confermati in entrambe le direzioni non servono più in locale: la
    // cancellazione è ormai nota a tutti i dispositivi passati da qui.
    for (const entry of [...toPush, ...remote]) {
      if (entry.deletedAt !== null) await repo.purge(entry.id)
    }

    return {
      status: 'synced',
      pushed: toPush.length,
      pulled,
      error: null,
      syncedAt: startedAt,
    }
  } catch (error) {
    return {
      status: 'error',
      pushed: 0,
      pulled: 0,
      error: error instanceof Error ? error.message : 'Sincronizzazione fallita.',
      syncedAt: null,
    }
  }
}
