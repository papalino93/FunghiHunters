/**
 * Il meteo storico del backtest: una richiesta all'archivio Open-Meteo per localita'-anno.
 *
 * Qui dentro c'e' solo il contratto con la fonte e la conversione a `DailyWeather`, come in
 * `src/lib/pipeline/open-meteo-series.ts` per la previsione. Le differenze sono tre, e tutte
 * volute:
 *
 * - **modello `era5_seamless`** (ERA5-Land 0.1°, circa 9 km, completato da ERA5 dove ERA5-Land
 *   non ha la variabile) invece del `best_match` della previsione: e' una rianalisi omogenea su
 *   tutti i dieci anni, mentre il best_match dell'archivio cambia sorgente nel tempo e un'AUC
 *   diversa fra il 2016 e il 2024 potrebbe venire da li';
 * - **vento chiesto in m/s** (`wind_speed_unit=ms`), quindi niente divisione per 3.6;
 * - **nessuna umidita' relativa**: non entra nel punteggio, e ogni variabile in piu' si paga in
 *   peso sulla quota giornaliera.
 *
 * La quota: se il record GBIF la dichiara si passa a Open-Meteo, che corregge la temperatura
 * con il gradiente verticale; altrimenti non si passa, e Open-Meteo usa il suo modello digitale
 * del terreno a 90 m e la restituisce nella risposta. E' quella che entra nel modello.
 */

import type { DailyWeather } from '@/lib/model/features'
import { dailyMean } from '@/lib/pipeline/open-meteo-series'
import { PROJECT_TIMEZONE, daysBetween } from '@/lib/domain/time'
import { estimateCallWeight } from '@/lib/sources/open-meteo'

export const ARCHIVE_API_URL = 'https://archive-api.open-meteo.com/v1/archive'
export const ARCHIVE_MODEL = 'era5_seamless'

export const ARCHIVE_DAILY = [
  'precipitation_sum',
  'temperature_2m_max',
  'temperature_2m_min',
  'et0_fao_evapotranspiration',
  'wind_speed_10m_max',
] as const

export const ARCHIVE_HOURLY = [
  'soil_moisture_0_to_7cm',
  'soil_temperature_0_to_7cm',
  'vapour_pressure_deficit',
] as const

/** Finestra di ogni richiesta: dal 1 aprile, per avere storia prima dei casi di maggio. */
export const SEASON_START = '04-01'
export const SEASON_END = '11-30'

export interface ArchiveRequest {
  readonly latitude: number
  readonly longitude: number
  readonly year: number
  /** Quota dichiarata dal record; `null` per lasciare quella del DEM di Open-Meteo. */
  readonly elevationM: number | null
}

export function archiveUrl(request: ArchiveRequest): string {
  const params = new URLSearchParams({
    latitude: request.latitude.toFixed(5),
    longitude: request.longitude.toFixed(5),
    start_date: `${request.year}-${SEASON_START}`,
    end_date: `${request.year}-${SEASON_END}`,
    daily: ARCHIVE_DAILY.join(','),
    hourly: ARCHIVE_HOURLY.join(','),
    models: ARCHIVE_MODEL,
    wind_speed_unit: 'ms',
    timezone: PROJECT_TIMEZONE,
  })
  if (request.elevationM !== null) params.set('elevation', String(Math.round(request.elevationM)))
  return `${ARCHIVE_API_URL}?${params.toString()}`
}

/** Peso di una richiesta sulla quota Open-Meteo: 244 giorni e 8 variabili pesano circa 17.4. */
export function archiveCallWeight(year: number): number {
  const days = daysBetween(`${year}-${SEASON_START}`, `${year}-${SEASON_END}`) + 1
  return estimateCallWeight(1, ARCHIVE_DAILY.length + ARCHIVE_HOURLY.length, days)
}

type Series = Array<number | null>

export interface ArchiveResponse {
  readonly latitude: number
  readonly longitude: number
  readonly elevation: number
  readonly daily: { readonly time: string[] } & Partial<Record<(typeof ARCHIVE_DAILY)[number], Series>>
  readonly hourly?: { readonly time: string[] } & Partial<
    Record<(typeof ARCHIVE_HOURLY)[number], Series>
  >
}

export interface ArchiveSeries {
  /** Quota della cella usata dal modello. */
  readonly elevationM: number
  readonly days: DailyWeather[]
}

/**
 * Converte la risposta in serie giornaliera.
 *
 * Una variabile che l'archivio non restituisce diventa `null` giorno per giorno, non zero: il
 * modello tratta il `null` come dato mancante (pioggia non coperta, suolo a deficit intermedio)
 * e sarebbe sbagliato fargli credere a un suolo perfettamente secco.
 */
export function archiveToSeries(response: ArchiveResponse): ArchiveSeries {
  const hourlyTime = response.hourly?.time ?? []
  const hourlyMean = (key: (typeof ARCHIVE_HOURLY)[number]): Map<string, number> => {
    const values = response.hourly?.[key]
    return values === undefined ? new Map() : dailyMean(hourlyTime, values)
  }
  const soilMoisture = hourlyMean('soil_moisture_0_to_7cm')
  const soilTemp = hourlyMean('soil_temperature_0_to_7cm')
  const vpd = hourlyMean('vapour_pressure_deficit')
  const d = response.daily
  const at = (series: Series | undefined, i: number): number | null => series?.[i] ?? null

  return {
    elevationM: response.elevation,
    days: d.time.map((date, i) => ({
      date,
      precipitationMm: at(d.precipitation_sum, i),
      temperatureMaxC: at(d.temperature_2m_max, i),
      temperatureMinC: at(d.temperature_2m_min, i),
      et0Mm: at(d.et0_fao_evapotranspiration, i),
      windMs: at(d.wind_speed_10m_max, i),
      soilMoisture: soilMoisture.get(date) ?? null,
      soilTemperatureC: soilTemp.get(date) ?? null,
      vpdKpa: vpd.get(date) ?? null,
      relativeHumidityPercent: null,
      provenance: 'REANALYSIS',
    })),
  }
}
