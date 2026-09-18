/**
 * "Dove vado oggi?" — l'ordinamento delle aree.
 *
 * La domanda reale non è "quale zona ha il punteggio più alto", è **dove conviene andare**, che
 * dipende anche da quanto è lontana e da quanto ci si può fidare della stima. Un 30 a venti
 * minuti da casa batte un 34 a due ore e mezza, e un 40 costruito su dati scarsi non batte un 35
 * misurato da una stazione a tre chilometri.
 *
 * L'ordinamento è quindi esplicito e ispezionabile: ogni suggerimento porta con sé perché sta in
 * quella posizione. Non è un modello dentro il modello, è una somma pesata che si può leggere.
 */

import type { SnapshotZone } from '@/lib/snapshot/types'
import { distanceKm } from '@/lib/qc/checks'

export interface UserPosition {
  readonly latitude: number
  readonly longitude: number
}

export interface RankOptions {
  readonly date: string
  readonly from: UserPosition | null
  /** Distanza massima in linea d'aria. `null` per nessun limite. */
  readonly maxDistanceKm?: number | null
  readonly minElevationM?: number | null
  readonly maxElevationM?: number | null
  /** Tipi di bosco accettati. Vuoto significa tutti. */
  readonly forestTypes?: readonly string[]
  /** Affidabilità minima dei dati, 0-100. */
  readonly minDataQuality?: number | null
}

export interface Suggestion {
  readonly zone: SnapshotZone
  readonly mpi: number
  readonly confidence: number
  /** Distanza in linea d'aria. `null` quando non sappiamo dove sei. */
  readonly distanceKm: number | null
  /** Variazione attesa nelle prossime 72 ore. */
  readonly trend72h: number
  /** Giorno migliore nell'orizzonte disponibile e relativo punteggio. */
  readonly bestDay: { date: string; mpi: number } | null
  /** Punteggio di ordinamento, 0-100. Non è l'MPI: include distanza e affidabilità. */
  readonly rankScore: number
  /** Perché sta in questa posizione, in chiaro. */
  readonly reasons: readonly string[]
}

/**
 * Pesi dell'ordinamento.
 *
 * Il potenziale domina, com'è giusto: la distanza non rende buono un bosco secco. Ma pesa
 * abbastanza da spostare l'ordine fra due zone simili, che è il caso in cui serve davvero.
 */
const WEIGHTS = {
  potential: 0.6,
  distance: 0.25,
  confidence: 0.15,
} as const

/** Distanza oltre la quale il contributo è praticamente nullo. */
const DISTANCE_SCALE_KM = 90

export function mpiOn(zone: SnapshotZone, date: string): number {
  return zone.series.find((p) => p.date === date)?.mpi ?? zone.mpi
}

export function confidenceOn(zone: SnapshotZone, date: string): number {
  return zone.series.find((p) => p.date === date)?.confidence ?? zone.confidence
}

/**
 * Qualità dei **dati osservati** nel giorno scelto, che non è la `confidence` complessiva.
 *
 * Le due si somigliano ma rispondono a domande diverse (vedi il commento "Perché due numeri e non
 * uno" in `src/lib/model/confidence.ts`): `confidence` include anche quanto si sta guardando
 * avanti nel tempo, `dataQuality` no. Il filtro dell'utente si chiama "affidabilità minima dei
 * dati" e va confrontato con la seconda: con la prima, guardare a cinque giorni faceva sparire
 * zone con stazioni ottime solo perché la previsione è lontana, e il numero mostrato nel motivo
 * dell'esclusione non corrispondeva a quello scritto nella scheda della zona.
 */
export function dataQualityOn(zone: SnapshotZone, date: string): number {
  return zone.series.find((p) => p.date === date)?.dataQuality ?? zone.dataQuality
}

/** Variazione fra il punteggio del giorno scelto e quello di tre giorni dopo. */
export function trend72h(zone: SnapshotZone, date: string): number {
  const index = zone.series.findIndex((p) => p.date === date)
  if (index < 0) return 0
  const now = zone.series[index]?.mpi ?? 0
  const later = zone.series[Math.min(index + 3, zone.series.length - 1)]?.mpi ?? now
  // `+ 0` normalizza lo zero negativo, che altrimenti verrebbe stampato come "-0".
  return Math.round((later - now) * 10) / 10 + 0
}

/** Il giorno migliore da oggi in avanti, che spesso non è oggi. */
export function bestDayFrom(
  zone: SnapshotZone,
  fromDate: string,
): { date: string; mpi: number } | null {
  const ahead = zone.series.filter((p) => p.date >= fromDate)
  if (ahead.length === 0) return null
  const best = ahead.reduce((acc, p) => (p.mpi > acc.mpi ? p : acc), ahead[0] as { date: string; mpi: number })
  return { date: best.date, mpi: best.mpi }
}

/**
 * Perché una zona non compare, in una frase pronta per l'utente. `null` se non c'è motivo:
 * la zona passa tutti i filtri.
 *
 * Un'area scartata in silenzio è indistinguibile da un'area che non esiste. Chi imposta "quota
 * minima 1000 m" e vede sparire l'Amiata (910 m) deve poterlo scoprire, non dedurlo.
 */
function exclusionReason(
  zone: SnapshotZone,
  distance: number | null,
  dataQuality: number,
  options: RankOptions,
): string | null {
  if (options.maxDistanceKm != null && distance !== null && distance > options.maxDistanceKm) {
    return (
      `a ${distance.toFixed(0)} km in linea d'aria, oltre il limite di ${options.maxDistanceKm} km`
    )
  }
  if (options.minElevationM != null && zone.elevationM < options.minElevationM) {
    return `a ${zone.elevationM} m, sotto la quota minima di ${options.minElevationM} m`
  }
  if (options.maxElevationM != null && zone.elevationM > options.maxElevationM) {
    return `a ${zone.elevationM} m, sopra la quota massima di ${options.maxElevationM} m`
  }
  if (options.minDataQuality != null && dataQuality < options.minDataQuality) {
    return `qualità dei dati ${Math.round(dataQuality)}, sotto la soglia minima di ${options.minDataQuality}`
  }

  const wanted = options.forestTypes ?? []
  if (wanted.length > 0 && !zone.forest.some((f) => wanted.includes(f))) {
    return `bosco di tipo ${zone.forest.join('/')}, non fra quelli scelti`
  }

  return null
}

function passesFilters(
  zone: SnapshotZone,
  distance: number | null,
  dataQuality: number,
  options: RankOptions,
): boolean {
  return exclusionReason(zone, distance, dataQuality, options) === null
}

export interface ExcludedZone {
  readonly zone: SnapshotZone
  /** Perché questa zona non compare fra i suggerimenti, in chiaro. */
  readonly reason: string
}

/**
 * Le zone escluse dai filtri correnti, con il motivo — il contraltare di `rankZones`. Le due
 * funzioni condividono la stessa logica di esclusione (`exclusionReason`) apposta: non deve
 * poter esistere un caso in cui una zona sparisce da `rankZones` senza comparire qui con un
 * motivo, o viceversa.
 */
export function excludedZones(zones: readonly SnapshotZone[], options: RankOptions): ExcludedZone[] {
  const out: ExcludedZone[] = []
  for (const zone of zones) {
    const distance =
      options.from === null
        ? null
        : Math.round(
            distanceKm(options.from.latitude, options.from.longitude, zone.latitude, zone.longitude) *
              10,
          ) / 10
    const reason = exclusionReason(zone, distance, dataQualityOn(zone, options.date), options)
    if (reason !== null) out.push({ zone, reason })
  }
  return out
}

/**
 * Ordina le aree per convenienza reale.
 *
 * Senza posizione la distanza semplicemente non entra nel conto, e i pesi si ridistribuiscono:
 * fingere una distanza da un punto medio della regione sarebbe peggio che non averla.
 */
export function rankZones(
  zones: readonly SnapshotZone[],
  options: RankOptions,
): Suggestion[] {
  const suggestions: Suggestion[] = []

  for (const zone of zones) {
    const mpi = mpiOn(zone, options.date)
    const confidence = confidenceOn(zone, options.date)
    const distance =
      options.from === null
        ? null
        : Math.round(
            distanceKm(options.from.latitude, options.from.longitude, zone.latitude, zone.longitude) *
              10,
          ) / 10

    if (!passesFilters(zone, distance, dataQualityOn(zone, options.date), options)) continue

    const potentialTerm = mpi / 100
    const confidenceTerm = confidence / 100
    const distanceTerm = distance === null ? null : Math.exp(-distance / DISTANCE_SCALE_KM)

    // Senza distanza i pesi si normalizzano sui due termini rimasti.
    const rankScore =
      distanceTerm === null
        ? (100 * (WEIGHTS.potential * potentialTerm + WEIGHTS.confidence * confidenceTerm)) /
          (WEIGHTS.potential + WEIGHTS.confidence)
        : 100 *
          (WEIGHTS.potential * potentialTerm +
            WEIGHTS.distance * distanceTerm +
            WEIGHTS.confidence * confidenceTerm)

    const trend = trend72h(zone, options.date)

    suggestions.push({
      zone,
      mpi,
      confidence,
      distanceKm: distance,
      trend72h: trend,
      bestDay: bestDayFrom(zone, options.date),
      rankScore: Math.round(rankScore * 10) / 10,
      reasons: reasonsFor(zone, mpi, confidence, distance, trend),
    })
  }

  return suggestions.sort((a, b) => b.rankScore - a.rankScore)
}

function reasonsFor(
  zone: SnapshotZone,
  mpi: number,
  confidence: number,
  distance: number | null,
  trend: number,
): string[] {
  const reasons: string[] = []

  if (mpi >= 40) reasons.push('potenziale fra i più alti della regione oggi')
  else if (mpi >= 20) reasons.push('il potenziale più alto disponibile, per quanto contenuto')

  if (distance !== null && distance <= 30) reasons.push(`a ${distance.toFixed(0)} km da te`)
  else if (distance !== null && distance > 100) reasons.push(`lontana: ${distance.toFixed(0)} km`)

  if (trend > 5) reasons.push('in miglioramento nelle prossime 72 ore')
  else if (trend < -5) reasons.push('in calo nelle prossime 72 ore')

  if (confidence >= 70) reasons.push('stima costruita su stazioni vicine')
  else if (confidence < 50) reasons.push('stima poco solida per questa zona')

  if (zone.limitingFactor !== null) {
    reasons.push(`limite principale: ${zone.limitingFactor.toLowerCase()}`)
  }

  return reasons
}

/** Tutti i tipi di bosco presenti, per costruire i filtri senza cablarli. */
export function availableForestTypes(zones: readonly SnapshotZone[]): string[] {
  return [...new Set(zones.flatMap((z) => z.forest))].sort()
}

/**
 * Momento consigliato per uscire.
 *
 * Non è un orario astrologico: è la constatazione che il punteggio cambia per giorno e non per
 * ora, quindi l'unica cosa onesta da dire è **quale giorno**, e che di mattina il bosco è
 * più fresco e meno battuto.
 */
export function suggestedTiming(
  best: { date: string; mpi: number } | null,
  today: string,
  formatDate: (date: string) => string = (d) => d,
): string {
  if (best === null) return 'Nessuna previsione disponibile.'
  if (best.mpi < 15) return 'Nessun giorno si distingue nell’orizzonte disponibile.'
  if (best.date === today) return 'Oggi è il giorno migliore dell’orizzonte disponibile.'
  return `Il giorno migliore è ${formatDate(best.date)}, non oggi.`
}
