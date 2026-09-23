/**
 * Meteo per un luogo scelto dall'utente: geocodifica + previsione puntuale.
 *
 * A differenza di `open-meteo.ts` (pensato per il job di ingestione, su una griglia di punti
 * fissi con un budget di chiamate da contabilizzare), qui il punto lo sceglie l'utente in tempo
 * reale, una richiesta alla volta: non serve budget, e serve invece un blocco "adesso" che il job
 * giornaliero non richiede. Stessa fonte già in uso nel resto del progetto — nessuna chiave,
 * nessun costo, licenza CC BY 4.0 — solo un endpoint diverso della stessa API: il geocoding.
 */

import { z } from 'zod'

import { PROJECT_TIMEZONE, addDays, today } from '@/lib/domain/time'
import { fetchJson } from '@/lib/sources/http'
import { aggregateHourlyToDaily } from '@/lib/sources/open-meteo'

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

export interface PlaceCandidate {
  readonly id: number
  readonly name: string
  /** Regione/provincia amministrativa (`admin1`/`admin2` di Open-Meteo), per distinguere omonimi. */
  readonly admin1: string | null
  readonly admin2: string | null
  readonly country: string | null
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number | null
}

const geocodingSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        elevation: z.number().nullish(),
        country: z.string().nullish(),
        admin1: z.string().nullish(),
        admin2: z.string().nullish(),
      }),
    )
    .optional(),
})

/** Cerca un luogo per nome. Nessun risultato sotto due caratteri: non vale la chiamata. */
export async function searchPlaces(query: string): Promise<PlaceCandidate[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const params = new URLSearchParams({ name: trimmed, count: '8', language: 'it', format: 'json' })
  const payload = await fetchJson(`${GEOCODING_URL}?${params.toString()}`, { timeoutMs: 10_000, attempts: 2 })
  const parsed = geocodingSchema.parse(payload)

  return (parsed.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    admin1: r.admin1 ?? null,
    admin2: r.admin2 ?? null,
    country: r.country ?? null,
    latitude: r.latitude,
    longitude: r.longitude,
    elevationM: r.elevation ?? null,
  }))
}

export interface PlaceCurrentWeather {
  readonly time: string
  readonly temperatureC: number | null
  readonly apparentTemperatureC: number | null
  readonly humidityPercent: number | null
  readonly precipitationMm: number | null
  readonly windSpeedKmh: number | null
  readonly windGustKmh: number | null
  readonly windDirectionDeg: number | null
  /** Codice WMO del tempo (0 = sereno, 61 = pioggia debole, ...). Tradotto in UI, non qui. */
  readonly weatherCode: number | null
}

export interface PlaceDailyWeather {
  readonly date: string
  readonly precipitationMm: number | null
  readonly temperatureMaxC: number | null
  readonly temperatureMinC: number | null
  /** Massimo giornaliero, non una media — stessa cautela di `windMean7d` in `model/features.ts`. */
  readonly windMaxKmh: number | null
  readonly windGustMaxKmh: number | null
  readonly et0Mm: number | null
  readonly humidityMeanPercent: number | null
  readonly vpdMeanKpa: number | null
  readonly soilMoistureMean: number | null
  readonly soilTemperatureMeanC: number | null
  readonly isForecast: boolean
}

/** Un'ora di dettaglio, per il giorno che l'utente apre nella tabella. */
export interface PlaceHourlyWeather {
  readonly time: string
  readonly temperatureC: number | null
  readonly precipitationMm: number | null
  readonly windSpeedKmh: number | null
  readonly windGustKmh: number | null
  readonly humidityPercent: number | null
  readonly vpdKpa: number | null
  readonly soilMoisture: number | null
  readonly soilTemperatureC: number | null
  readonly weatherCode: number | null
}

export interface PlaceForecast {
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number | null
  readonly current: PlaceCurrentWeather | null
  readonly daily: readonly PlaceDailyWeather[]
  /** Le stesse ore di `daily`, raggruppate per data (`YYYY-MM-DD`), per il dettaglio a richiesta. */
  readonly hourlyByDate: Readonly<Record<string, readonly PlaceHourlyWeather[]>>
}

const forecastSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number().nullish(),
  current: z
    .object({
      time: z.string(),
      temperature_2m: z.number().nullish(),
      apparent_temperature: z.number().nullish(),
      relative_humidity_2m: z.number().nullish(),
      precipitation: z.number().nullish(),
      wind_speed_10m: z.number().nullish(),
      wind_gusts_10m: z.number().nullish(),
      wind_direction_10m: z.number().nullish(),
      weather_code: z.number().nullish(),
    })
    .optional(),
  daily: z.record(z.string(), z.union([z.array(z.string()), z.array(z.number().nullable())])).optional(),
  hourly: z.record(z.string(), z.union([z.array(z.string()), z.array(z.number().nullable())])).optional(),
})

const DAILY_VARS = [
  'precipitation_sum',
  'temperature_2m_max',
  'temperature_2m_min',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'et0_fao_evapotranspiration',
] as const

const HOURLY_VARS = [
  'temperature_2m',
  'precipitation',
  'wind_speed_10m',
  'wind_gusts_10m',
  'weather_code',
  'relative_humidity_2m',
  'vapour_pressure_deficit',
  'soil_moisture_0_to_7cm',
  'soil_temperature_0_to_7cm',
] as const

const CURRENT_VARS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'weather_code',
] as const

/**
 * Quanti giorni passati chiedere: 30, per poter dire «ultima pioggia vera 13 giorni fa» anche dopo
 * due settimane asciutte (vedi `lib/meteo/forager.ts`). La tabella ne mostra solo gli ultimi
 * `TABLE_PAST_DAYS`, e il dettaglio ora per ora viene tagliato allo stesso intervallo prima di
 * lasciare il server: il mese intero serve alle somme giornaliere, non a una tabella da scorrere.
 */
const PAST_DAYS = 30
export const TABLE_PAST_DAYS = 5
const FORECAST_DAYS = 10

export function buildPlaceForecastUrl(
  latitude: number,
  longitude: number,
  elevationM: number | null,
): string {
  const params = new URLSearchParams()
  params.set('latitude', String(latitude))
  params.set('longitude', String(longitude))
  if (elevationM !== null) params.set('elevation', String(elevationM))
  params.set('current', CURRENT_VARS.join(','))
  params.set('daily', DAILY_VARS.join(','))
  params.set('hourly', HOURLY_VARS.join(','))
  /*
   * Km/h, e detto esplicitamente. È già il predefinito di Open-Meteo, ma fino al 23/09/2026 la
   * pagina Meteo li mostrava con l'etichetta «m/s»: un vento di 18 km/h letto come 18 m/s (65
   * km/h). Scritto qui, l'unità non dipende più da un predefinito altrui, e i km/h sono quelli con
   * cui in Italia si ragiona del vento.
   */
  params.set('wind_speed_unit', 'kmh')
  params.set('past_days', String(PAST_DAYS))
  params.set('forecast_days', String(FORECAST_DAYS))
  params.set('timezone', PROJECT_TIMEZONE)
  return `${FORECAST_URL}?${params.toString()}`
}

function numberColumn(
  block: Record<string, Array<string | null> | Array<number | null>> | undefined,
  key: string,
): Array<number | null> {
  const column = block?.[key]
  if (column === undefined) return []
  return column.map((v) => (typeof v === 'number' ? v : null))
}

function timeColumn(
  block: Record<string, Array<string | null> | Array<number | null>> | undefined,
): string[] {
  const column = block?.['time']
  if (column === undefined) return []
  return column.map((v) => (typeof v === 'string' ? v : ''))
}

/** Interroga Open-Meteo per un punto e normalizza la risposta. */
export async function fetchPlaceForecast(
  latitude: number,
  longitude: number,
  elevationM: number | null,
): Promise<PlaceForecast> {
  const url = buildPlaceForecastUrl(latitude, longitude, elevationM)
  const payload = await fetchJson(url, { timeoutMs: 15_000, attempts: 2 })
  return parsePlaceForecast(payload)
}

/** Pura: separata da `fetchPlaceForecast` per essere testabile senza rete, su una fixture. */
export function parsePlaceForecast(payload: unknown): PlaceForecast {
  const parsed = forecastSchema.parse(payload)

  const dailyTimes = timeColumn(parsed.daily)
  const precip = numberColumn(parsed.daily, 'precipitation_sum')
  const tMax = numberColumn(parsed.daily, 'temperature_2m_max')
  const tMin = numberColumn(parsed.daily, 'temperature_2m_min')
  const windMax = numberColumn(parsed.daily, 'wind_speed_10m_max')
  const gustMax = numberColumn(parsed.daily, 'wind_gusts_10m_max')
  const et0 = numberColumn(parsed.daily, 'et0_fao_evapotranspiration')

  const hourlyTimes = timeColumn(parsed.hourly)
  const humidityByDay = aggregateHourlyToDaily(hourlyTimes, numberColumn(parsed.hourly, 'relative_humidity_2m'))
  const vpdByDay = aggregateHourlyToDaily(hourlyTimes, numberColumn(parsed.hourly, 'vapour_pressure_deficit'))
  const soilMoistureByDay = aggregateHourlyToDaily(
    hourlyTimes,
    numberColumn(parsed.hourly, 'soil_moisture_0_to_7cm'),
  )
  const soilTempByDay = aggregateHourlyToDaily(
    hourlyTimes,
    numberColumn(parsed.hourly, 'soil_temperature_0_to_7cm'),
  )

  // Data locale (Europe/Rome), non UTC: le date giornaliere di Open-Meteo sono nel fuso richiesto
  // (`timezone=Europe/Rome` in `buildPlaceForecastUrl`), e fra mezzanotte e l'1-2 di notte UTC e
  // ora locale differiscono di un giorno — abbastanza per etichettare "previsto" il giorno corrente.
  const todayIso = today()

  const daily: PlaceDailyWeather[] = dailyTimes
    .map((date, i) => ({
      date,
      precipitationMm: precip[i] ?? null,
      temperatureMaxC: tMax[i] ?? null,
      temperatureMinC: tMin[i] ?? null,
      windMaxKmh: windMax[i] ?? null,
      windGustMaxKmh: gustMax[i] ?? null,
      et0Mm: et0[i] ?? null,
      humidityMeanPercent: humidityByDay.get(date) ?? null,
      vpdMeanKpa: vpdByDay.get(date) ?? null,
      soilMoistureMean: soilMoistureByDay.get(date) ?? null,
      soilTemperatureMeanC: soilTempByDay.get(date) ?? null,
      isForecast: date > todayIso,
    }))
    .filter((d) => d.date !== '')

  const hourlyTemp = numberColumn(parsed.hourly, 'temperature_2m')
  const hourlyPrecip = numberColumn(parsed.hourly, 'precipitation')
  const hourlyWind = numberColumn(parsed.hourly, 'wind_speed_10m')
  const hourlyGust = numberColumn(parsed.hourly, 'wind_gusts_10m')
  const hourlyCode = numberColumn(parsed.hourly, 'weather_code')
  const hourlyHumidity = numberColumn(parsed.hourly, 'relative_humidity_2m')
  const hourlyVpd = numberColumn(parsed.hourly, 'vapour_pressure_deficit')
  const hourlySoilMoisture = numberColumn(parsed.hourly, 'soil_moisture_0_to_7cm')
  const hourlySoilTemp = numberColumn(parsed.hourly, 'soil_temperature_0_to_7cm')

  const hourlyByDate: Record<string, PlaceHourlyWeather[]> = {}
  const firstHourlyDate = addDays(todayIso, -TABLE_PAST_DAYS)
  for (const [i, time] of hourlyTimes.entries()) {
    if (time === '') continue
    const date = time.slice(0, 10)
    if (date < firstHourlyDate) continue
    const hour: PlaceHourlyWeather = {
      time,
      temperatureC: hourlyTemp[i] ?? null,
      precipitationMm: hourlyPrecip[i] ?? null,
      windSpeedKmh: hourlyWind[i] ?? null,
      windGustKmh: hourlyGust[i] ?? null,
      humidityPercent: hourlyHumidity[i] ?? null,
      vpdKpa: hourlyVpd[i] ?? null,
      soilMoisture: hourlySoilMoisture[i] ?? null,
      soilTemperatureC: hourlySoilTemp[i] ?? null,
      weatherCode: hourlyCode[i] ?? null,
    }
    ;(hourlyByDate[date] ??= []).push(hour)
  }

  const current: PlaceCurrentWeather | null =
    parsed.current === undefined
      ? null
      : {
          time: parsed.current.time,
          temperatureC: parsed.current.temperature_2m ?? null,
          apparentTemperatureC: parsed.current.apparent_temperature ?? null,
          humidityPercent: parsed.current.relative_humidity_2m ?? null,
          precipitationMm: parsed.current.precipitation ?? null,
          windSpeedKmh: parsed.current.wind_speed_10m ?? null,
          windGustKmh: parsed.current.wind_gusts_10m ?? null,
          windDirectionDeg: parsed.current.wind_direction_10m ?? null,
          weatherCode: parsed.current.weather_code ?? null,
        }

  return {
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    elevationM: parsed.elevation ?? null,
    current,
    daily,
    hourlyByDate,
  }
}
