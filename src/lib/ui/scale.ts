/**
 * Scala cromatica dell'MPI e rappresentazione della confidence.
 *
 * Due scelte deliberate.
 *
 * **Da secco a fertile, e più inchiostro dove il punteggio è più alto.** Fino al 24/09/2026 la
 * scala era una viridis dal blu notte al giallo: sulla mappa scura andava bene, ma nel tema chiaro
 * comunicava al contrario — un 24 blu pieno sembrava "pesante", un 98 giallo su bianco (1,4:1)
 * quasi spariva, e la parte buona della barra era la meno visibile. Ora le scale sono due, una per
 * fondo: sul chiaro il valore alto è il più scuro, sullo scuro il più luminoso. In entrambe la
 * luminosità segue il punteggio, quindi si legge anche senza distinguere i colori.
 *
 * `mpiColor` (valore continuo, in RGB) serve alla mappa, che è sempre scura. Per l'interfaccia,
 * che cambia tema, `mpiBandColor` e `mpiBandInk` restituiscono variabili CSS definite in
 * `globals.css` per chiaro e scuro, a cinque gradini come le bande del punteggio.
 *
 * **La confidence non e' un secondo numero.** Un numero accanto a un altro numero non lo guarda
 * nessuno. La confidence si legge dalla **compattezza del riempimento**: piena quando e' alta,
 * visibilmente retinata quando e' bassa. Si capisce in mezzo secondo e non serve leggere due
 * cifre. Il valore numerico resta nel pannello di dettaglio, per chi lo vuole.
 */

/** Fermate della scala, dal punteggio piu' basso al piu' alto. */
const STOPS: ReadonlyArray<{ at: number; rgb: readonly [number, number, number] }> = [
  // Scala "notte di bosco", per la mappa scura: gli stessi valori di `--mpi-*` nel tema scuro.
  { at: 0, rgb: [59, 61, 51] },
  { at: 30, rgb: [110, 108, 69] },
  { at: 50, rgb: [143, 164, 90] },
  { at: 70, rgb: [125, 195, 119] },
  { at: 100, rgb: [189, 232, 143] },
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

/** Le cinque bande come gradiente CSS a gradini, per le legende: segue il tema dell'interfaccia. */
export function mpiGradientCss(): string {
  return [0, 1, 2, 3, 4]
    .map((i) => `var(--mpi-${i}) ${i * 20}% ${(i + 1) * 20}%`)
    .join(', ')
}

/** Il gradino della scala (0-4) di un punteggio, con gli stessi confini delle etichette. */
export function mpiBand(mpi: number): 0 | 1 | 2 | 3 | 4 {
  const value = Math.min(100, Math.max(0, mpi))
  return Math.min(4, Math.floor(value / 20)) as 0 | 1 | 2 | 3 | 4
}

/** Colore di fondo del gradino, come variabile CSS che cambia con il tema. */
export function mpiBandColor(mpi: number): string {
  return `var(--mpi-${mpiBand(mpi)})`
}

/** Colore del testo leggibile sopra `mpiBandColor`, per lo stesso tema. */
export function mpiBandInk(mpi: number): string {
  return `var(--mpi-ink-${mpiBand(mpi)})`
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
  // Virgola decimale, come si scrive in italiano («0,5 mm», non «0.5 mm»). Arrotondato come
  // prima da `toFixed`, per non cambiare nessun valore mostrato, solo il separatore.
  // `+ 0` toglie lo zero negativo, che si stamperebbe «-0,0».
  const text = (Number(value.toFixed(decimals)) + 0).toLocaleString('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
  })
  return `${text} ${unit}`.trim()
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

/** Un numero con la virgola decimale italiana, senza unità: la base di `formatValue`. */
export function formatNumber(value: number, decimals = 1): string {
  // `+ 0` toglie lo zero negativo, che si stamperebbe «-0,0».
  return (Number(value.toFixed(decimals)) + 0).toLocaleString('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
  })
}

/** Come `formatNumber`, con il segno «+» davanti ai positivi (contributi, tendenze). */
export function formatSigned(value: number, decimals = 1): string {
  const text = formatNumber(value, decimals)
  return value > 0 && text !== formatNumber(0, decimals) ? `+${text}` : text
}

/** Vento da m/s (unità del modello) a km/h, l'unità con cui in Italia si ragiona del vento. */
export function formatWindKmh(ms: number | null | undefined): string {
  return formatValue(ms === null || ms === undefined ? ms : ms * 3.6, 'km/h', 0)
}
