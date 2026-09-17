/**
 * Validazione dell'interpolazione: leave-one-out cross-validation.
 *
 * Si toglie una stazione alla volta, si stima il valore nel suo punto usando solo le altre, e si
 * confronta con quello che la stazione ha davvero misurato. E' il solo modo onesto di dire
 * quanto vale l'interpolazione, e permette di confrontare varianti dei parametri senza
 * aspettare mesi di osservazioni sul campo.
 *
 * Il confronto piu' interessante e' contro il **nearest neighbour ingenuo**: se il nostro schema
 * non batte "prendi la stazione piu' vicina", tutta la complessita' in piu' non e' giustificata.
 */

import { ALGORITHM_V1, type AlgorithmConfig } from '@/lib/config/algorithm'
import type { Variable } from '@/lib/domain/types'
import { distanceKm } from '@/lib/qc/checks'
import {
  type StationSample,
  effectiveDistanceKm,
  interpolate,
} from '@/lib/spatial/interpolate'

export interface ValidationEntry {
  readonly stationCode: string
  readonly actual: number
  readonly predicted: number | null
  readonly nearestNeighbour: number | null
  readonly nearestEffectiveKm: number | null
}

export interface ValidationReport {
  readonly variable: Variable
  readonly n: number
  /** Errore medio assoluto del nostro schema. */
  readonly mae: number
  readonly rmse: number
  /** Errore medio con segno: positivo significa che sovrastimiamo. */
  readonly bias: number
  /** Errore medio assoluto prendendo la stazione piu' vicina in distanza efficace. */
  readonly nearestMae: number
  /** Riduzione percentuale dell'errore rispetto al nearest neighbour. */
  readonly improvementPct: number
  readonly entries: readonly ValidationEntry[]
}

/**
 * Esegue la cross-validation su un insieme di stazioni per un giorno e una grandezza.
 *
 * @param nonNegative `true` per le grandezze cumulate, che non possono scendere sotto zero
 */
export function crossValidate(
  variable: Variable,
  samples: readonly StationSample[],
  nonNegative = false,
  config: AlgorithmConfig = ALGORITHM_V1,
): ValidationReport | null {
  if (samples.length < 4) return null

  const entries: ValidationEntry[] = []

  for (const held of samples) {
    const others = samples.filter((s) => s.stationCode !== held.stationCode)
    if (others.length === 0) continue

    const result = interpolate({
      variable,
      target: {
        latitude: held.latitude,
        longitude: held.longitude,
        elevationM: held.elevationM,
      },
      samples: others,
      modelValue: null,
      nonNegative,
      config,
    })

    // Nearest neighbour di riferimento, in distanza efficace: il termine di paragone piu' duro
    // fra quelli ingenui, perche' gia' tiene conto della quota.
    let nearest: StationSample | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const other of others) {
      const d = effectiveDistanceKm(held, other, config)
      if (d < nearestDistance) {
        nearestDistance = d
        nearest = other
      }
    }

    entries.push({
      stationCode: held.stationCode,
      actual: held.value,
      predicted: result.value,
      nearestNeighbour: nearest?.value ?? null,
      nearestEffectiveKm: nearest === null ? null : nearestDistance,
    })
  }

  const usable = entries.filter((e) => e.predicted !== null)
  if (usable.length === 0) return null

  const errors = usable.map((e) => (e.predicted ?? 0) - e.actual)
  const nearestErrors = usable
    .filter((e) => e.nearestNeighbour !== null)
    .map((e) => (e.nearestNeighbour ?? 0) - e.actual)

  const mae = average(errors.map(Math.abs))
  const nearestMae = nearestErrors.length === 0 ? mae : average(nearestErrors.map(Math.abs))

  return {
    variable,
    n: usable.length,
    mae,
    rmse: Math.sqrt(average(errors.map((e) => e * e))),
    bias: average(errors),
    nearestMae,
    improvementPct: nearestMae === 0 ? 0 : ((nearestMae - mae) / nearestMae) * 100,
    entries,
  }
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

/** Distanza orizzontale media dalla stazione piu' vicina: misura la densita' della rete. */
export function meanNearestDistanceKm(samples: readonly StationSample[]): number {
  if (samples.length < 2) return Number.POSITIVE_INFINITY
  const distances = samples.map((sample) => {
    let best = Number.POSITIVE_INFINITY
    for (const other of samples) {
      if (other.stationCode === sample.stationCode) continue
      best = Math.min(
        best,
        distanceKm(sample.latitude, sample.longitude, other.latitude, other.longitude),
      )
    }
    return best
  })
  return average(distances)
}
