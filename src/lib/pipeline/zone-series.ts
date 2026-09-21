/**
 * Assemblaggio della serie meteo di una cella: osservato interpolato dove c'e', modellato dove
 * non c'e', con la provenienza dichiarata giorno per giorno e variabile per variabile.
 *
 * E' il punto in cui le due meta' del sistema si incontrano. Fino a qui il modello girava su
 * dati interamente Open-Meteo, e la confidence risultava uniformemente bassa perche' era onesta:
 * senza una sola stazione, tutto e' modellato.
 */

import { ALGORITHM_V1, type AlgorithmConfig } from '@/lib/config/algorithm'
import type { Provenance, Variable } from '@/lib/domain/types'
import type { DailyWeather } from '@/lib/model/features'
import {
  DEFAULT_VARIABLE_WEIGHTS,
  aggregateConfidence,
  variableConfidence,
  type AggregateConfidence,
} from '@/lib/model/confidence'
import {
  type StationSample,
  type TargetPoint,
  interpolate,
  type InterpolationResult,
} from '@/lib/spatial/interpolate'

/** Osservazioni disponibili per un giorno, indicizzate per grandezza. */
export type DailySamples = ReadonlyMap<Variable, readonly StationSample[]>

export interface ZoneSeriesInput {
  readonly target: TargetPoint
  /** Serie modellata di riferimento, gia' completa. */
  readonly modelSeries: readonly DailyWeather[]
  /** Osservazioni per giorno. Le date assenti restano interamente modellate. */
  readonly observationsByDate: ReadonlyMap<string, DailySamples>
  readonly config?: AlgorithmConfig
}

export interface ZoneSeriesResult {
  readonly series: readonly DailyWeather[]
  /**
   * Dettaglio dell'interpolazione del giorno piu' recente **che aveva osservazioni**.
   *
   * Non e' necessariamente l'ultimo giorno della serie: il SIR pubblica il giorno precedente,
   * quindi oggi e' sempre interamente modellato. Cercare le stazioni solo sull'ultimo giorno
   * dava zero stazioni ogni volta e una confidence piatta che nascondeva il lavoro fatto sui
   * quarantasei giorni precedenti.
   */
  readonly lastObservedInterpolation: ReadonlyMap<Variable, InterpolationResult>
  /** Data a cui si riferisce `lastObservedInterpolation`. */
  readonly lastObservedDate: string | null
  /** Quanti giorni hanno almeno una grandezza osservata. */
  readonly observedDays: number
}

/** Le grandezze che il SIR misura e che il modello usa. */
const OBSERVED_VARIABLES: readonly Variable[] = [
  'precipitation',
  'temperature_max',
  'temperature_min',
]

/**
 * Sostituisce nella serie modellata i valori che si possono stimare dalle osservazioni.
 *
 * Le grandezze che il SIR non misura — ET0, umidita' e temperatura del suolo, VPD — restano
 * modellate, ed e' giusto che sia cosi': non esiste una rete che le osservi.
 */
export function buildZoneSeries(input: ZoneSeriesInput): ZoneSeriesResult {
  const config = input.config ?? ALGORITHM_V1
  let lastInterpolation = new Map<Variable, InterpolationResult>()
  let lastObservedDate: string | null = null
  let observedDays = 0

  const series = input.modelSeries.map((day) => {
    const samples = input.observationsByDate.get(day.date)
    if (samples === undefined) return day

    const dayInterpolation = new Map<Variable, InterpolationResult>()
    let touched = false
    let precipitation = day.precipitationMm
    let tMax = day.temperatureMaxC
    let tMin = day.temperatureMinC
    let provenance: Provenance = day.provenance

    for (const variable of OBSERVED_VARIABLES) {
      const forVariable = samples.get(variable)
      if (forVariable === undefined || forVariable.length === 0) continue

      const modelValue =
        variable === 'precipitation'
          ? day.precipitationMm
          : variable === 'temperature_max'
            ? day.temperatureMaxC
            : day.temperatureMinC

      const result = interpolate({
        variable,
        target: input.target,
        samples: forVariable,
        modelValue,
        nonNegative: variable === 'precipitation',
        config,
      })

      if (result.value === null) continue
      touched = true

      if (variable === 'precipitation') precipitation = result.value
      else if (variable === 'temperature_max') tMax = result.value
      else tMin = result.value

      // La provenienza del giorno e' la migliore fra quelle delle sue grandezze: se almeno la
      // pioggia viene da stazioni vicine, il giorno non e' piu' interamente modellato.
      if (result.provenance === 'OBSERVED') provenance = 'OBSERVED'

      dayInterpolation.set(variable, result)
    }

    if (touched) {
      observedDays += 1
      // Il giorno piu' recente con osservazioni vince: la serie e' in ordine cronologico.
      lastInterpolation = dayInterpolation
      lastObservedDate = day.date
    }

    return {
      ...day,
      precipitationMm: precipitation,
      temperatureMaxC: tMax,
      temperatureMinC: tMin,
      provenance,
    }
  })

  return {
    series,
    lastObservedInterpolation: lastInterpolation,
    lastObservedDate,
    observedDays,
  }
}

export interface ZoneConfidenceInput {
  readonly interpolation: ReadonlyMap<Variable, InterpolationResult>
  /** Copertura della finestra idrica, 0-1. */
  readonly coverage: number
  /**
   * Giorni trascorsi dall'ultima osservazione disponibile.
   * Con il SIR e' normalmente 1, perche' pubblica il giorno precedente.
   */
  readonly observationAgeDays?: number
  readonly horizonDays?: number
  readonly ensembleAgreement?: number | null
  /**
   * Quanto e' noto il **tipo di bosco** della zona, 0-1 (vedi `src/lib/model/forest.ts`).
   *
   * Sta nella confidence e non nel punteggio di proposito: la mappa dei generi arborei mette il
   * castagno e il pioppo nella stessa classe, e quella e' incertezza nostra, non un bosco
   * peggiore. Chi legge deve vedere un numero meno affidabile, non un numero piu' basso.
   */
  readonly habitatCertainty?: number
  readonly config?: AlgorithmConfig
}

/**
 * Confidence della cella a partire dall'esito dell'interpolazione.
 *
 * Le grandezze che nessuno osserva entrano comunque nel conto, come modellate: nasconderle
 * gonfierebbe la confidence proprio dove il sistema sa di meno.
 */
export function zoneConfidence(input: ZoneConfidenceInput): AggregateConfidence {
  const config = input.config ?? ALGORITHM_V1
  const variables = []

  for (const variable of [...OBSERVED_VARIABLES, 'soil_moisture', 'et0'] as const) {
    const result = input.interpolation.get(variable)
    const hasObservations = result !== undefined && result.neighbours.length > 0

    variables.push(
      variableConfidence(
        {
          variable,
          provenance: result?.provenance ?? 'MODELLED',
          stations:
            result?.neighbours.map((n) => ({
              stationCode: n.stationCode,
              distanceKm: n.distanceKm,
              elevationDiffM: n.elevationDiffM,
              validated: n.validated,
            })) ?? [],
          /*
           * L'eta' del dato si applica **solo alle grandezze osservate**.
           *
           * Umidita' del suolo ed ET0 vengono dal modello, che e' aggiornato a oggi: invecchiarle
           * perche' il SIR pubblica con un giorno di ritardo non ha senso. Applicandola a tutte,
           * la confidence con le osservazioni risultava piu' bassa di quella senza.
           */
          horizonDays:
            (input.horizonDays ?? 0) + (hasObservations ? (input.observationAgeDays ?? 0) : 0),
          ensembleAgreement: input.ensembleAgreement ?? null,
          coverage: input.coverage,
        },
        config,
      ),
    )
  }

  const aggregate = aggregateConfidence({ variables, weights: DEFAULT_VARIABLE_WEIGHTS })

  const habitatCertainty = Math.min(1, Math.max(0, input.habitatCertainty ?? 1))
  if (habitatCertainty >= 1) return aggregate

  // Tocca la qualita' del dato, non la certezza della previsione: non sapere che bosco sia non
  // rende meno affidabile il meteo di dopodomani, rende meno affidabile il punteggio di oggi.
  return {
    ...aggregate,
    score: Math.round(aggregate.score * habitatCertainty * 10) / 10,
    dataQuality: Math.round(aggregate.dataQuality * habitatCertainty * 10) / 10,
    factors: [
      ...aggregate.factors,
      {
        key: 'habitat',
        label: 'Tipo di bosco riconosciuto solo in parte',
        value: `fattore ${habitatCertainty.toFixed(2)}`,
        impact: 1 - habitatCertainty,
      },
    ],
  }
}
