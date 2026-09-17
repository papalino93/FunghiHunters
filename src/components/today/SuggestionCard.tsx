'use client'

import Link from 'next/link'

import type { Suggestion } from '@/lib/recommend/rank'
import { confidenceOpacity, formatDate, isLowConfidence, mpiColor, readableTextOn } from '@/lib/ui/scale'

/**
 * Una proposta, leggibile in due secondi.
 *
 * La gerarchia è: quanto vale, dov'è, cosa la frena, quando conviene. In quest'ordine perché è
 * l'ordine in cui si decide. I fattori stanno in chiaro e non dietro un tocco: se l'utente deve
 * aprire un pannello per sapere perché, la scheda non ha fatto il suo lavoro.
 */
export function SuggestionCard({
  suggestion,
  rank,
  today,
  timing,
}: {
  suggestion: Suggestion
  rank: number
  today: string
  timing: string
}) {
  const { zone, mpi, distanceKm, trend72h, bestDay } = suggestion
  const point = zone.series.find((p) => p.date === today)
  const low = isLowConfidence(suggestion.confidence)

  return (
    <article className="rounded-xl border border-edge bg-surface-1 p-3">
      <div className="flex items-start gap-3">
        <div
          className={`grid h-16 w-16 shrink-0 place-items-center rounded-xl border ${low ? 'hatched' : ''}`}
          style={{
            backgroundColor: mpiColor(mpi),
            color: readableTextOn(mpi),
            opacity: confidenceOpacity(suggestion.confidence),
            borderColor: low ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
            borderStyle: low ? 'dashed' : 'solid',
          }}
        >
          <span className="tabular text-2xl font-semibold leading-none">{mpi.toFixed(0)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="tabular text-[11px] font-semibold text-ink-faint">{rank}</span>
            <h2 className="truncate text-base font-semibold leading-tight text-ink">{zone.name}</h2>
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-dim">
            {distanceKm !== null && <>{distanceKm.toFixed(0)} km · </>}
            {zone.elevationM} m · {zone.forest.join(', ')}
          </p>
          <p className="mt-1 text-sm font-medium text-ink">{zone.label}</p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <Metric
          label="Dati"
          value={`${zone.dataQuality.toFixed(0)}`}
          hint="osservazioni"
        />
        <Metric
          label="Previsione"
          value={`${(point?.forecastCertainty ?? zone.forecastCertainty).toFixed(0)}`}
          hint="del giorno"
        />
        <Metric
          label="72 ore"
          value={formatTrend(trend72h)}
          hint="andamento"
        />
      </dl>

      <ul className="mt-2.5 space-y-1">
        {suggestion.reasons.slice(0, 3).map((reason) => (
          <li key={reason} className="flex gap-1.5 text-xs leading-snug text-ink-dim">
            <span aria-hidden="true" className="text-ink-faint">
              ·
            </span>
            {reason}
          </li>
        ))}
      </ul>

      <p className="mt-2.5 rounded-lg bg-surface-2 px-2.5 py-2 text-xs leading-snug text-ink-dim">
        {timing}
        {bestDay !== null && bestDay.date !== today && (
          <> Il massimo previsto è {bestDay.mpi.toFixed(0)} il {formatDate(bestDay.date)}.</>
        )}
      </p>

      <Link
        href={`/mappa?zona=${zone.code}`}
        className="mt-2.5 flex min-h-11 items-center justify-center rounded-lg border border-edge
                   bg-surface-2 text-sm font-medium text-ink transition-colors hover:bg-surface-3
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Vedi sulla mappa e perché
      </Link>
    </article>
  )
}

/** Una variazione sotto il mezzo punto è rumore, e va detta come tale invece che arrotondata a "-0". */
function formatTrend(value: number): string {
  if (Math.abs(value) < 0.5) return 'stabile'
  return `${value > 0 ? '+' : ''}${value.toFixed(0)}`
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-1.5 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-semibold text-ink">{value}</dd>
      <p className="truncate text-[10px] text-ink-faint">{hint}</p>
    </div>
  )
}
