/**
 * Scala cromatica dell'MPI e rappresentazione della confidence.
 *
 * Due scelte deliberate.
 *
 * **Il colore non e' verde-marrone.** La scala e' una viridis-like: dal blu profondo al giallo
 * passando per il verde-acqua. E' percettivamente uniforme, leggibile da chi ha un deficit
 * cromatico, e legge come una mappa tecnica invece che come un cartello di agriturismo. Funziona
 * anche al sole, perche' la luminanza cresce monotonamente col punteggio: se il colore si perde,
 * resta comunque chiaro quale cella e' piu' alta.
 *
 * **La confidence non e' un secondo numero.** Un numero accanto a un altro numero non lo guarda
 * nessuno. La confidence si legge dalla **compattezza del riempimento**: piena quando e' alta,
 * visibilmente retinata quando e' bassa. Si capisce in mezzo secondo e non serve leggere due
 * cifre. Il valore numerico resta nel pannello di dettaglio, per chi lo vuole.
 */

/** Fermate della scala, dal punteggio piu' basso al piu' alto. */
const STOPS: ReadonlyArray<{ at: number; rgb: readonly [number, number, number] }> = [
  { at: 0, rgb: [38, 42, 66] },
  { at: 20, rgb: [49, 80, 118] },
  { at: 40, rgb: [43, 121, 131] },
  { at: 60, rgb: [59, 160, 112] },
  { at: 80, rgb: [141, 195, 76] },
  { at: 100, rgb: [243, 216, 63] },
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Colore della scala per un punteggio 0-100. */
export function mpiColor(mpi: number): string {
  const value = Math.min(100, Math.max(0, mpi))
  let lower = STOPS[0] as (typeof STOPS)[number]
  let upper = STOPS[STOPS.length - 1] as (typeof STOPS)[number]

  for (let i = 0; i < STOPS.length - 1; i += 1) {
    const current = STOPS[i]
    const next = STOPS[i + 1]
    if (current === undefined || next === undefined) continue
    if (value >= current.at && value <= next.at) {
      lower = current
      upper = next
      break
    }
  }

  const span = upper.at - lower.at
  const t = span === 0 ? 0 : (value - lower.at) / span
  const [r, g, b] = [0, 1, 2].map((i) =>
    Math.round(lerp(lower.rgb[i] ?? 0, upper.rgb[i] ?? 0, t)),
  ) as [number, number, number]

  return `rgb(${r}, ${g}, ${b})`
}

/** Le fermate come gradiente CSS, per le legende. */
export function mpiGradientCss(): string {
  return STOPS.map((stop) => `${mpiColor(stop.at)} ${stop.at}%`).join(', ')
}

/**
 * Traduce la confidence in opacita' del riempimento.
 *
 * Non scende sotto 0.35: una cella quasi trasparente sparirebbe dalla mappa, e "non lo so" e'
 * un'informazione da mostrare, non da nascondere.
 */
export function confidenceOpacity(confidence: number): number {
  const value = Math.min(100, Math.max(0, confidence))
  return 0.35 + 0.65 * (value / 100)
}

/** Sotto questa soglia la cella si disegna retinata invece che piena. */
export const LOW_CONFIDENCE_THRESHOLD = 55

export function isLowConfidence(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD
}

/**
 * Colore del testo che resta leggibile sopra il colore della scala.
 * Si decide dalla luminanza percepita, non a occhio.
 */
export function readableTextOn(mpi: number): string {
  const match = /rgb\((\d+), (\d+), (\d+)\)/.exec(mpiColor(mpi))
  if (match === null) return '#ffffff'
  const [r, g, b] = [match[1], match[2], match[3]].map((v) => Number(v ?? 0))
  const luminance = (0.299 * (r ?? 0) + 0.587 * (g ?? 0) + 0.114 * (b ?? 0)) / 255
  return luminance > 0.55 ? '#12151f' : '#f4f6fb'
}

/** Formatta un numero con l'unita', oppure un trattino quando il dato manca. */
export function formatValue(
  value: number | null | undefined,
  unit: string,
  decimals = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value.toFixed(decimals)} ${unit}`.trim()
}

/** Etichetta breve della provenienza, per i badge. */
export function provenanceLabel(provenance: string): string {
  switch (provenance) {
    case 'OBSERVED':
      return 'osservato'
    case 'REANALYSIS':
      return 'rianalisi'
    case 'MODELLED':
      return 'modellato'
    case 'FORECAST':
      return 'previsto'
    default:
      return provenance.toLowerCase()
  }
}

/** Data in forma breve leggibile, es. "sab 19 set". */
export function formatDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`)
  const days = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
  const months = [
    'gen',
    'feb',
    'mar',
    'apr',
    'mag',
    'giu',
    'lug',
    'ago',
    'set',
    'ott',
    'nov',
    'dic',
  ]
  return `${days[parsed.getUTCDay()] ?? ''} ${parsed.getUTCDate()} ${months[parsed.getUTCMonth()] ?? ''}`
}
