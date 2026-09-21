/**
 * La parte Open-Meteo della pipeline, condivisa fra lo snapshot toscano e quello nazionale.
 *
 * Stava dentro `scripts/build-snapshot.ts` come funzioni locali. E' uscita di li' quando e' nato
 * il secondo consumatore (`scripts/build-snapshot-italia.ts`): due copie della stessa conversione
 * sarebbero divergute alla prima variabile aggiunta, e lo avremmo scoperto da un punteggio
 * diverso fra Toscana e resto d'Italia sullo stesso meteo.
 *
 * Qui dentro non c'e' modello: solo il contratto con la fonte e la conversione al nostro tipo
 * `DailyWeather`. Il punteggio resta in `src/lib/model/`.
 */

import type { DailyWeather } from '@/lib/model/features'
import { PROJECT_TIMEZONE } from '@/lib/domain/time'
import { estimateCallWeight } from '@/lib/sources/open-meteo'

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

const DAILY_PARAMS =
  'precipitation_sum,temperature_2m_max,temperature_2m_min,' +
  'et0_fao_evapotranspiration,wind_speed_10m_max'

const HOURLY_PARAMS =
  'soil_moisture_0_to_7cm,soil_temperature_0_to_7cm,vapour_pressure_deficit,relative_humidity_2m'

/**
 * Punti per richiesta.
 *
 * Il limite non e' dichiarato dall'API, e' la lunghezza dell'URL: misurato in
 * `src/lib/sources/open-meteo.ts`, 500 localita' passano e 1000 danno HTTP 414. Restiamo sotto,
 * perche' l'URL cresce anche con il numero di variabili.
 */
export const MAX_POINTS_PER_REQUEST = 300

/**
 * Quante variabili meteo chiede una richiesta, contate e non scritte a mano: il peso di una
 * chiamata Open-Meteo dipende da questo numero, e una variabile aggiunta senza aggiornare la
 * costante si pagherebbe con un 429 in produzione invece che con un errore qui.
 */
export const VARIABLE_COUNT =
  DAILY_PARAMS.split(',').length + HOURLY_PARAMS.split(',').length

/**
 * Peso di una singola localita' in una richiesta di previsione.
 *
 * Open-Meteo dichiara che l'unita' e' "due settimane con dieci variabili per una localita'":
 * chiedere piu' giorni o piu' variabili conta come piu' chiamate, in frazioni. Con la nostra
 * finestra di 68 giorni una sola localita' pesa quasi 5, ed e' il motivo per cui un lotto da 300
 * punti — accettabile per la lunghezza dell'URL — sfonderebbe da solo il limite al minuto.
 */
export function forecastWeightPerPoint(pastDays: number, forecastDays: number): number {
  return estimateCallWeight(1, VARIABLE_COUNT, pastDays + forecastDays)
}

export interface OpenMeteoResponse {
  readonly daily: {
    time: string[]
    precipitation_sum: Array<number | null>
    temperature_2m_max: Array<number | null>
    temperature_2m_min: Array<number | null>
    et0_fao_evapotranspiration: Array<number | null>
    wind_speed_10m_max: Array<number | null>
  }
  readonly hourly: {
    time: string[]
    soil_moisture_0_to_7cm: Array<number | null>
    soil_temperature_0_to_7cm: Array<number | null>
    vapour_pressure_deficit: Array<number | null>
    relative_humidity_2m: Array<number | null>
  }
}

export interface ModelPoint {
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number
}

export function chunkPoints<T>(points: readonly T[], size = MAX_POINTS_PER_REQUEST): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < points.length; i += size) chunks.push(points.slice(i, i + size))
  return chunks
}

export function buildForecastUrl(
  points: readonly ModelPoint[],
  pastDays: number,
  forecastDays: number,
): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.latitude).join(','),
    longitude: points.map((p) => p.longitude).join(','),
    elevation: points.map((p) => p.elevationM).join(','),
    daily: DAILY_PARAMS,
    hourly: HOURLY_PARAMS,
    past_days: String(pastDays),
    forecast_days: String(forecastDays),
    timezone: PROJECT_TIMEZONE,
  })
  return `${FORECAST_URL}?${params.toString()}`
}

/** Media giornaliera di una serie oraria, ignorando i buchi. */
export function dailyMean(
  times: readonly string[],
  values: readonly (number | null)[],
): Map<string, number> {
  const acc = new Map<string, { total: number; count: number }>()
  for (const [i, time] of times.entries()) {
    const value = values[i]
    if (value === null || value === undefined) continue
    const date = time.slice(0, 10)
    const entry = acc.get(date) ?? { total: 0, count: 0 }
    entry.total += value
    entry.count += 1
    acc.set(date, entry)
  }
  const out = new Map<string, number>()
  for (const [date, entry] of acc) out.set(date, entry.total / entry.count)
  return out
}

export function toModelSeries(response: OpenMeteoResponse, todayIso: string): DailyWeather[] {
  const soilMoisture = dailyMean(response.hourly.time, response.hourly.soil_moisture_0_to_7cm)
  const soilTemp = dailyMean(response.hourly.time, response.hourly.soil_temperature_0_to_7cm)
  const vpd = dailyMean(response.hourly.time, response.hourly.vapour_pressure_deficit)
  const humidity = dailyMean(response.hourly.time, response.hourly.relative_humidity_2m)

  return response.daily.time.map((date, i) => {
    const wind = response.daily.wind_speed_10m_max[i]
    return {
      date,
      precipitationMm: response.daily.precipitation_sum[i] ?? null,
      temperatureMaxC: response.daily.temperature_2m_max[i] ?? null,
      temperatureMinC: response.daily.temperature_2m_min[i] ?? null,
      et0Mm: response.daily.et0_fao_evapotranspiration[i] ?? null,
      // Open-Meteo restituisce il vento in km/h.
      windMs: wind === null || wind === undefined ? null : wind / 3.6,
      soilMoisture: soilMoisture.get(date) ?? null,
      soilTemperatureC: soilTemp.get(date) ?? null,
      vpdKpa: vpd.get(date) ?? null,
      relativeHumidityPercent: humidity.get(date) ?? null,
      provenance: date > todayIso ? 'FORECAST' : 'MODELLED',
    }
  })
}
