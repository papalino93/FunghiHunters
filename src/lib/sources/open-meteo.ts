/**
 * Adapter Open-Meteo: previsioni, rianalisi ERA5 e ensemble.
 *
 * Copre cio' che il SIR non misura: previsioni, temperatura e umidita' del suolo, ET0, VPD,
 * radiazione. Nessuna chiave, CORS aperto, e piu' localita' in una sola richiesta.
 *
 * Misure del 2026-09-17, tutte verificate:
 *   7 localita', 17 variabili, past_days=92 + forecast_days=16  -> 1.28 MB in 0.66 s
 *   500 localita', 4 variabili daily, 37 giorni                 -> 0.84 MB in 0.90 s
 *   1000 localita'                                              -> HTTP 414, URL troppo lungo
 *   ensemble 3 modelli, 10 giorni                               -> 122 membri, 55 KB in 0.19 s
 *   archivio ERA5 1991-2020 su un punto                         -> 10.958 giorni, 354 KB in 1.01 s
 *
 * Il parametro `elevation` funziona davvero: chiedendo 910 m la risposta riporta 910 m e le
 * temperature sono corrette alla quota. E' cio' che permette di usare una griglia rada di
 * ancoraggi e fare il downscaling noi.
 */

import { z } from 'zod'

import type { DateRange, GridValue, Variable } from '@/lib/domain/types'
import { PROJECT_TIMEZONE } from '@/lib/domain/time'
import { CallBudget, fetchJson } from '@/lib/sources/http'
import {
  LICENSES,
  type FetchGridRequest,
  type GridPoint,
  type GridSourceAdapter,
  type SourceCapabilities,
} from '@/lib/sources/adapter'

export const OPEN_METEO_SOURCE_CODE = 'open-meteo'

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble'

/**
 * Massimo di coordinate per richiesta.
 *
 * Il limite reale non e' dichiarato dall'API: e' la lunghezza dell'URL. Misurato: 500 localita'
 * producono un URL di 8.099 caratteri e funzionano, 1000 restituiscono HTTP 414. Stiamo
 * volutamente sotto, perche' l'URL cresce anche con il numero di variabili richieste.
 */
export const MAX_POINTS_PER_REQUEST = 400

/** Variabili giornaliere: dalla nostra grandezza al nome Open-Meteo. */
const DAILY_PARAMS: Readonly<Partial<Record<Variable, string>>> = {
  precipitation: 'precipitation_sum',
  temperature_max: 'temperature_2m_max',
  temperature_min: 'temperature_2m_min',
  et0: 'et0_fao_evapotranspiration',
  shortwave_radiation: 'shortwave_radiation_sum',
  // Il nome della nostra variabile ("mean") e' fuorviante: Open-Meteo non offre una vera media
  // giornaliera del vento nell'endpoint daily, solo il massimo. E' il valore giusto per un
  // segnale di sicurezza (raffiche), sbagliato se letto come "quanto tira vento in media" — vedi
  // `src/lib/model/wind.ts` e il commento su `penalties.wind` in `config/algorithm.ts`.
  wind_speed_mean: 'wind_speed_10m_max',
}

/**
 * Variabili orarie, che aggreghiamo noi a giornaliere.
 *
 * Umidita' del suolo, VPD e temperatura del suolo esistono solo su base oraria. La media
 * giornaliera la calcoliamo qui invece di chiedere il valore istantaneo, perche' un'istantanea
 * alle 12 non descrive lo stato idrico del suolo.
 */
const HOURLY_PARAMS: Readonly<Partial<Record<Variable, string>>> = {
  soil_temperature: 'soil_temperature_0_to_7cm',
  soil_moisture: 'soil_moisture_0_to_7cm',
  vapour_pressure_deficit: 'vapour_pressure_deficit',
  relative_humidity_mean: 'relative_humidity_2m',
  dew_point: 'dew_point_2m',
}

const UNIT_BY_VARIABLE: Readonly<Partial<Record<Variable, string>>> = {
  precipitation: 'mm',
  temperature_max: 'degC',
  temperature_min: 'degC',
  et0: 'mm',
  shortwave_radiation: 'MJ/m2',
  wind_speed_mean: 'm/s',
  soil_temperature: 'degC',
  soil_moisture: 'm3/m3',
  vapour_pressure_deficit: 'kPa',
  relative_humidity_mean: 'percent',
  dew_point: 'degC',
}

const responseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number().nullish(),
  utc_offset_seconds: z.number().optional(),
  daily: z.record(z.string(), z.union([z.array(z.string()), z.array(z.number().nullable())])).optional(),
  hourly: z
    .record(z.string(), z.union([z.array(z.string()), z.array(z.number().nullable())]))
    .optional(),
})

/** Una risposta singola oppure l'array che l'API restituisce con piu' localita'. */
const payloadSchema = z.union([responseSchema, z.array(responseSchema)])

type OpenMeteoResponse = z.infer<typeof responseSchema>

/**
 * Peso stimato di una richiesta, nel conteggio del piano gratuito.
 *
 * La formula ufficiale per il multi-localita' **non e' documentata**: l'issue open-meteo#1295 la
 * chiede ed e' senza risposta. Quella che segue e' la lettura conservativa della pagina dei
 * prezzi: oltre 10 variabili o oltre due settimane una richiesta conta piu' di una, con un
 * minimo di 14 giorni, e il numero di localita' moltiplica.
 *
 * Preferiamo sovrastimare: superare il limite non produce un errore chiaro ma un degrado, e un
 * budget che si esaurisce troppo presto costa una nottata, mentre uno sfondato costa il servizio.
 */
export function estimateCallWeight(
  pointCount: number,
  variableCount: number,
  dayCount: number,
): number {
  const variableFactor = Math.max(variableCount, 10) / 10
  const dayFactor = Math.max(dayCount, 14) / 14
  return pointCount * variableFactor * dayFactor
}

/** Spezza i punti in lotti che non sfondano la lunghezza massima dell'URL. */
export function chunkPoints(
  points: readonly GridPoint[],
  size: number = MAX_POINTS_PER_REQUEST,
): GridPoint[][] {
  const chunks: GridPoint[][] = []
  for (let i = 0; i < points.length; i += size) {
    chunks.push(points.slice(i, i + size))
  }
  return chunks
}

function splitVariables(variables: readonly Variable[]): {
  daily: Variable[]
  hourly: Variable[]
} {
  const daily: Variable[] = []
  const hourly: Variable[] = []
  for (const variable of variables) {
    if (DAILY_PARAMS[variable] !== undefined) daily.push(variable)
    else if (HOURLY_PARAMS[variable] !== undefined) hourly.push(variable)
  }
  return { daily, hourly }
}

export interface BuildUrlOptions {
  readonly baseUrl: string
  readonly points: readonly GridPoint[]
  readonly variables: readonly Variable[]
  readonly range?: DateRange
  readonly pastDays?: number
  readonly forecastDays?: number
  readonly models?: readonly string[]
}

export function buildUrl(options: BuildUrlOptions): string {
  const { daily, hourly } = splitVariables(options.variables)
  const params = new URLSearchParams()

  params.set('latitude', options.points.map((p) => p.latitude).join(','))
  params.set('longitude', options.points.map((p) => p.longitude).join(','))
  params.set('elevation', options.points.map((p) => p.elevationM).join(','))
  if (daily.length > 0) {
    params.set('daily', daily.map((v) => DAILY_PARAMS[v] ?? '').join(','))
  }
  if (hourly.length > 0) {
    params.set('hourly', hourly.map((v) => HOURLY_PARAMS[v] ?? '').join(','))
  }
  if (options.range !== undefined) {
    params.set('start_date', options.range.start)
    params.set('end_date', options.range.end)
  }
  if (options.pastDays !== undefined) params.set('past_days', String(options.pastDays))
  if (options.forecastDays !== undefined) {
    params.set('forecast_days', String(options.forecastDays))
  }
  if (options.models !== undefined && options.models.length > 0) {
    params.set('models', options.models.join(','))
  }
  params.set('timezone', PROJECT_TIMEZONE)

  return `${options.baseUrl}?${params.toString()}`
}

function asResponses(payload: unknown): OpenMeteoResponse[] {
  const parsed = payloadSchema.parse(payload)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function numbersAt(
  block: Record<string, Array<string | null> | Array<number | null>> | undefined,
  key: string,
): Array<number | null> {
  const column = block?.[key]
  if (column === undefined) return []
  return column.map((v) => (typeof v === 'number' ? v : null))
}

function timesAt(
  block: Record<string, Array<string | null> | Array<number | null>> | undefined,
): string[] {
  const column = block?.['time']
  if (column === undefined) return []
  return column.map((v) => (typeof v === 'string' ? v : ''))
}

/** Media giornaliera di una serie oraria, ignorando i buchi. */
export function aggregateHourlyToDaily(
  times: readonly string[],
  values: readonly (number | null)[],
): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>()
  for (const [i, time] of times.entries()) {
    const value = values[i]
    if (value === null || value === undefined) continue
    // Le etichette orarie sono "YYYY-MM-DDTHH:MM" nel fuso richiesto.
    const date = time.slice(0, 10)
    const entry = sums.get(date) ?? { total: 0, count: 0 }
    entry.total += value
    entry.count += 1
    sums.set(date, entry)
  }
  const out = new Map<string, number>()
  for (const [date, entry] of sums) {
    if (entry.count > 0) out.set(date, entry.total / entry.count)
  }
  return out
}

export function parseResponses(
  payload: unknown,
  points: readonly GridPoint[],
  variables: readonly Variable[],
  provenanceFor: (date: string) => GridValue['provenance'],
  runAt: string | null,
): GridValue[] {
  const responses = asResponses(payload)
  if (responses.length !== points.length) {
    // Un disallineamento silenzioso assegnerebbe i valori alle celle sbagliate: meglio fermarsi.
    throw new Error(
      `Open-Meteo ha restituito ${responses.length} risposte per ${points.length} punti richiesti`,
    )
  }

  const { daily, hourly } = splitVariables(variables)
  const out: GridValue[] = []

  for (const [index, response] of responses.entries()) {
    const point = points[index]
    if (point === undefined) continue

    const dailyTimes = timesAt(response.daily)
    for (const variable of daily) {
      const key = DAILY_PARAMS[variable]
      if (key === undefined) continue
      const values = numbersAt(response.daily, key)
      for (const [i, date] of dailyTimes.entries()) {
        if (date === '') continue
        out.push({
          latitude: point.latitude,
          longitude: point.longitude,
          elevationM: point.elevationM,
          variable,
          date,
          value: values[i] ?? null,
          unit: UNIT_BY_VARIABLE[variable] ?? '',
          provenance: provenanceFor(date),
          sourceCode: OPEN_METEO_SOURCE_CODE,
          runAt,
        })
      }
    }

    const hourlyTimes = timesAt(response.hourly)
    for (const variable of hourly) {
      const key = HOURLY_PARAMS[variable]
      if (key === undefined) continue
      const dailyMeans = aggregateHourlyToDaily(hourlyTimes, numbersAt(response.hourly, key))
      for (const [date, value] of dailyMeans) {
        out.push({
          latitude: point.latitude,
          longitude: point.longitude,
          elevationM: point.elevationM,
          variable,
          date,
          value,
          unit: UNIT_BY_VARIABLE[variable] ?? '',
          provenance: provenanceFor(date),
          sourceCode: OPEN_METEO_SOURCE_CODE,
          runAt,
        })
      }
    }
  }

  return out
}

const CAPABILITIES: SourceCapabilities = {
  variables: [
    ...(Object.keys(DAILY_PARAMS) as Variable[]),
    ...(Object.keys(HOURLY_PARAMS) as Variable[]),
  ],
  windows: ['0_24'],
  supportsIncremental: true,
  supportsDateRange: true,
  maxPointsPerRequest: MAX_POINTS_PER_REQUEST,
}

export interface OpenMeteoOptions {
  /** Budget condiviso fra tutte le chiamate del job. */
  readonly budget?: CallBudget
  readonly timeoutMs?: number
}

/**
 * Limite giornaliero del piano gratuito, in chiamate pesate.
 * Il piano non commerciale dichiara 10.000 al giorno, 5.000 all'ora e 600 al minuto.
 */
export const FREE_TIER_DAILY_WEIGHT = 10_000

/** Adapter per previsioni e passato recente (fino a 92 giorni indietro). */
export class OpenMeteoForecastAdapter implements GridSourceAdapter {
  readonly sourceCode = OPEN_METEO_SOURCE_CODE
  readonly license = LICENSES.openMeteo
  readonly capabilities = CAPABILITIES

  constructor(private readonly options: OpenMeteoOptions = {}) {}

  async fetchGridValues(request: FetchGridRequest): Promise<GridValue[]> {
    const runAt = new Date().toISOString()
    const todayIso = runAt.slice(0, 10)
    const out: GridValue[] = []

    for (const chunk of chunkPoints(request.points)) {
      const url = buildUrl({
        baseUrl: FORECAST_URL,
        points: chunk,
        variables: request.variables,
        range: request.range,
      })
      this.options.budget?.spend(
        estimateCallWeight(chunk.length, request.variables.length, daysIn(request.range)),
      )
      const payload = await fetchJson(url, { timeoutMs: this.options.timeoutMs ?? 120_000 })
      out.push(
        ...parseResponses(
          payload,
          chunk,
          request.variables,
          (date) => (date > todayIso ? 'FORECAST' : 'MODELLED'),
          runAt,
        ),
      )
    }

    return out
  }
}

/**
 * Adapter per la rianalisi ERA5.
 *
 * La provenienza e' `REANALYSIS` e non `MODELLED`: ERA5 assimila osservazioni reali ed e'
 * qualitativamente diversa da un modello previsionale girato all'indietro. Mostrarlo all'utente
 * come "rianalisi" e' piu' onesto e piu' informativo.
 */
export class OpenMeteoArchiveAdapter implements GridSourceAdapter {
  readonly sourceCode = OPEN_METEO_SOURCE_CODE
  readonly license = LICENSES.openMeteo
  readonly capabilities = CAPABILITIES

  constructor(private readonly options: OpenMeteoOptions = {}) {}

  async fetchGridValues(request: FetchGridRequest): Promise<GridValue[]> {
    const out: GridValue[] = []
    for (const chunk of chunkPoints(request.points)) {
      const url = buildUrl({
        baseUrl: ARCHIVE_URL,
        points: chunk,
        variables: request.variables,
        range: request.range,
      })
      this.options.budget?.spend(
        estimateCallWeight(chunk.length, request.variables.length, daysIn(request.range)),
      )
      const payload = await fetchJson(url, { timeoutMs: this.options.timeoutMs ?? 180_000 })
      out.push(...parseResponses(payload, chunk, request.variables, () => 'REANALYSIS', null))
    }
    return out
  }
}

function daysIn(range: DateRange): number {
  const start = Date.parse(`${range.start}T00:00:00Z`)
  const end = Date.parse(`${range.end}T00:00:00Z`)
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1)
}

export { ENSEMBLE_URL, ARCHIVE_URL, FORECAST_URL }
