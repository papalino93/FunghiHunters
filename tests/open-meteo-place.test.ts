/**
 * Test del modulo meteo-per-luogo: parsing puro, nessuna rete.
 *
 * La forma della risposta è quella reale documentata da Open-Meteo per `current`/`daily`/`hourly`
 * (stessa struttura, con meno variabili, dell'adapter di griglia già testato in
 * `open-meteo.test.ts`): qui si verifica solo la normalizzazione specifica di questo modulo —
 * aggregazione oraria->giornaliera e distinzione passato/previsione.
 */
import { describe, expect, it } from 'vitest'

import { buildPlaceForecastUrl, parsePlaceForecast } from '@/lib/sources/open-meteo-place'

describe('URL della previsione puntuale', () => {
  it('include il blocco "current" oltre a daily e hourly', () => {
    const url = buildPlaceForecastUrl(44.14, 10.66, 1350)
    expect(url).toContain('latitude=44.14')
    expect(url).toContain('elevation=1350')
    expect(url).toContain('current=temperature_2m%2Capparent_temperature')
    expect(url).toContain('daily=precipitation_sum%2Ctemperature_2m_max')
    expect(url).toContain('hourly=relative_humidity_2m%2Cvapour_pressure_deficit')
  })

  it('omette la quota quando non è nota', () => {
    const url = buildPlaceForecastUrl(44.14, 10.66, null)
    expect(url).not.toContain('elevation=')
  })
})

describe('normalizzazione della risposta', () => {
  const todayIso = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

  const payload = {
    latitude: 44.14,
    longitude: 10.66,
    elevation: 1350,
    current: {
      time: `${todayIso}T10:00`,
      temperature_2m: 12.4,
      apparent_temperature: 10.1,
      relative_humidity_2m: 76,
      precipitation: 0,
      wind_speed_10m: 3.2,
      wind_gusts_10m: 7.5,
      wind_direction_10m: 210,
      weather_code: 2,
    },
    daily: {
      time: [yesterday, todayIso, tomorrow],
      precipitation_sum: [4.2, 0, 1.1],
      temperature_2m_max: [18, 19, 17],
      temperature_2m_min: [9, 10, 8],
      wind_speed_10m_max: [5, 6, 8],
      wind_gusts_10m_max: [12, 14, 18],
      et0_fao_evapotranspiration: [2.1, 2.4, null],
    },
    hourly: {
      time: [`${yesterday}T00:00`, `${yesterday}T12:00`, `${todayIso}T00:00`, `${todayIso}T12:00`],
      relative_humidity_2m: [80, 60, 78, 58],
      vapour_pressure_deficit: [0.2, 0.9, 0.25, 0.95],
      soil_moisture_0_to_7cm: [0.3, 0.28, 0.31, 0.29],
      soil_temperature_0_to_7cm: [10, 14, 10.5, 14.5],
    },
  }

  it('aggrega le variabili orarie a giornaliere', () => {
    const result = parsePlaceForecast(payload)
    const yesterdayRow = result.daily.find((d) => d.date === yesterday)
    expect(yesterdayRow?.humidityMeanPercent).toBeCloseTo(70, 5)
    expect(yesterdayRow?.soilTemperatureMeanC).toBeCloseTo(12, 5)
  })

  it('distingue passato e previsione dalla data', () => {
    const result = parsePlaceForecast(payload)
    expect(result.daily.find((d) => d.date === yesterday)?.isForecast).toBe(false)
    expect(result.daily.find((d) => d.date === tomorrow)?.isForecast).toBe(true)
  })

  it('porta il blocco "adesso" senza perdere i null', () => {
    const result = parsePlaceForecast(payload)
    expect(result.current?.temperatureC).toBe(12.4)
    expect(result.current?.weatherCode).toBe(2)
  })

  it('non rompe quando "current" manca', () => {
    const { current, ...rest } = payload
    void current
    const result = parsePlaceForecast(rest)
    expect(result.current).toBeNull()
    expect(result.daily.length).toBe(3)
  })
})
