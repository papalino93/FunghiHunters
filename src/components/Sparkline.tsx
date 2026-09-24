'use client'

import { mpiBandColor } from '@/lib/ui/scale'
import type { SnapshotSeriesPoint } from '@/lib/snapshot/types'

export interface SparklineProps {
  readonly points: readonly SnapshotSeriesPoint[]
  readonly todayDate: string
  readonly selectedDate: string
  readonly height?: number
}

/**
 * Andamento dell'MPI nel tempo.
 *
 * Il passato e il futuro sono disegnati diversamente — pieno contro tratteggiato — perche' sono
 * cose diverse e mescolarle su un'unica linea continua e' il modo piu' comune di far credere a
 * una previsione quanto a una misura.
 *
 * **Puramente illustrativo, non un secondo modo di cambiare giorno.** I punti erano cliccabili,
 * ma solo col mouse: `<circle>` non e' raggiungibile da tastiera ne' annunciato da uno screen
 * reader, e l'area sensibile reale (raggio 1.6-3.2 in un viewBox 100x64) e' ben sotto ogni
 * bersaglio di tocco dell'app. `TimeSlider`, sempre visibile insieme a questo grafico (vedi
 * `AppShell.tsx`), copre esattamente la stessa selezione con un `<input type="range">` gia'
 * accessibile: aggiungere qui una seconda via, solo parzialmente accessibile, sarebbe un
 * doppione peggiore dell'originale, non un miglioramento.
 */
export function Sparkline({
  points,
  todayDate,
  selectedDate,
  height = 64,
}: SparklineProps) {
  if (points.length < 2) return null

  const width = 100
  const max = Math.max(20, ...points.map((p) => p.mpi))
  const x = (index: number): number => (index / (points.length - 1)) * width
  const y = (mpi: number): number => height - (mpi / max) * (height - 8) - 4

  const todayIndex = points.findIndex((p) => p.date === todayDate)
  const splitIndex = todayIndex < 0 ? points.length - 1 : todayIndex

  const toPath = (slice: readonly SnapshotSeriesPoint[], offset: number): string =>
    slice
      .map((point, i) => `${i === 0 ? 'M' : 'L'} ${x(i + offset).toFixed(2)} ${y(point.mpi).toFixed(2)}`)
      .join(' ')

  const pastPath = toPath(points.slice(0, splitIndex + 1), 0)
  const futurePath = toPath(points.slice(splitIndex), splitIndex)
  const selectedIndex = points.findIndex((p) => p.date === selectedDate)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-16 w-full"
      role="img"
      aria-label="Andamento dell'indice nel tempo"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path
        d={`${pastPath} L ${x(splitIndex).toFixed(2)} ${height} L 0 ${height} Z`}
        fill="url(#spark-fill)"
      />
      <path d={pastPath} fill="none" stroke="var(--accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <path
        d={futurePath}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
        opacity="0.75"
      />

      {/* Riferimento di oggi: separa cio' che e' successo da cio' che potrebbe succedere. */}
      <line
        x1={x(splitIndex)}
        y1="0"
        x2={x(splitIndex)}
        y2={height}
        stroke="var(--border-strong)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />

      {points.map((point, index) => (
        <circle
          key={point.date}
          cx={x(index)}
          cy={y(point.mpi)}
          r={index === selectedIndex ? 3.2 : 1.6}
          fill={mpiBandColor(point.mpi)}
          stroke={index === selectedIndex ? 'var(--text-primary)' : 'none'}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}
