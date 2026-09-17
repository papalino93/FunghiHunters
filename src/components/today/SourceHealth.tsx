'use client'

import type { Snapshot } from '@/lib/snapshot/types'
import { formatDate } from '@/lib/ui/scale'

/**
 * Stato delle fonti.
 *
 * Una fonte che smette di rispondere non deve degradare in silenzio: senza questo pannello, se il
 * SIR non risponde lo snapshot esce con meno stazioni, la confidence cala di qualche punto e
 * nessuno se ne accorge. Qui lo stato è dichiarato, con quanti dati sono arrivati davvero.
 */
export function SourceHealth({ snapshot }: { snapshot: Snapshot }) {
  const ageDays = daysSince(snapshot.referenceDate)
  const stale = ageDays > 1

  return (
    <section className="rounded-xl border border-edge bg-surface-1 p-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        Dati e fonti
      </h2>

      <p className={`mt-1.5 text-xs ${stale ? 'text-warn' : 'text-ink-dim'}`}>
        {stale
          ? `Ultimo calcolo ${ageDays} giorni fa (${formatDate(snapshot.referenceDate)}): i numeri potrebbero non riflettere il meteo recente.`
          : `Calcolato il ${formatDate(snapshot.referenceDate)} · modello ${snapshot.algorithmVersion}`}
      </p>

      <ul className="mt-2 space-y-1.5">
        {snapshot.sources.map((source) => (
          <li key={source.name} className="flex items-start gap-2 text-[11px] leading-snug">
            <span
              aria-hidden="true"
              className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                source.status === 'ok'
                  ? 'bg-accent'
                  : source.status === 'degraded'
                    ? 'bg-warn'
                    : 'bg-danger'
              }`}
            />
            <span className="min-w-0">
              <span className="text-ink-dim">{source.name}</span>
              <span className="block text-ink-faint">
                {statusLabel(source.status)} · {source.coverage} · licenza {source.license}
                {source.lastUpdate !== null && <> · dato al {source.lastUpdate}</>}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 border-t border-edge pt-2 text-[11px] leading-snug text-ink-faint">
        {snapshot.uncalibratedParams.length} parametri del modello non hanno ancora una fonte in
        letteratura e sono dichiarati da calibrare. Compaiono marcati così anche nella spiegazione
        dei punteggi.
      </p>
    </section>
  )
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ok':
      return 'risponde'
    case 'degraded':
      return 'risponde solo in parte'
    default:
      return 'non raggiungibile'
  }
}

function daysSince(date: string): number {
  const then = Date.parse(`${date}T12:00:00Z`)
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000))
}
