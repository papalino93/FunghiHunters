import Link from 'next/link'

import { bandNameFor } from '@/lib/recommend/verdict'
import type { WeekendDay } from '@/lib/recommend/weekend'
import { formatDate, mpiBandColor, mpiBandInk } from '@/lib/ui/scale'

/**
 * Il fine settimana in un riquadro: per sabato e domenica le tre zone migliori, con il punteggio
 * di quel giorno e il collegamento alla mappa già su quel giorno. Vedi `lib/recommend/weekend.ts`.
 */
export function WeekendCard({
  days,
  mapHref,
  modelOnly,
}: {
  days: readonly WeekendDay[]
  mapHref: (code: string, date: string) => string
  /** Zone di solo modello: il bollettino lo dice, come il verdetto. */
  modelOnly: boolean
}) {
  if (days.length === 0 || days.every((d) => d.best.length === 0)) return null

  return (
    <section aria-labelledby="fine-settimana" className="mt-5 rounded-xl border border-edge bg-surface-1 p-3.5">
      <h2 id="fine-settimana" className="text-base font-semibold text-ink">
        Il fine settimana
      </h2>
      <p className="mt-0.5 text-xs text-ink-faint">
        Le zone migliori di sabato e domenica secondo il modello
        {modelOnly ? ' (anteprima, senza stazioni)' : ''}.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {days.map((day) => (
          <div key={day.date}>
            <p className="text-sm font-semibold text-ink">{formatDate(day.date)}</p>
            <ol className="mt-1.5 space-y-1.5">
              {day.best.map(({ zone, mpi }) => (
                <li key={zone.code}>
                  <Link
                    href={mapHref(zone.code, day.date)}
                    className="flex min-h-11 items-center gap-2 rounded-lg bg-surface-2 px-2.5 text-sm
                               text-ink transition-colors hover:bg-surface-3 focus:outline-none
                               focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span
                      className="tabular grid h-7 w-9 shrink-0 place-items-center rounded-md text-xs font-semibold"
                      style={{ backgroundColor: mpiBandColor(mpi), color: mpiBandInk(mpi) }}
                    >
                      {mpi.toFixed(0)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{zone.name}</span>
                    <span className="shrink-0 text-xs text-ink-faint">{bandNameFor(mpi)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  )
}
