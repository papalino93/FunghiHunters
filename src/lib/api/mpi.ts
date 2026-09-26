/**
 * Come le zone escono dall'API pubblica `/api/v1/mpi`.
 *
 * Funzioni pure, senza filesystem né rete: la rotta legge i file, qui si decide la forma. È ciò che
 * le rende verificabili con dei test — e sono il contratto che vede chi usa i dati da fuori.
 *
 * ## `modelOnly`, su ogni zona
 *
 * L'app non concede mai «stima solida» a una zona senza stazioni meteo reali vicine: la chiama
 * «anteprima, solo modello» (`reliabilityLabel` in `components/today/Reliability.tsx`, vedi
 * #44). Un'API che desse le stesse cifre senza quella distinzione farebbe passare per solida, a
 * chi la usa, una stima fatta di solo modello. `modelOnly` la porta fuori in un booleano: vero
 * quando la zona non ha nessuna stazione vicina.
 */

import type { SnapshotSeriesPoint, SnapshotZone } from '@/lib/snapshot/types'

/** Un decimale: più di così è rumore, non precisione. */
function r1(value: number): number {
  return Math.round(value * 10) / 10
}

function r1OrNull(value: number | null): number | null {
  return value === null ? null : r1(value)
}

export function isModelOnly(zone: Pick<SnapshotZone, 'stations'>): boolean {
  return zone.stations.length === 0
}

/** Un giorno della serie, con tutti i numeri e nessuna frase. */
export interface ApiSeriesPoint {
  readonly date: string
  readonly mpi: number
  readonly confidence: number
  readonly dataQuality: number
  readonly provenance: SnapshotSeriesPoint['provenance']
  readonly rainMm: number | null
  readonly tMinC: number | null
  readonly tMaxC: number | null
  readonly windMs: number | null
}

/**
 * Una zona in forma di dati.
 *
 * Tiene ogni numero — posizione, punteggio, affidabilità, la serie giorno per giorno con pioggia,
 * temperature e vento — e toglie le frasi scritte per l'interfaccia (fattori spiegati, comuni
 * vicini, finestra migliore raccontata, note sulle stazioni). Non per risparmiare e basta: la
 * Toscana intera, col dettaglio completo, pesa 2,85 MB, e Vercel non accetta risposte sopra i
 * 4,5; ogni zona aggiunta al catalogo avvicinava quel limite. E le frasi cambiano con il testo
 * dell'app, i numeri no: un contratto pubblico va fatto con i secondi.
 */
export interface ApiZone {
  readonly code: string
  readonly name: string
  readonly province: string
  readonly municipality: string | null
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number
  readonly forest: readonly string[]
  readonly mpi: number
  readonly label: string
  readonly confidence: number
  readonly dataQuality: number
  readonly forecastCertainty: number
  readonly limitingFactor: string | null
  readonly development: number
  readonly modelOnly: boolean
  readonly stationCount: number
  readonly series: readonly ApiSeriesPoint[]
}

export function toApiZone(zone: SnapshotZone): ApiZone {
  return {
    code: zone.code,
    name: zone.name,
    province: zone.province,
    municipality: zone.municipality,
    latitude: zone.latitude,
    longitude: zone.longitude,
    elevationM: zone.elevationM,
    forest: zone.forest,
    mpi: r1(zone.mpi),
    label: zone.label,
    confidence: r1(zone.confidence),
    dataQuality: r1(zone.dataQuality),
    forecastCertainty: Math.round(zone.forecastCertainty),
    limitingFactor: zone.limitingFactor,
    development: r1(zone.development),
    modelOnly: isModelOnly(zone),
    stationCount: zone.stations.length,
    series: zone.series.map((p) => ({
      date: p.date,
      mpi: r1(p.mpi),
      confidence: r1(p.confidence),
      dataQuality: r1(p.dataQuality),
      provenance: p.provenance,
      rainMm: r1OrNull(p.rainMm),
      tMinC: r1OrNull(p.tMinC),
      tMaxC: r1OrNull(p.tMaxC),
      windMs: r1OrNull(p.windMs),
    })),
  }
}

/** La fotografia di un giorno: `null` dove quel giorno non è nella serie, mai un altro giorno. */
export interface ApiZoneOnDate {
  readonly code: string
  readonly name: string
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number
  readonly date: string
  readonly mpi: number | null
  readonly confidence: number | null
  readonly provenance: SnapshotSeriesPoint['provenance'] | null
  readonly modelOnly: boolean
}

export function zoneOnDate(zone: SnapshotZone, date: string): ApiZoneOnDate {
  const point = zone.series.find((p) => p.date === date)
  return {
    code: zone.code,
    name: zone.name,
    latitude: zone.latitude,
    longitude: zone.longitude,
    elevationM: zone.elevationM,
    date,
    mpi: point?.mpi ?? null,
    confidence: point?.confidence ?? null,
    provenance: point?.provenance ?? null,
    modelOnly: isModelOnly(zone),
  }
}
