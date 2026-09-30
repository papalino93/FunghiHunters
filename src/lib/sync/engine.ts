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
 * Quanto indietro, oltre l'ultimo giro buono, si richiede comunque al server.
 *
 * Il cursore `lastSyncedAt` è l'ora del telefono, i timestamp di una cancellazione fatta dal
 * pannello sono l'ora del server: con l'orologio del telefono avanti di qualche minuto, una
 * cancellazione arrivata subito dopo un giro restava per sempre «prima del cursore» e non veniva
 * mai scaricata. Riprendere un giorno in più non costa niente — le voci già viste perdono il
 * confronto (`remoteWins` richiede un timestamp strettamente più recente) — e copre qualunque
 * orologio sbagliato di meno di 24 ore.
 */
export const PULL_OVERLAP_MS = 24 * 60 * 60 * 1000

function pullCursor(lastSyncedAt: string | null): string | null {
  if (lastSyncedAt === null) return null
  const at = Date.parse(lastSyncedAt)
  return Number.isFinite(at) ? new Date(at - PULL_OVERLAP_MS).toISOString() : lastSyncedAt
}

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

    const remote = await backend.pull(pullCursor(lastSyncedAt))

    /*
     * Riletto dopo il pull: mentre la rete rispondeva l'utente può aver salvato una modifica. Il
     * confronto con la copia letta a inizio giro la darebbe per vecchia, e la versione del server
     * la sovrascriverebbe in silenzio. Da qui in poi vale la copia attuale; una modifica fatta
     * ancora dopo ha comunque un `updatedAt` successivo a `startedAt`, e parte al giro dopo.
     */
    const localNow = await repo.listAll()
    for (const entry of localNow) {
      if (lastSyncedAt === null || entry.updatedAt > lastSyncedAt) candidates.set(entry.id, entry.updatedAt)
    }

    let pulled = 0
    // Solo i tombstone remoti davvero applicati in locale (`remoteWins`), non ogni tombstone che
    // compare nella risposta grezza di `pull`: quest'ultima può contenere anche una voce che ha
    // *perso* il confronto — es. cancellata su un dispositivo, poi modificata più di recente su
    // questo — e purgarla comunque cancellerebbe dal disco la versione vivente appena spinta,
    // vanificando la garanzia di questo file ("non si perde mai una modifica in silenzio").
    const appliedRemoteTombstones: string[] = []
    for (const remoteEntry of remote) {
      const localEntry = localNow.find((e) => e.id === remoteEntry.id)
      const remoteWins = localEntry === undefined || remoteEntry.updatedAt > localEntry.updatedAt
      if (remoteWins) {
        await repo.upsertRaw(remoteEntry)
        pulled += 1
        candidates.delete(remoteEntry.id)
        if (remoteEntry.deletedAt !== null) appliedRemoteTombstones.push(remoteEntry.id)
      }
    }

    const toPush = localNow.filter((e) => candidates.has(e.id))
    if (toPush.length > 0) await backend.push(toPush)

    /*
     * I tombstone appena confermati in entrambe le direzioni non servono più in locale: la
     * cancellazione è ormai nota a tutti i dispositivi passati da qui. `toPush` e
     * `appliedRemoteTombstones` sono per costruzione insiemi di id disgiunti (un id vinto dal
     * remoto è uscito da `candidates`, quindi non può comparire in `toPush`).
     *
     * Prima di purgare, si rilegge lo stato attuale del repository invece di fidarsi della
     * decisione presa a inizio giro. Per il diario non cambia mai nulla — non esiste un'azione
     * utente che riporti in vita lo stesso id dopo un tombstone. Ma un repository come quello
     * delle zone seguite ha un `follow()` pensato apposta per essere idempotente sullo stesso id
     * (`materialise` lo rimette sempre vivo): se l'utente segue di nuovo la stessa zona mentre
     * questo giro è ancora in corso (`pull`/`push` sono `await`, e cedono il controllo), la
     * riga tornata viva nel frattempo va lasciata stare, non cancellata sulla base di uno stato
     * che qui non è più vero.
     */
    const idsToPurge = [
      ...toPush.filter((e) => e.deletedAt !== null).map((e) => e.id),
      ...appliedRemoteTombstones,
    ]
    if (idsToPurge.length > 0) {
      const stillDeleted = new Set(
        (await repo.listAll()).filter((e) => e.deletedAt !== null).map((e) => e.id),
      )
      for (const id of idsToPurge) {
        if (stillDeleted.has(id)) await repo.purge(id)
      }
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
