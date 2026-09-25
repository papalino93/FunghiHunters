import { describe, expect, it } from 'vitest'

import type { DailyWeather } from '@/lib/model/features'
import {
  blendRain,
  buildRainBlendUrl,
  rainBlendByDate,
  rainBlendWeightPerPoint,
  RAIN_BLEND_MODEL,
} from '@/lib/pipeline/open-meteo-series'

function day(date: string, rain: number | null): DailyWeather {
  return {
    date, precipitationMm: rain, temperatureMaxC: 20, temperatureMinC: 10, et0Mm: 2, windMs: 2,
    soilMoisture: 0.25, soilTemperatureC: 14, vpdKpa: 0.5, relativeHumidityPercent: 70,
    provenance: 'MODELLED',
  }
}

describe('pioggia, media di due modelli', () => {
  it('chiede solo la pioggia di ICON-2I, per pochi giorni', () => {
    const url = new URL(buildRainBlendUrl([{ latitude: 43.7, longitude: 11.1, elevationM: 300 }]))
    expect(url.searchParams.get('models')).toBe(RAIN_BLEND_MODEL)
    expect(url.searchParams.get('daily')).toBe('precipitation_sum')
    expect(url.searchParams.has('hourly')).toBe(false)
    expect(rainBlendWeightPerPoint()).toBeLessThan(2.5)
  })

  it('media dove ci sono entrambi, lascia com\'era il resto', () => {
    const other = rainBlendByDate({ daily: { time: ['2026-09-10', '2026-09-11'], precipitation_sum: [40, null] } })
    const out = blendRain([day('2026-09-09', 5), day('2026-09-10', 6), day('2026-09-11', 3), day('2026-09-12', null)], other)
    expect(out.map((d) => d.precipitationMm)).toEqual([5, 23, 3, null])
    expect(out[1]?.temperatureMaxC).toBe(20)
  })

  it('accetta anche la chiave con il suffisso del modello', () => {
    const m = rainBlendByDate({ daily: { time: ['2026-09-10'], precipitation_sum_italia_meteo_arpae_icon_2i: [12] } })
    expect(m.get('2026-09-10')).toBe(12)
    expect(rainBlendByDate({}).size).toBe(0)
  })
})

describe('pagina Meteo, stessa media', () => {
  it('media la pioggia giornaliera e lo dichiara', async () => {
    const { blendPlaceRain } = await import('@/lib/sources/open-meteo-place')
    const base = {
      latitude: 43.7, longitude: 11.1, elevationM: 300, current: null, hourlyByDate: {},
      daily: [
        { date: '2026-09-10', precipitationMm: 2, temperatureMaxC: 25, temperatureMinC: 15, windMaxKmh: 10, windGustMaxKmh: 20, et0Mm: 3, humidityMeanPercent: 60, vpdMeanKpa: 1, soilMoistureMean: 0.2, soilTemperatureMeanC: 18, weatherCode: 3, isForecast: false },
        { date: '2026-09-11', precipitationMm: 0, temperatureMaxC: 25, temperatureMinC: 15, windMaxKmh: 10, windGustMaxKmh: 20, et0Mm: 3, humidityMeanPercent: 60, vpdMeanKpa: 1, soilMoistureMean: 0.2, soilTemperatureMeanC: 18, weatherCode: 3, isForecast: false },
      ],
    }
    const out = blendPlaceRain(base, new Map([['2026-09-10', 34]]))
    expect(out.daily.map((d) => d.precipitationMm)).toEqual([18, 0])
    expect(out.rainBlended).toBe(true)
    expect(blendPlaceRain(base, new Map()).rainBlended).toBe(false)
  })
})
