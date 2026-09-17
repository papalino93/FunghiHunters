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

  // Fattori comuni a entrambe le strade.
  const horizonFactor =
    input.horizonDays <= 0 ? 1 : Math.exp(-input.horizonDays / cc.horizonScaleDays.value)
  const agreementFactor =
    input.ensembleAgreement === null ? 1 : 0.5 + 0.5 * clamp01(input.ensembleAgreement)
  const coverageFactor = 0.4 + 0.6 * clamp01(input.coverage)
  const common = horizonFactor * agreementFactor * coverageFactor

  /*
   * Confidence del solo modello: e' il **pavimento**.
   *
   * Un valore ottenuto fondendo il modello con delle osservazioni non puo' essere meno
   * affidabile del modello da solo. La prima versione lo permetteva, e sui dati reali una
   * stazione a 3 km faceva scendere la confidence da 63 a 42: assurdo, e il sintomo di una
   * geometria che penalizzava due volte la quota, gia' corretta dal trend della regressione.
   */
  const modelFloor =
    (cc.provenanceQuality['MODELLED']?.value ?? 0.7) * common

  if (input.stations.length === 0) {
    const components = {
      geometry: 1,
      density: 1,
      provenance: cc.provenanceQuality[input.provenance]?.value ?? 0.6,
      validation: 1,
      horizon: horizonFactor,
      agreement: agreementFactor,
      coverage: coverageFactor,
    }
    return {
      variable: input.variable,
      score: 100 * clamp01(components.provenance * common),
      components,
    }
  }

  // Rappresentativita' della stazione migliore, non della media: una stazione ottima vicina non
  // viene peggiorata da una mediocre lontana. La forma e' gaussiana in entrambi i termini,
  // perche' la rappresentativita' non cala linearmente appena ci si allontana dal sensore.
  let geometry = 0
  for (const station of input.stations) {
    const byDistance = Math.exp(
      -((station.distanceKm / distanceScale(input.variable, config)) ** 2),
    )
    const byElevation = Math.exp(-((station.elevationDiffM / cc.elevationScaleM.value) ** 2))
    geometry = Math.max(geometry, byDistance * byElevation)
  }

  /*
   * La densita' aggiunge robustezza, non informazione nuova.
   *
   * Una sola stazione ben piazzata dice gia' quasi tutto: le altre servono soprattutto a
   * riconoscere quando quella sbaglia. Per questo il fattore parte alto e sale poco. Con un
   * pavimento a 0.6, come nella prima versione, una stazione perfetta esattamente sulla cella
   * finiva sotto la confidence del solo modello e veniva schiacciata dal pavimento, rendendo
   * indistinguibili tutti i casi a stazione singola.
   */
  const density = 1 - Math.exp(-input.stations.length / cc.densitySaturation.value)
  const densityFactor = 0.85 + 0.15 * density
  const provenanceFactor = cc.provenanceQuality[input.provenance]?.value ?? 0.6
  // I dati SIR recenti non sono validati dalla fonte: e' una riduzione piccola ma reale.
  const validationFactor = input.stations.some((s) => s.validated) ? 1 : 0.92

  const components = {
    geometry,
    density: densityFactor,
    provenance: provenanceFactor,
    validation: validationFactor,
    horizon: horizonFactor,
    agreement: agreementFactor,
    coverage: coverageFactor,
  }

  const observedScore = Object.values(components).reduce((acc, value) => acc * value, 1)

  return {
    variable: input.variable,
    score: 100 * clamp01(Math.max(modelFloor, observedScore)),
    components,
  }
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
  /** Punteggio complessivo, per chi vuole un numero solo. */
  readonly score: number
  /**
   * Quanto sono buoni i **dati osservati**: stazioni vicine e comparabili, densità, copertura
   * della finestra, freschezza. Non dipende da quanto guardiamo avanti nel tempo.
   */
  readonly dataQuality: number
  /**
   * Quanto è affidabile la **previsione** per il giorno scelto: orizzonte temporale e accordo
   * fra i modelli. Per oggi vale 100 e non toglie nulla.
   */
  readonly forecastCertainty: number
  readonly factors: readonly ConfidenceFactor[]
}

/**
 * Perché due numeri e non uno.
 *
 * Un'unica "affidabilità" che somma geometria delle stazioni e orizzonte previsionale non è
 * azionabile: chi legge 50 non sa se la zona è mal coperta — e lo sarà anche domani — oppure se
 * sta semplicemente guardando dopodomani. Sono decisioni diverse: nel primo caso cambi zona, nel
 * secondo riguardi fra due giorni.
 */

/**
 * Confidence complessiva: media pesata **per il contributo al punteggio**, non aritmetica.
 * Non sapere il vento quando il vento non morde non e' un problema; non sapere la pioggia lo e'.
 */
export function aggregateConfidence(input: AggregateConfidenceInput): AggregateConfidence {
  let weighted = 0
  let dataWeighted = 0
  let forecastWeighted = 0
  let totalWeight = 0
  const factors: ConfidenceFactor[] = []

  for (const variable of input.variables) {
    const weight = input.weights[variable.variable] ?? 0
    if (weight <= 0) continue
    weighted += variable.score * weight
    totalWeight += weight

    // Qualità del dato: tutto tranne i termini che dipendono dal guardare avanti nel tempo.
    const c = variable.components
    dataWeighted +=
      100 *
      (c['geometry'] ?? 1) *
      (c['density'] ?? 1) *
      (c['provenance'] ?? 1) *
      (c['validation'] ?? 1) *
      (c['coverage'] ?? 1) *
      weight
    // Certezza della previsione: solo orizzonte e accordo fra modelli.
    forecastWeighted += 100 * (c['horizon'] ?? 1) * (c['agreement'] ?? 1) * weight

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

  const round = (value: number): number =>
    totalWeight === 0 ? 0 : Math.round((value / totalWeight) * 10) / 10

  return {
    score: round(weighted),
    dataQuality: round(dataWeighted),
    forecastCertainty: round(forecastWeighted),
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
      return 'Umidità del suolo'
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
