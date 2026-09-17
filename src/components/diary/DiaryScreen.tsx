'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Snapshot } from '@/lib/snapshot/types'
import type { DiaryEntry } from '@/lib/diary/types'
import { ABUNDANCE_LABELS } from '@/lib/diary/types'
import {
  createDiaryRepository,
  importInto,
  toExport,
  type DiaryRepository,
} from '@/lib/diary/store'
import { calibrate } from '@/lib/diary/calibration'
import { EntryForm } from '@/components/diary/EntryForm'
import { CalibrationPanel } from '@/components/diary/CalibrationPanel'
import { formatDate, mpiColor, readableTextOn } from '@/lib/ui/scale'
import { useIsHydrated } from '@/lib/ui/useIsHydrated'

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
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null)
  const [composing, setComposing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    if (repo === null) return
    setEntries(await repo.list())
  }, [repo])

  useEffect(() => {
    if (repo === null) return
    // L'aggiornamento è asincrono, quindi non provoca il render a cascata che la regola
    // `set-state-in-effect` intercetta.
    void repo.list().then(setEntries).catch(() => { setEntries([]) })
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
      await reload()
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
        <h1 className="text-xl font-semibold tracking-tight text-ink">Diario uscite</h1>
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

      {message !== null && (
        <p
          role="status"
          className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-dim"
        >
          {message}
        </p>
      )}

      {composing ? (
        <EntryForm
          snapshot={snapshot}
          onCancel={() => { setComposing(false) }}
          onSave={async (draft) => {
            await repo?.add(draft)
            await reload()
            setComposing(false)
            setMessage('Uscita registrata.')
          }}
        />
      ) : (
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
          <h2 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {entries.length} {entries.length === 1 ? 'uscita' : 'uscite'}
          </h2>
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id}>
                <EntryRow
                  entry={entry}
                  onDelete={async () => {
                    await repo?.remove(entry.id)
                    await reload()
                    setMessage('Uscita eliminata.')
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="mt-5 rounded-xl border border-edge bg-surface-1 p-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          I tuoi dati
        </h2>
        <p className="mt-1.5 text-xs leading-snug text-ink-dim">
          Il diario sta <strong className="text-ink">su questo dispositivo</strong> e non viene
          inviato da nessuna parte. Non c&apos;è un server a cui mandarlo: la sincronizzazione fra
          telefono e computer richiede un progetto Supabase collegato, che non è ancora attivo.
          Finché non lo è, l&apos;esportazione è l&apos;unico modo per non perdere le uscite.
        </p>
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

function EntryRow({ entry, onDelete }: { entry: DiaryEntry; onDelete: () => void }) {
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
            {entry.zoneName} · <span className="text-ink-dim">{formatDate(entry.date)}</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-dim">
            trovati: <strong className="text-ink">{ABUNDANCE_LABELS[entry.abundance]}</strong>
            {entry.elevationM !== null && <> · {entry.elevationM} m</>}
          </p>
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
