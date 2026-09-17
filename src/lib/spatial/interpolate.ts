/**
 * Interpolazione spaziale: regressione sul trend, poi IDW sui residui.
 *
 * **Non la stazione piu' vicina.** Sulle sette zone di taratura il criterio ingenuo sbaglia
 * almeno due volte: in Garfagnana sceglierebbe Villacollemandina, a 2.6 km ma 502 m piu' in
 * basso, invece di Orecchiella, a 2.7 km e 169 m di dislivello; sull'Appennino pistoiese
 * sceglierebbe Casotti di Cutigliano, a 200 metri ma 407 m piu' in basso, invece di Melo, a
 * 3.7 km e alla stessa quota esatta.
 *
 * Lo schema e' quello del regression kriging, che e' anche l'approccio usato dal Consorzio LaMMA
 * per i suoi grigliati a 1 km (variante dell'algoritmo di Thornton):
 *
 *   1. si stima un trend deterministico sui predittori geografici, quota in testa;
 *   2. si interpolano i **residui**, che sono molto piu' stazionari del campo originale;
 *   3. si ricostruisce il valore alla quota reale della cella, che viene dal DTM;
 *   4. dove le stazioni non bastano, si fonde con il modello dichiarando la provenienza.
 *
 * Ogni valore interpolato porta con se' gli elementi per calcolare il proprio confidence.
 */

import { ALGORITHM_V1, type AlgorithmConfig } from '@/lib/config/algorithm'
import type { Provenance, Variable } from '@/lib/domain/types'
import { distanceKm } from '@/lib/qc/checks'
import { fitLinear, predictLinear, type LinearModel, type Sample } from '@/lib/spatial/regression'

/** Una misura puntuale disponibile per l'interpolazione di un giorno. */
export interface StationSample {
  readonly stationCode: string
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number
  readonly value: number
  /** `false` per un dato che la fonte non ha ancora validato. */
  readonly validated: boolean
}

/** Il punto su cui si vuole la stima. */
export interface TargetPoint {
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number
}

export interface NeighbourInfo {
  readonly stationCode: string
  /** Distanza orizzontale in chilometri. */
  readonly distanceKm: number
  readonly elevationDiffM: number
  /** Distanza efficace, che include la penalita' di quota. */
  readonly effectiveKm: number
  readonly weight: number
  readonly validated: boolean
}

export interface InterpolationResult {
  readonly variable: Variable
  readonly value: number | null
  readonly provenance: Provenance
  /** Stazioni che hanno contribuito, con i loro pesi. */
  readonly neighbours: readonly NeighbourInfo[]
  /** Gradiente verticale stimato dai dati del giorno, quando stimabile. */
  readonly lapseRatePerM: number | null
  /** Bonta' del trend, 0-1. */
  readonly trendR2: number | null
  /** Peso dato all'osservato nella fusione col modello, 0-1. */
  readonly observedWeight: number
  readonly modelValue: number | null
  /** Spiegazione sintetica, per il pannello admin. */
  readonly method: 'regression-idw' | 'idw-only' | 'model-only' | 'none'
}

/**
 * Distanza efficace: unisce distanza orizzontale e dislivello.
 *
 * E' il cuore della correzione. Una stazione a 5 km ma 700 m piu' in basso ha distanza efficace
 * sqrt(25 + 49) = 8.6 km, peggio di una a 8 km alla stessa quota.
 */
export function effectiveDistanceKm(
  a: TargetPoint,
  b: { latitude: number; longitude: number; elevationM: number },
  config: AlgorithmConfig = ALGORITHM_V1,
): number {
  const horizontal = distanceKm(a.latitude, a.longitude, b.latitude, b.longitude)
  const vertical = Math.abs(a.elevationM - b.elevationM) * config.spatial.elevationPenaltyKmPerM.value
  return Math.sqrt(horizontal ** 2 + vertical ** 2)
}

/** Le stazioni piu' vicine in distanza efficace, gia' ordinate. */
export function selectNeighbours(
  target: TargetPoint,
  samples: readonly StationSample[],
  config: AlgorithmConfig = ALGORITHM_V1,
): Array<{ sample: StationSample; effectiveKm: number; horizontalKm: number }> {
  return samples
    .map((sample) => ({
      sample,
      effectiveKm: effectiveDistanceKm(target, sample, config),
      horizontalKm: distanceKm(target.latitude, target.longitude, sample.latitude, sample.longitude),
    }))
    .filter((entry) => entry.effectiveKm <= config.spatial.searchRadiusKm.value)
    .sort((a, b) => a.effectiveKm - b.effectiveKm)
    .slice(0, Math.round(config.spatial.maxNeighbours.value))
}

/**
 * Stima il trend del giorno: valore in funzione di quota, latitudine e longitudine.
 *
 * Latitudine e longitudine catturano il gradiente regionale, per esempio l'effetto della
 * distanza dal mare. La quota e' il predittore dominante per la temperatura.
 */
export function fitTrend(
  samples: readonly StationSample[],
  config: AlgorithmConfig = ALGORITHM_V1,
): LinearModel | null {
  if (samples.length < Math.round(config.spatial.minStationsForTrend.value)) return null

  // Centriamo i predittori: migliora il condizionamento e rende l'intercetta interpretabile.
  const meanLat = mean(samples.map((s) => s.latitude))
  const meanLon = mean(samples.map((s) => s.longitude))
  const meanElev = mean(samples.map((s) => s.elevationM))

  const training: Sample[] = samples.map((s) => ({
    x: [s.elevationM - meanElev, s.latitude - meanLat, s.longitude - meanLon],
    y: s.value,
  }))

  const model = fitLinear(training, config.spatial.ridge.value)
  if (model === null) return null

  // Conserviamo i centri nei coefficienti trasformando in forma non centrata, cosi' il modello
  // resta utilizzabile con i predittori grezzi.
  const [intercept = 0, bElev = 0, bLat = 0, bLon = 0] = model.coefficients
  return {
    ...model,
    coefficients: [intercept - bElev * meanElev - bLat * meanLat - bLon * meanLon, bElev, bLat, bLon],
  }
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

export interface InterpolateOptions {
  readonly variable: Variable
  readonly target: TargetPoint
  readonly samples: readonly StationSample[]
  /** Valore modellato sulla stessa cella, quando disponibile. */
  readonly modelValue: number | null
  /** Le grandezze cumulate non possono diventare negative. */
  readonly nonNegative?: boolean
  readonly config?: AlgorithmConfig
}

/**
 * Stima il valore di una grandezza su un punto.
 *
 * La fusione fra osservato e modellato non e' una scelta binaria: il peso dell'osservato scende
 * con la distanza efficace della stazione migliore. A ridosso di una stazione il valore e'
 * sostanzialmente osservato, a quaranta chilometri e' sostanzialmente modellato, e nel mezzo e'
 * una miscela che il confidence descrive onestamente.
 */
export function interpolate(options: InterpolateOptions): InterpolationResult {
  const config = options.config ?? ALGORITHM_V1
  const { target, variable, modelValue } = options

  const selected = selectNeighbours(target, options.samples, config)

  if (selected.length === 0) {
    return {
      variable,
      value: modelValue,
      provenance: modelValue === null ? 'MODELLED' : 'MODELLED',
      neighbours: [],
      lapseRatePerM: null,
      trendR2: null,
      observedWeight: 0,
      modelValue,
      method: modelValue === null ? 'none' : 'model-only',
    }
  }

  // Il trend si stima su tutte le stazioni disponibili, non solo sulle vicine selezionate:
  // un gradiente verticale ha bisogno di un intervallo di quote ampio per essere stimabile.
  const trend = fitTrend(options.samples, config)

  const idwPower = config.spatial.idwPower.value
  const neighbours: NeighbourInfo[] = []
  let weightedResidual = 0
  let totalWeight = 0

  for (const entry of selected) {
    // Lo smorzamento evita il peso infinito quando il punto coincide con la stazione.
    const weight = 1 / Math.pow(entry.effectiveKm + 0.5, idwPower)
    const predictedAtStation =
      trend === null
        ? 0
        : predictLinear(trend, [
            entry.sample.elevationM,
            entry.sample.latitude,
            entry.sample.longitude,
          ])
    const residual = trend === null ? entry.sample.value : entry.sample.value - predictedAtStation

    weightedResidual += weight * residual
    totalWeight += weight

    neighbours.push({
      stationCode: entry.sample.stationCode,
      distanceKm: entry.horizontalKm,
      elevationDiffM: Math.abs(target.elevationM - entry.sample.elevationM),
      effectiveKm: entry.effectiveKm,
      weight,
      validated: entry.sample.validated,
    })
  }

  const residualAtTarget = totalWeight === 0 ? 0 : weightedResidual / totalWeight
  const trendAtTarget =
    trend === null
      ? 0
      : predictLinear(trend, [target.elevationM, target.latitude, target.longitude])

  let observed = trend === null ? residualAtTarget : trendAtTarget + residualAtTarget
  if (options.nonNegative === true) observed = Math.max(0, observed)

  // Peso dell'osservato: 1 sulla stazione, 0.5 alla distanza di dimezzamento, in calo dopo.
  const best = neighbours[0]?.effectiveKm ?? Number.POSITIVE_INFINITY
  const half = config.spatial.fusionHalfDistanceKm.value
  const observedWeight = modelValue === null ? 1 : 1 / (1 + best / half)

  const value =
    modelValue === null ? observed : observedWeight * observed + (1 - observedWeight) * modelValue

  return {
    variable,
    value: options.nonNegative === true ? Math.max(0, value) : value,
    // Sopra meta' peso il valore e' sostanzialmente una misura, sotto e' sostanzialmente un modello.
    provenance: observedWeight >= 0.5 ? 'OBSERVED' : 'MODELLED',
    neighbours,
    lapseRatePerM: trend === null ? null : (trend.coefficients[1] ?? null),
    trendR2: trend?.r2 ?? null,
    observedWeight,
    modelValue,
    method: trend === null ? 'idw-only' : 'regression-idw',
  }
}
