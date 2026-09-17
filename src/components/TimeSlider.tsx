'use client'

import { formatDate, provenanceLabel } from '@/lib/ui/scale'

export interface TimeSliderProps {
  readonly dates: readonly string[]
  readonly selectedDate: string
  readonly todayDate: string
  readonly onChange: (date: string) => void
  /** Provenienza del giorno selezionato, per dire se e' misura o previsione. */
  readonly provenance: string
}

/**
 * Cursore temporale da -14 a +7 giorni.
 *
 * Il passato e il futuro non si equivalgono, e lo slider lo dice: il segmento dei giorni gia'
 * trascorsi e' pieno, quello previsto e' tratteggiato, e sotto compare sempre l'etichetta della
 * provenienza. Uno slider che scorre uniforme farebbe credere che i giorni a destra valgano
 * quanto quelli a sinistra.
 */
export function TimeSlider({
  dates,
  selectedDate,
  todayDate,
  onChange,
  provenance,
}: TimeSliderProps) {
  const index = Math.max(0, dates.indexOf(selectedDate))
  const todayIndex = Math.max(0, dates.indexOf(todayDate))
  const todayPercent = dates.length < 2 ? 0 : (todayIndex / (dates.length - 1)) * 100
  const isFuture = index > todayIndex

  return (
    <div className="pointer-events-auto rounded-xl border border-edge bg-surface-1/95 px-3 py-2 backdrop-blur-xl">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">{formatDate(selectedDate)}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              provenance === 'OBSERVED' ? 'bg-accent' : isFuture ? 'bg-warn' : 'bg-ink-faint'
            }`}
            aria-hidden="true"
          />
          {provenanceLabel(provenance)}
        </span>
      </div>

      <div className="relative mt-2">
        {/* Binario: pieno fino a oggi, tratteggiato dopo. */}
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full">
          <div className="h-full bg-edge-strong" style={{ width: `${todayPercent}%` }} />
          <div
            className="absolute top-0 h-full opacity-60"
            style={{
              left: `${todayPercent}%`,
              right: 0,
              backgroundImage:
                'repeating-linear-gradient(90deg, var(--border-strong) 0 4px, transparent 4px 8px)',
            }}
          />
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0, dates.length - 1)}
          value={index}
          onChange={(event) => {
            const next = dates[Number(event.target.value)]
            if (next !== undefined) onChange(next)
          }}
          aria-label="Giorno da visualizzare"
          className="relative w-full cursor-pointer appearance-none bg-transparent
                     [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface-1
                     [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:shadow
                     [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4
                     [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2
                     [&::-moz-range-thumb]:border-surface-1 [&::-moz-range-thumb]:bg-ink"
        />
      </div>

      <div className="mt-0.5 flex justify-between text-[10px] text-ink-faint">
        <span>{formatDate(dates[0] ?? todayDate)}</span>
        <button
          type="button"
          onClick={() => { onChange(todayDate) }}
          className="rounded px-1.5 py-0.5 font-medium text-ink-dim transition-colors
                     hover:bg-surface-2 hover:text-ink focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-accent"
        >
          oggi
        </button>
        <span>{formatDate(dates[dates.length - 1] ?? todayDate)}</span>
      </div>
    </div>
  )
}
