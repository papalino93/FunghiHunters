'use client'

import { BANDS, bandNameFor } from '@/lib/recommend/verdict'
import { mpiColor } from '@/lib/ui/scale'

/**
 * La scala, invece del numero nudo.
 *
 * Un «24» da solo non ha riferimento. La barra mostra le cinque bande della scala e dove cade
 * questa zona: si capisce in un colpo d'occhio che è nella seconda su cinque, senza dover sapere
 * cosa significhi ventiquattro.
 *
 * Il valore numerico resta, piccolo e accanto al nome della banda, per chi vuole confrontare due
 * zone o riconoscere un cambiamento da un giorno all'altro.
 */
export function PotentialBar({
  mpi,
  showValue = true,
}: {
  mpi: number
  showValue?: boolean
}) {
  const clamped = Math.min(100, Math.max(0, mpi))
  const band = bandNameFor(clamped)

  return (
    <div>
      <div
        className="relative h-3 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={`Condizioni ${band}, ${clamped.toFixed(0)} su una scala da 0 a 100`}
      >
        {/* Le cinque bande, non un gradiente continuo: il confine fra "poco favorevoli" e
            "discrete" è un'informazione, e un gradiente lo nasconderebbe. */}
        <div className="flex h-full w-full">
          {BANDS.map((b, i) => (
            <div
              key={b.name}
              className="h-full flex-1 border-r border-surface-0 last:border-r-0"
              style={{ backgroundColor: mpiColor(i * 20 + 10), opacity: 0.35 }}
            />
          ))}
        </div>
        {/* Riempimento fino al valore, alla piena saturazione. */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${clamped}%`, backgroundColor: mpiColor(clamped) }}
        />
        {/* Il segno del valore: leggibile anche per chi non distingue i colori. */}
        <div
          className="absolute inset-y-0 w-0.5 bg-ink"
          style={{ left: `calc(${clamped}% - 1px)` }}
          aria-hidden="true"
        />
      </div>

      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">condizioni {band}</span>
        {showValue && (
          <span className="tabular text-xs text-ink-faint">{clamped.toFixed(0)}/100</span>
        )}
      </div>
    </div>
  )
}
