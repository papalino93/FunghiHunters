'use client'

import { useState } from 'react'

import type { Snapshot } from '@/lib/snapshot/types'
import {
  ABUNDANCE_LABELS,
  ABUNDANCE_LEVELS,
  PRIVACY_LABELS,
  PRIVACY_LEVELS,
  type Abundance,
  type DiaryDraft,
  type PrivacyLevel,
} from '@/lib/diary/types'

/**
 * Registrazione di un'uscita.
 *
 * Deve chiudersi in pochi tocchi, perché si compila in macchina al ritorno, non a tavolino. Il
 * campo che conta davvero è uno solo — quanto hai trovato — e infatti è l'unico obbligatorio.
 *
 * Il punteggio previsto non si chiede all'utente: si legge dallo snapshot per quella zona e quel
 * giorno, e si congela. Chiederlo sarebbe assurdo e lasciarlo fuori renderebbe la voce inutile
 * alla calibrazione.
 */
export function EntryForm({
  snapshot,
  onSave,
  onCancel,
}: {
  snapshot: Snapshot
  onSave: (draft: DiaryDraft) => Promise<void>
  onCancel: () => void
}) {
  const [date, setDate] = useState(snapshot.referenceDate)
  const [zoneCode, setZoneCode] = useState(snapshot.zones[0]?.code ?? '')
  const [abundance, setAbundance] = useState<Abundance | null>(null)
  const [elevation, setElevation] = useState('')
  const [notes, setNotes] = useState('')
  const [privacy, setPrivacy] = useState<PrivacyLevel>('area')
  const [saving, setSaving] = useState(false)

  const zone = snapshot.zones.find((z) => z.code === zoneCode)
  // Il punteggio di quel giorno, se lo snapshot lo copre. Fuori finestra resta null, ed è
  // corretto: inventarlo renderebbe la calibrazione una finzione.
  const point = zone?.series.find((p) => p.date === date)

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (abundance === null || zone === undefined) return
    setSaving(true)
    await onSave({
      date,
      zoneCode: zone.code,
      zoneName: zone.name,
      abundance,
      elevationM: elevation === '' ? null : Number(elevation),
      notes: notes.trim(),
      latitude: zone.latitude,
      longitude: zone.longitude,
      privacy,
      mpiAtEntry: point?.mpi ?? null,
      confidenceAtEntry: point?.confidence ?? null,
      algorithmVersionAtEntry: point === undefined ? null : snapshot.algorithmVersion,
    })
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-edge bg-surface-1 p-3">
      <div className="space-y-4">
        <Field label="Quando" htmlFor="entry-date">
          <input
            id="entry-date"
            type="date"
            value={date}
            max={snapshot.referenceDate}
            onChange={(e) => { setDate(e.target.value) }}
            className="min-h-11 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm
                       text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </Field>

        <Field label="Dove" htmlFor="entry-zone">
          <select
            id="entry-zone"
            value={zoneCode}
            onChange={(e) => { setZoneCode(e.target.value) }}
            className="min-h-11 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm
                       text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {snapshot.zones.map((z) => (
              <option key={z.code} value={z.code}>
                {z.name} — {z.reference}
              </option>
            ))}
          </select>
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Quanti ne hai trovati
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {ABUNDANCE_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => { setAbundance(level) }}
                aria-pressed={abundance === level}
                className={`min-h-11 flex-1 rounded-lg border px-2 text-xs font-medium
                            transition-colors focus:outline-none focus-visible:ring-2
                            focus-visible:ring-accent ${
                              abundance === level
                                ? 'border-accent bg-accent/15 text-ink'
                                : 'border-edge bg-surface-2 text-ink-dim hover:text-ink'
                            }`}
              >
                {ABUNDANCE_LABELS[level]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
            Una scala grossolana basta: serve a ordinare gli esiti, non a pesare il raccolto.
          </p>
        </fieldset>

        <Field label="Quota indicativa" htmlFor="entry-elevation" optional>
          <input
            id="entry-elevation"
            type="number"
            inputMode="numeric"
            placeholder={zone === undefined ? '' : String(zone.elevationM)}
            value={elevation}
            onChange={(e) => { setElevation(e.target.value) }}
            className="min-h-11 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm
                       text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </Field>

        <Field label="Note" htmlFor="entry-notes" optional>
          <textarea
            id="entry-notes"
            rows={2}
            value={notes}
            onChange={(e) => { setNotes(e.target.value) }}
            placeholder="tipo di bosco, esposizione, ora, quello che ti serve ricordare"
            className="w-full rounded-lg border border-edge bg-surface-2 px-3 py-2 text-sm
                       text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Precisione della posizione salvata
          </legend>
          <div className="flex gap-1.5">
            {PRIVACY_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => { setPrivacy(level) }}
                aria-pressed={privacy === level}
                className={`min-h-11 flex-1 rounded-lg border px-2 text-[11px] font-medium
                            transition-colors focus:outline-none focus-visible:ring-2
                            focus-visible:ring-accent ${
                              privacy === level
                                ? 'border-accent bg-accent/15 text-ink'
                                : 'border-edge bg-surface-2 text-ink-dim hover:text-ink'
                            }`}
              >
                {PRIVACY_LABELS[level]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
            L&apos;arrotondamento è definitivo: una volta salvata l&apos;area, le coordinate
            precise non esistono più.
          </p>
        </fieldset>

        <p className="rounded-lg bg-surface-2 px-2.5 py-2 text-[11px] leading-snug text-ink-faint">
          {point === undefined ? (
            <>
              Per questo giorno lo snapshot non ha un punteggio: la voce si salva comunque, ma non
              potrà servire alla calibrazione.
            </>
          ) : (
            <>
              Verrà congelato il punteggio previsto per quel giorno:{' '}
              <strong className="text-ink">{point.mpi.toFixed(0)}</strong> con affidabilità{' '}
              {point.confidence.toFixed(0)}, modello {snapshot.algorithmVersion}.
            </>
          )}
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={abundance === null || saving}
          className="min-h-12 flex-1 rounded-lg border border-accent/40 bg-accent/15 text-sm
                     font-semibold text-ink transition-colors hover:bg-accent/25
                     disabled:opacity-40 focus:outline-none focus-visible:ring-2
                     focus-visible:ring-accent"
        >
          {saving ? 'Salvo…' : 'Salva'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-12 rounded-lg border border-edge bg-surface-2 px-4 text-sm
                     font-medium text-ink-dim transition-colors hover:text-ink
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Annulla
        </button>
      </div>
      {abundance === null && (
        <p className="mt-2 text-center text-[11px] text-ink-faint">
          Scegli quanti ne hai trovati per salvare.
        </p>
      )}
    </form>
  )
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string
  htmlFor: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint"
      >
        {label}
        {optional === true && <span className="ml-1 normal-case tracking-normal">(facoltativo)</span>}
      </label>
      {children}
    </div>
  )
}
