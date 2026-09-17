/**
 * Confidence 0-100, per variabile e poi aggregata.
 *
 * `MPI 82 / confidence 91` e `MPI 82 / confidence 43` sono cose diverse e vanno mostrate come
 * tali. L'aggregazione **non e' una media semplice**: pesa ogni variabile per quanto contribuisce
 * al punteggio, perche' non sapere il vento quando il vento non morde non e' un problema, mentre
 * non sapere la pioggia lo e' sempre.
 *
 * I componenti sono moltiplicativi: basta che uno sia pessimo perche' la confidence crolli, che
 * e' il comportamento giusto. Una stima costruita su una stazione perfetta ma a 40 km non e'
 * affidabile, per quanto quella stazione sia buona.
 */

import { ALGORITHM_V1, type AlgorithmConfig } from '@/lib/config/algorithm'
import type { Provenance, Variable } from '@/lib/domain/types'
import type { ConfidenceFactor } from '@/lib/model/explain'

/** Contributo di una stazione alla stima di una variabile su una cella. */
export interface StationContribution {
  readonly stationCode: string
  readonly distanceKm: number
  /** Dislivello in valore assoluto fra stazione e cella. */
  readonly elevationDiffM: number
  /** `false` per un dato non validato dalla fonte. */
  readonly validated: boolean
}

export interface VariableConfidenceInput {
  readonly variable: Variable
  readonly provenance: Provenance
  readonly stations: readonly StationContribution[]
  /** Giorni nel futuro. 0 per oggi, negativo per il passato. */
  readonly horizonDays: number
  /**
   * Accordo fra i membri dell'ensemble, 0-1. `null` quando non si tratta di una previsione.
   * Con 122 membri in una sola chiamata e' il contributo migliore che abbiamo.
   */
  readonly ensembleAgreement: number | null
  /** Quota della finestra effettivamente coperta da dati, 0-1. */
  readonly coverage: number
}

export interface VariableConfidence {
  readonly variable: Variable
  readonly score: number
  readonly components: Readonly<Record<string, number>>
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function distanceScale(variable: Variable, config: AlgorithmConfig): number {
  const scales = config.confidence.distanceScaleKm
  return (scales[variable] ?? scales['default'])?.value ?? 20
}

/** Confidence di una singola variabile su una cella. */
export function variableConfidence(
  input: VariableConfidenceInput,
  config: AlgorithmConfig = ALGORITHM_V1,
): VariableConfidence {
  const cc = config.confidence

  // Distanza e somiglianza di quota: si valutano sulla stazione migliore, non sulla media,
  // perche' una stazione ottima vicina non viene peggiorata da una mediocre lontana.
  let bestGeometry = 0
  for (const station of input.stations) {
    const byDistance = Math.exp(-station.distanceKm / distanceScale(input.variable, config))
    const byElevation = Math.exp(-((station.elevationDiffM / cc.elevationScaleM.value) ** 2))
    bestGeometry = Math.max(bestGeometry, byDistance * byElevation)
  }
  // Senza stazioni la geometria non azzera tutto: il valore viene dal modello, che una sua
  // affidabilita' ce l'ha. A dirlo e' il fattore di provenienza.
  const geometry = input.stations.length === 0 ? 1 : bestGeometry

  const density = 1 - Math.exp(-input.stations.length / cc.densitySaturation.value)
  const densityFactor = input.stations.length === 0 ? 1 : 0.6 + 0.4 * density

  const provenanceFactor = cc.provenanceQuality[input.provenance]?.value ?? 0.6
  const validationFactor = input.stations.some((s) => s.validated) ? 1 : 0.9

  const horizonFactor =
    input.horizonDays <= 0 ? 1 : Math.exp(-input.horizonDays / cc.horizonScaleDays.value)

  const agreementFactor =
    input.ensembleAgreement === null ? 1 : 0.5 + 0.5 * clamp01(input.ensembleAgreement)

  const coverageFactor = 0.4 + 0.6 * clamp01(input.coverage)

  const components = {
    geometry,
    density: densityFactor,
    provenance: provenanceFactor,
    validation: validationFactor,
    horizon: horizonFactor,
    agreement: agreementFactor,
    coverage: coverageFactor,
  }

  const score =
    100 *
    clamp01(
      Object.values(components).reduce((acc, value) => acc * value, 1),
    )

  return { variable: input.variable, score, components }
}

/**
 * Accordo dell'ensemble a partire dai quantili.
 *
 * Verificato il 2026-09-17 sull'Amiata a +3 giorni: 122 membri fra ECMWF, ICON-EU e GEFS danno
 * minimo 0, mediana 0 e massimo 3.8 mm di pioggia. Accordo altissimo su "non piove". Piu' avanti
 * nel tempo lo spread si allarga e la confidence scende da sola, senza regole ad hoc.
 */
export function ensembleAgreement(p10: number, p90: number, typicalSpread: number): number {
  if (typicalSpread <= 0) return 1
  return clamp01(1 - (p90 - p10) / typicalSpread)
}

export interface AggregateConfidenceInput {
  readonly variables: readonly VariableConfidence[]
  /** Peso di ciascuna variabile nel punteggio, 0-1. Le variabili assenti pesano zero. */
  readonly weights: Readonly<Partial<Record<Variable, number>>>
}

export interface AggregateConfidence {
  readonly score: number
  readonly factors: readonly ConfidenceFactor[]
}

/**
 * Confidence complessiva: media pesata **per il contributo al punteggio**, non aritmetica.
 * Non sapere il vento quando il vento non morde non e' un problema; non sapere la pioggia lo e'.
 */
export function aggregateConfidence(input: AggregateConfidenceInput): AggregateConfidence {
  let weighted = 0
  let totalWeight = 0
  const factors: ConfidenceFactor[] = []

  for (const variable of input.variables) {
    const weight = input.weights[variable.variable] ?? 0
    if (weight <= 0) continue
    weighted += variable.score * weight
    totalWeight += weight

    const worst = Object.entries(variable.components).reduce(
      (acc, entry) => (entry[1] < acc[1] ? entry : acc),
      ['', 1] as [string, number],
    )
    factors.push({
      key: variable.variable,
      label: describeVariable(variable.variable),
      value: `${variable.score.toFixed(0)} su 100`,
      impact: weight,
    })
    if (worst[1] < 0.75) {
      factors.push({
        key: `${variable.variable}.${worst[0]}`,
        label: `${describeVariable(variable.variable)}: ${describeComponent(worst[0])}`,
        value: `fattore ${worst[1].toFixed(2)}`,
        impact: weight,
      })
    }
  }

  return {
    score: totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 10) / 10,
    factors,
  }
}

function describeVariable(variable: Variable): string {
  switch (variable) {
    case 'precipitation':
      return 'Pioggia'
    case 'temperature_max':
      return 'Temperatura massima'
    case 'temperature_min':
      return 'Temperatura minima'
    case 'soil_moisture':
      return 'Umidita del suolo'
    case 'et0':
      return 'Evapotraspirazione'
    case 'wind_speed_mean':
      return 'Vento'
    default:
      return variable
  }
}

function describeComponent(key: string): string {
  switch (key) {
    case 'geometry':
      return 'stazioni lontane o a quota diversa'
    case 'density':
      return 'poche stazioni disponibili'
    case 'provenance':
      return 'dato modellato e non osservato'
    case 'validation':
      return 'dato non ancora validato dalla fonte'
    case 'horizon':
      return 'previsione lontana nel tempo'
    case 'agreement':
      return 'i modelli previsionali non concordano'
    case 'coverage':
      return 'finestra temporale incompleta'
    default:
      return key
  }
}

/** Pesi di riferimento delle variabili nel punteggio, coerenti con la struttura del modello. */
export const DEFAULT_VARIABLE_WEIGHTS: Readonly<Partial<Record<Variable, number>>> = {
  precipitation: 1,
  temperature_max: 0.7,
  temperature_min: 0.7,
  soil_moisture: 0.5,
  et0: 0.4,
  wind_speed_mean: 0.15,
}
