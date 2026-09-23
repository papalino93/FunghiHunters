'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Snapshot } from '@/lib/snapshot/types'
import type { DiaryEntry, TreeSpecies } from '@/lib/diary/types'
import { ABUNDANCE_LABELS } from '@/lib/diary/types'
import {
  createDiaryRepository,
  importInto,
  toExport,
  type DiaryRepository,
} from '@/lib/diary/store'
import { calibrate } from '@/lib/diary/calibration'
import { createWaypointRepository, type WaypointRepository } from '@/lib/waypoints/store'
import { EntryForm } from '@/components/diary/EntryForm'
import { CalibrationPanel } from '@/components/diary/CalibrationPanel'
import { WaypointsPanel } from '@/components/diary/WaypointsPanel'
import { formatDate, mpiColor, readableTextOn } from '@/lib/ui/scale'
import { useIsHydrated } from '@/lib/ui/useIsHydrated'
import { useAuth } from '@/lib/auth/context'
import { useDiarySync } from '@/lib/sync/useDiarySync'
import Link from 'next/link'

const TREE_LABELS: Readonly<Record<TreeSpecies, string>> = {
  faggio: 'faggio',
  abete: 'abete',
  castagno: 'castagno',
  cerro: 'cerro',
  leccio: 'leccio',
}

const SYNC_LABEL: Readonly<Record<string, string>> = {
  local: 'Salvato sul dispositivo',
  syncing: 'Sincronizzazione in corso…',
  synced: 'Sincronizzato',
  error: 'Errore di sincronizzazione',
}

/**
 * Il diario.
 *
 * Non è un quaderno di ricordi: è il materiale con cui il modello impara. Per questo ogni voce
 * congela il punteggio previsto quel giorno, e per questo la calibrazione sta nella stessa
 * schermata — così si vede subito a cosa servono le uscite registrate.
 */
export function DiaryScreen({ snapshot }: { snapshot: Snapshot }) {
  const hydrated = useIsHydrated()
  // Il repository si crea al primo render nel browser, non dentro un effetto: `createDiaryRepository`
  // tocca IndexedDB, che sul server non esiste.
  const created = useMemo(
    () => (hydrated ? createDiaryRepository() : null),
    [hydrated],
  )
  const repo: DiaryRepository | null = created?.repo ?? null
  const persistent = created?.persistent ?? true
  // I punti salvati sono un archivio indipendente da quello delle voci (vedi il commento in
  // `lib/waypoints/types.ts`): vivono comunque solo nel browser, stessa regola di creazione
  // post-idratazione, e non entrano mai nella sincronizzazione.
  const waypointRepo: WaypointRepository | null = useMemo(
    () => (hydrated ? createWaypointRepository() : null),
    [hydrated],
  )
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const auth = useAuth()
  const diarySync = useDiarySync(repo)

  const reload = useCallback(async () => {
    if (repo === null) return
    setEntries(await repo.list())
  }, [repo])

  // Ogni modifica prova a sincronizzare subito, se c'è un account collegato: è il modo con cui
  // "salvato sul dispositivo" diventa "sincronizzato" senza che l'utente debba pensarci.
  const persistAndReload = useCallback(async () => {
    await reload()
    if (auth.status === 'signed-in') {
      await diarySync.sync()
      await reload()
    }
  }, [reload, auth.status, diarySync])

  useEffect(() => {
    if (repo === null) return
    // L'aggiornamento è asincrono, quindi non provoca il render a cascata che la regola
    // `set-state-in-effect` intercetta.
    //
    // In caso di errore l'elenco resta vuoto ma il motivo va detto: mostrare "nessuna uscita" a
    // chi non riesce ad aprire l'archivio significa annunciargli che ha perso il diario.
    void repo
      .list()
      .then(setEntries)
      .catch((error: unknown) => {
        setEntries([])
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Non riesco ad aprire il diario salvato su questo dispositivo.',
        )
      })
  }, [repo])

  const report = useMemo(() => calibrate(entries ?? []), [entries])

  const handleExport = (): void => {
    if (entries === null || entries.length === 0) return
    const blob = new Blob([JSON.stringify(toExport(entries), null, 1)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `diario-fungicast-${snapshot.referenceDate}.json`
    link.click()
    URL.revokeObjectURL(url)
    setMessage(`Esportate ${entries.length} uscite.`)
  }

  const handleImport = async (file: File): Promise<void> => {
    if (repo === null) return
    try {
      const result = await importInto(repo, JSON.parse(await file.text()))
      await persistAndReload()
      setMessage(
        `Importate ${result.imported} uscite, ${result.skipped} già presenti` +
          (result.errors.length > 0 ? `, ${result.errors.length} righe illeggibili` : '') +
          '.',
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'File non leggibile.')
    }
  }

  if (entries === null) return <Loading />

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-4">
      <header className="mb-3">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Diario uscite</h1>
          {auth.status === 'signed-in' && (
            <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-edge bg-surface-1 px-2 py-1 text-xs font-medium text-ink-dim">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  diarySync.status === 'synced'
                    ? 'bg-accent'
                    : diarySync.status === 'error'
                      ? 'bg-danger'
                      : diarySync.status === 'syncing'
                        ? 'bg-warn'
                        : 'bg-ink-faint'
                }`}
                aria-hidden="true"
              />
              {SYNC_LABEL[diarySync.status]}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm leading-snug text-ink-dim">
          Registra com&apos;è andata. Ogni uscita congela il punteggio che il modello prevedeva
          quel giorno: è l&apos;unico modo per sapere se il punteggio predice qualcosa.
        </p>
      </header>

      {!persistent && (
        <p className="mb-3 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs leading-snug text-warn">
          Questo browser non permette di salvare dati: le uscite resteranno solo finché la pagina è
          aperta. Esportale prima di chiudere.
        </p>
      )}

      {loadError !== null && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-snug text-danger"
        >
          <strong className="font-semibold">Il diario non si è aperto.</strong> {loadError}
          <span className="mt-1 block text-ink-dim">
            Le uscite salvate non sono perse: restano sul dispositivo e ricompaiono appena
            l&apos;archivio si apre.
          </span>
        </div>
      )}

      <div className="mb-4">
        <WaypointsPanel
          entryId={null}
          scope="fixed"
          title="Punti fissi"
          description="i riferimenti che riusi sempre: casa, il parcheggio abituale, un accesso al bosco"
          emptyText="Nessun punto fisso. Qui vanno i luoghi che valgono per tutte le uscite, non per
                      una sola. Un punto di tipo «Partenza» salvato qui compare anche in «Dove vado
                      oggi», per calcolare la distanza. Resta solo su questo dispositivo, non viene
                      mai sincronizzato."
        />
      </div>

      {message !== null && (
        <p
          role="status"
          className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-dim"
        >
          {message}
        </p>
      )}

      {composing && repo !== null ? (
        <EntryForm
          snapshot={snapshot}
          onCancel={() => { setComposing(false) }}
          onSave={async (draft) => {
            await repo.add(draft)
            await persistAndReload()
            setComposing(false)
            setMessage('Uscita registrata.')
          }}
        />
      ) : composing ? null : (
        <button
          type="button"
          onClick={() => { setComposing(true) }}
          className="min-h-12 w-full rounded-xl border border-accent/40 bg-accent/15 text-sm
                     font-semibold text-ink transition-colors hover:bg-accent/25
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Registra un&apos;uscita
        </button>
      )}

      <div className="mt-4">
        <CalibrationPanel report={report} />
      </div>

      {entries.length > 0 && (
        <>
          <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {entries.length} {entries.length === 1 ? 'uscita' : 'uscite'}
          </h2>
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id}>
                <EntryRow
                  entry={entry}
                  zoneName={zoneNameFor(entry, snapshot)}
                  onDelete={async () => {
                    // A differenza di `onSave` (avvolto da `EntryForm.submit`, che ne cattura gli
                    // errori), questo `onClick` non ha nessun chiamante che lo faccia per lui: senza
                    // questo try/catch, un archivio bloccato a metà cancellazione lascerebbe la voce
                    // marcata cancellata sul disco ma ancora visibile in lista, senza alcun avviso.
                    try {
                      await repo?.remove(entry.id)
                      await waypointRepo?.removeAllFor(entry.id)
                      await persistAndReload()
                      setMessage('Uscita eliminata.')
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? `Uscita non eliminata: ${error.message}`
                          : 'Uscita non eliminata: archivio non disponibile su questo dispositivo.',
                      )
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="mt-5 rounded-xl border border-edge bg-surface-1 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          I tuoi dati
        </h2>
        {auth.status === 'signed-in' && diarySync.accountMismatch ? (
          <p className="mt-1.5 text-xs leading-snug text-warn">
            Queste uscite sono sincronizzate con un account diverso da quello collegato ora: non
            le ho inviate in automatico. Vai in{' '}
            <Link href="/account" className="underline underline-offset-2 hover:text-ink">
              Account
            </Link>{' '}
            per decidere cosa farne, prima di aggiungerne di nuove qui.
          </p>
        ) : auth.status === 'signed-in' ? (
          <p className="mt-1.5 text-xs leading-snug text-ink-dim">
            Sincronizzato con il tuo account: ritrovi queste uscite su ogni dispositivo dove
            accedi. I punti salvati (auto, accessi, punti di partenza) restano invece solo su
            questo dispositivo — non fanno parte della sincronizzazione. L&apos;esportazione resta
            utile come copia di sicurezza portabile del diario.
          </p>
        ) : auth.status === 'unavailable' ? (
          <p className="mt-1.5 text-xs leading-snug text-ink-dim">
            Il diario sta <strong className="text-ink">su questo dispositivo</strong> e non viene
            inviato da nessuna parte: questo deploy non ha la sincronizzazione configurata.
            L&apos;esportazione è l&apos;unico modo per non perdere le uscite cambiando telefono.
          </p>
        ) : (
          <p className="mt-1.5 text-xs leading-snug text-ink-dim">
            Il diario sta <strong className="text-ink">su questo dispositivo</strong>.{' '}
            <Link href="/account" className="underline underline-offset-2 hover:text-ink">
              Accedi
            </Link>{' '}
            per ritrovarlo anche sugli altri, oppure esportalo come copia di sicurezza.
          </p>
        )}
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={entries.length === 0}
            className="min-h-11 flex-1 rounded-lg border border-edge bg-surface-2 text-sm
                       font-medium text-ink transition-colors hover:bg-surface-3
                       disabled:opacity-40 focus:outline-none focus-visible:ring-2
                       focus-visible:ring-accent"
          >
            Esporta
          </button>
          <button
            type="button"
            onClick={() => { fileRef.current?.click() }}
            className="min-h-11 flex-1 rounded-lg border border-edge bg-surface-2 text-sm
                       font-medium text-ink transition-colors hover:bg-surface-3
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Importa
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="File del diario da importare"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file !== undefined) void handleImport(file)
              event.target.value = ''
            }}
          />
        </div>
      </section>
    </div>
  )
}

/**
 * Nome della zona da mostrare per una voce.
 *
 * Le voci salvate prima che esistesse `zoneName` arrivano dalla normalizzazione con il codice al
 * posto del nome (`normaliseEntry`), e in elenco si leggevano come "amiata · lun 1 set". Il nome
 * lo ripesca lo snapshot; per le voci che un nome ce l'hanno resta quello congelato al momento
 * dell'uscita, perché è il nome che la zona aveva quel giorno.
 */
function zoneNameFor(entry: DiaryEntry, snapshot: Snapshot): string {
  if (entry.zoneName !== entry.zoneCode && entry.zoneName !== '') return entry.zoneName
  return snapshot.zones.find((z) => z.code === entry.zoneCode)?.name ?? entry.zoneCode
}

function EntryRow({
  entry,
  zoneName,
  onDelete,
}: {
  entry: DiaryEntry
  zoneName: string
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <article className="rounded-xl border border-edge bg-surface-1 p-3">
      <div className="flex items-start gap-3">
        {entry.mpiAtEntry !== null ? (
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg"
            style={{
              backgroundColor: mpiColor(entry.mpiAtEntry),
              color: readableTextOn(entry.mpiAtEntry),
            }}
            title="Punteggio previsto quel giorno"
          >
            <span className="tabular text-sm font-semibold">{entry.mpiAtEntry.toFixed(0)}</span>
          </div>
        ) : (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-faint">
            <span className="text-sm">—</span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {zoneName} · <span className="text-ink-dim">{formatDate(entry.date)}</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-dim">
            trovati: <strong className="text-ink">{ABUNDANCE_LABELS[entry.abundance]}</strong>
            {entry.elevationM !== null && <> · {entry.elevationM} m</>}
            {entry.durationMinutes !== null && <> · {entry.durationMinutes} min</>}
            {entry.searchers !== null && (
              <> · {entry.searchers} {entry.searchers === 1 ? 'persona' : 'persone'}</>
            )}
          </p>
          {entry.positionSource === 'gps' && (
            <p className="mt-0.5 text-xs text-ink-faint">
              posizione GPS salvata, puoi ritrovare il punto
            </p>
          )}
          {entry.trees.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1">
              {entry.trees.map((species) => (
                <li
                  key={species}
                  className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-dim"
                >
                  {TREE_LABELS[species]}
                </li>
              ))}
            </ul>
          )}
          {entry.notes !== '' && (
            <p className="mt-1 text-xs leading-snug text-ink-faint">{entry.notes}</p>
          )}
        </div>

        {confirming ? (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={onDelete}
              className="min-h-11 rounded-lg px-2 text-xs font-medium text-danger
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
            >
              elimina
            </button>
            <button
              type="button"
              onClick={() => { setConfirming(false) }}
              className="min-h-11 rounded-lg px-2 text-xs text-ink-faint focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-accent"
            >
              annulla
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setConfirming(true) }}
            aria-label={`Elimina l'uscita del ${entry.date}`}
            className="min-h-11 shrink-0 rounded-lg px-2 text-ink-faint transition-colors
                       hover:text-danger focus:outline-none focus-visible:ring-2
                       focus-visible:ring-accent"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="mt-2.5">
        <WaypointsPanel
          entryId={entry.id}
          scope="outing"
          title="Punti di questa uscita"
          description="dove hai lasciato l'auto, da dove sei entrato, un bivio di questa camminata"
          emptyText="Nessun punto per questa uscita. Salva qui l'auto, l'accesso al bosco o un
                      riferimento: spariranno insieme all'uscita quando la cancelli."
          /*
           * Niente "Partenza" qui, di proposito: un punto di partenza legato a un'uscita avrebbe
           * un `entryId`, quindi `departurePoints()` (che cerca solo i punti fissi) non lo
           * troverebbe mai e non comparirebbe in "Dove vado oggi" — e sparirebbe insieme
           * all'uscita quando la cancelli. Chi vuole un punto di partenza riusabile lo salva fra
           * i "Punti fissi", dove quella promessa è vera.
           */
          kinds={['car', 'access', 'reference']}
        />
      </div>
    </article>
  )
}

function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4" aria-busy="true" aria-live="polite">
      <div className="h-7 w-40 animate-pulse rounded bg-surface-2" />
      <div className="mt-2 h-4 w-full animate-pulse rounded bg-surface-2" />
      <div className="mt-4 h-12 w-full animate-pulse rounded-xl bg-surface-2" />
      <span className="sr-only">Carico il diario…</span>
    </div>
  )
}
