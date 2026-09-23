/**
 * Il calcolo di una zona, dal meteo alla riga di snapshot.
 *
 * Vive qui, e non dentro uno dei due script, perche' i consumatori sono due — lo snapshot toscano
 * (`scripts/build-snapshot.ts`, con osservazioni SIR) e quello nazionale
 * (`scripts/build-snapshot-italia.ts`, solo modello). Duplicarlo avrebbe significato due versioni
 * dello stesso punteggio che divergono alla prima modifica, e il sintomo sarebbe stato il peggiore
 * possibile: la stessa giornata di meteo che produce numeri diversi in Toscana e fuori.
 *
 * L'unica differenza fra i due casi e' cosa si passa in `observationsByDate`: le serie SIR in
 * Toscana, una mappa vuota altrove. Tutto il resto — features, punteggio, confidence, fattori —
 * e' identico per costruzione, e la confidence si abbassa da sola quando non ci sono osservazioni,
 * senza bisogno di una penalita' scritta a mano.
 */

import { ALGORITHM_V1 } from '@/lib/config/algorithm'
import { addDays, daysBetween } from '@/lib/domain/time'
import type { Station } from '@/lib/domain/types'
import { buildFeatures, type CellContext } from '@/lib/model/features'
import { habitatSuitability } from '@/lib/model/forest'
import { computeMpi, mpiLabel } from '@/lib/model/mpi'
import { explainScore } from '@/lib/model/explain'
import { potentialWindow, type ForecastPoint } from '@/lib/model/narrative'
import { buildZoneSeries, zoneConfidence, type DailySamples } from '@/lib/pipeline/zone-series'
import type { DailyWeather } from '@/lib/model/features'
import type {
  SnapshotFactor,
  SnapshotNearbyMunicipality,
  SnapshotSeriesPoint,
  SnapshotStation,
  SnapshotZone,
} from '@/lib/snapshot/types'

/** Il minimo che serve per calcolare una zona: le sette toscane e quelle nazionali lo soddisfano. */
export interface ZoneLike {
  readonly code: string
  readonly name: string
  readonly reference: string
  readonly province: string
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number
  readonly forest: readonly string[]
  /** Quota a bosco, quando misurata. Vedi `SnapshotZone.forestFraction`. */
  readonly forestFraction?: number
  /**
   * Quota di ciascun tipo di bosco **sul bosco**, quando misurata. Insieme a `forestFraction` e'
   * cio' che fa pesare il bosco sul punteggio: vedi `src/lib/model/forest.ts`.
   */
  readonly forestShares?: Readonly<Record<string, number>>
  readonly stationNotes: string
}

export interface ZoneSnapshotInput {
  readonly zone: ZoneLike
  readonly modelSeries: readonly DailyWeather[]
  /** Serie osservate per data. Vuota per le zone senza rete di stazioni collegata. */
  readonly observationsByDate: ReadonlyMap<string, DailySamples>
  readonly todayIso: string
  readonly displayPastDays: number
  readonly forecastDays: number
  readonly municipality: string | null
  readonly nearbyMunicipalities: readonly SnapshotNearbyMunicipality[]
  /** Anagrafica stazioni, per dire quali hanno alimentato la zona. Vuota se non ce ne sono. */
  readonly stationByCode: ReadonlyMap<string, Station>
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

function toSnapshotFactor(factor: {
  key: string
  label: string
  contribution: number
  value: string
  provenance: 'sourced' | 'calibrate'
  source?: string
  transferabilityCaution?: string
}): SnapshotFactor {
  return {
    key: factor.key,
    label: factor.label,
    contribution: Math.round(factor.contribution * 10) / 10,
    value: factor.value,
    provenance: factor.provenance,
    ...(factor.source === undefined ? {} : { source: factor.source }),
    ...(factor.transferabilityCaution === undefined
      ? {}
      : { transferabilityCaution: factor.transferabilityCaution }),
  }
}

/** `null` quando la serie non copre il giorno di riferimento: meglio saltare che inventare. */
export function buildZoneSnapshot(input: ZoneSnapshotInput): SnapshotZone | null {
  const { zone, todayIso, displayPastDays, forecastDays } = input

  const cell: CellContext = {
    elevationM: zone.elevationM,
    aspectDeg: null,
    slopeDeg: null,
    canopyDensity: null,
    // `null` vuol dire "non misurato", e il modello lo tratta come neutro: una zona senza bosco
    // misurato non deve perdere punti rispetto a una che ce l'ha.
    forest:
      zone.forestFraction === undefined || zone.forestShares === undefined
        ? null
        : { forestFraction: zone.forestFraction, shares: zone.forestShares },
  }
  const target = {
    latitude: zone.latitude,
    longitude: zone.longitude,
    elevationM: zone.elevationM,
  }

  const assembled = buildZoneSeries({
    target,
    modelSeries: [...input.modelSeries],
    observationsByDate: input.observationsByDate as Map<string, DailySamples>,
  })
  const full = assembled.series

  const ageDays =
    assembled.lastObservedDate === null
      ? 30
      : Math.max(0, daysBetween(assembled.lastObservedDate, todayIso))

  /*
   * Il bosco non cambia da un giorno all'altro: si calcola una volta sola, fuori dal ciclo.
   *
   * Qui serve la sua **certezza**, che abbassa la confidence dove la mappa dei generi e' generica
   * ("altre latifoglie" tiene insieme il castagno e il pioppo). Il moltiplicatore sul punteggio
   * lo applica invece `computeMpi`, dal contesto della cella.
   */
  const habitat = habitatSuitability(cell.forest, ALGORITHM_V1)

  // Punteggio per ogni giorno visualizzato: il motore e' puro, quindi basta ricalcolarlo
  // sulla serie troncata a quel giorno. E' anche esattamente cio' che serve al backtest.
  const points: SnapshotSeriesPoint[] = []
  const forecastPoints: ForecastPoint[] = []
  let currentResult: ReturnType<typeof computeMpi> | null = null
  let currentFeatures: ReturnType<typeof buildFeatures> | null = null
  let currentConfidence = 0
  let currentDataQuality = 0
  let currentForecastCertainty = 100

  for (let offset = -displayPastDays; offset <= forecastDays - 1; offset += 1) {
    const date = addDays(todayIso, offset)
    const dayIndex = full.findIndex((d) => d.date === date)
    if (dayIndex < 0) continue

    const upTo = full.slice(0, dayIndex + 1)
    const features = buildFeatures(upTo, cell, ALGORITHM_V1)
    const result = computeMpi({ features, cell })
    const horizon = Math.max(0, offset)
    const confidence = zoneConfidence({
      interpolation: assembled.lastObservedInterpolation,
      coverage: features.coverage,
      observationAgeDays: ageDays + Math.max(0, offset),
      horizonDays: horizon,
      habitatCertainty: habitat.certainty,
      habitatMeasured: habitat.measured,
    })

    const day = full[dayIndex]
    points.push({
      date,
      mpi: result.mpi,
      mpiRaw: result.rawMpi,
      confidence: confidence.score,
      dataQuality: confidence.dataQuality,
      forecastCertainty: confidence.forecastCertainty,
      provenance: day?.provenance ?? 'MODELLED',
      rainMm: day?.precipitationMm ?? null,
      tMinC: day?.temperatureMinC ?? null,
      tMaxC: day?.temperatureMaxC ?? null,
      // Massimo giornaliero (Open-Meteo non offre una vera media nell'endpoint daily), non
      // "vento medio": vedi il commento su windMean7d in model/features.ts.
      windMs: day?.windMs ?? null,
    })

    if (offset >= 0) {
      forecastPoints.push({ date, mpi: result.mpi, confidence: confidence.score })
    }
    if (offset === 0) {
      currentResult = result
      currentFeatures = features
      currentConfidence = confidence.score
      currentDataQuality = confidence.dataQuality
      currentForecastCertainty = confidence.forecastCertainty
    }
  }

  if (currentResult === null || currentFeatures === null) return null

  const explanation = explainScore(currentResult, currentFeatures, currentConfidence)
  const window = potentialWindow(forecastPoints, explanation.limitingFactor)

  const recent = points.filter((p) => daysBetween(p.date, todayIso) >= 0).slice(-4)
  const ahead = points.filter((p) => daysBetween(todayIso, p.date) > 0).slice(0, 4)
  const development =
    ahead.length === 0 || recent.length === 0
      ? 0
      : average(ahead.map((p) => p.mpi)) - average(recent.map((p) => p.mpi))

  const stations: SnapshotStation[] = []
  for (const [variable, result] of assembled.lastObservedInterpolation) {
    for (const neighbour of result.neighbours.slice(0, 4)) {
      const station = input.stationByCode.get(neighbour.stationCode)
      if (station === undefined) continue
      stations.push({
        code: station.code,
        name: station.name,
        latitude: station.latitude,
        longitude: station.longitude,
        elevationM: station.elevationM,
        distanceKm: neighbour.distanceKm,
        elevationDiffM: neighbour.elevationDiffM,
        effectiveKm: neighbour.effectiveKm,
        variable,
      })
    }
  }

  const tmaxInterpolation = assembled.lastObservedInterpolation.get('temperature_max')

  return {
    code: zone.code,
    name: zone.name,
    reference: zone.reference,
    province: zone.province,
    municipality: input.municipality,
    latitude: zone.latitude,
    longitude: zone.longitude,
    elevationM: zone.elevationM,
    forest: zone.forest,
    ...(zone.forestFraction === undefined ? {} : { forestFraction: zone.forestFraction }),
    stationNotes: zone.stationNotes.replace(/\s+/g, ' ').trim(),
    mpi: currentResult.mpi,
    mpiRaw: currentResult.rawMpi,
    confidence: currentConfidence,
    dataQuality: currentDataQuality,
    forecastCertainty: currentForecastCertainty,
    label: mpiLabel(currentResult.mpi),
    limitingFactor: explanation.limitingFactor,
    development: Math.round(development * 10) / 10,
    series: points,
    weather: {
      rain24h: currentFeatures.rain['rain_1d'] ?? null,
      rain72h: currentFeatures.rain['rain_3d'] ?? null,
      rain7d: currentFeatures.rain['rain_7d'] ?? null,
      rain14d: currentFeatures.rain['rain_14d'] ?? null,
      rain26d: currentFeatures.rain['rain_26d'] ?? null,
      effectiveWaterMm: Math.round(currentFeatures.water.effectiveMm * 10) / 10,
      initialDeficitMm: Math.round(currentFeatures.water.initialDeficitMm * 10) / 10,
      et0_7d: currentFeatures.et0_7d,
      et0_14d: currentFeatures.et0_14d,
      tMean20d: currentFeatures.tMeanWindow,
      tMinWindow: currentFeatures.tMinWindow,
      tMaxWindow: currentFeatures.tMaxWindow,
      soilTemperatureMean: currentFeatures.soilTemperatureMean,
      soilMoisture: full.find((d) => d.date === todayIso)?.soilMoisture ?? null,
      vpdMean7d: currentFeatures.vpdMean7d,
      windMean7d: currentFeatures.windMean7d,
      humidityMean7d: currentFeatures.humidityMean7d,
    },
    positiveFactors: explanation.positiveFactors.map(toSnapshotFactor),
    negativeFactors: explanation.negativeFactors.map(toSnapshotFactor),
    neutralFactors: explanation.neutralFactors.map(toSnapshotFactor),
    stations,
    bestWindow:
      window === null
        ? null
        : {
            peakDate: window.peakDate,
            peakMpi: window.peakMpi,
            start: window.start,
            end: window.end,
            narrative: window.narrative,
          },
    observedDays: assembled.observedDays,
    // Il denominatore vero della copertura: la finestra di calcolo, non i punti mostrati.
    windowDays: full.filter((d) => d.date <= todayIso).length,
    lastObservedDate: assembled.lastObservedDate,
    thermalOptimumC: Math.round(currentResult.components.thermal.optimumC * 10) / 10,
    lapseRateCPerKm:
      tmaxInterpolation?.lapseRatePerM === null || tmaxInterpolation === undefined
        ? null
        : Math.round(tmaxInterpolation.lapseRatePerM * 1000 * 100) / 100,
    nearbyMunicipalities: input.nearbyMunicipalities,
  }
}
