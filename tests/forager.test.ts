/**
 * Il riepilogo della pioggia della pagina Meteo: deve dire la stessa cosa che il modello vede
 * (evento da 5 mm in su), e non inventare un «giorni fa» quando mancano i dati.
 */

import { describe, expect, it } from 'vitest'

import { daysAgoLabel, foragerRainSummary } from '@/lib/meteo/forager'
import type { PlaceDailyWeather } from '@/lib/sources/open-meteo-place'

function day(date: string, rain: number | null): PlaceDailyWeather {
  return {
    date, precipitationMm: rain, temperatureMaxC: 20, temperatureMinC: 10, windMaxKmh: 10,
    windGustMaxKmh: 20, et0Mm: 2, humidityMeanPercent: 70, vpdMeanKpa: 0.5, soilMoistureMean: 0.25,
    soilTemperatureMeanC: 14, weatherCode: null, isForecast: date > '2026-09-23',
  }
}

describe('foragerRainSummary', () => {
  it("trova l'ultimo evento vero e ignora le spruzzate", () => {
    const daily = [
      day('2026-09-08', 12), day('2026-09-09', 10), // evento da 22 mm finito il 9
      ...['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'].map((d) => day(`2026-09-${d}`, 0)),
      day('2026-09-22', 2), // spruzzata: sotto i 5 mm
      day('2026-09-23', 0),
      day('2026-09-24', 8), day('2026-09-25', 0),
    ]
    const s = foragerRainSummary(daily, '2026-09-23')
    expect(s.lastEvent).toEqual({ endDate: '2026-09-09', totalMm: 22, durationDays: 2, daysAgo: 14 })
    expect(s.past7Mm).toBe(2)
    expect(s.pastMm).toBe(24)
    expect(s.pastDays).toBe(16)
    expect(s.next7Mm).toBe(8)
  })

  it('senza eventi nel periodo lo dice, non inventa una data', () => {
    const s = foragerRainSummary([day('2026-09-22', 0), day('2026-09-23', 1)], '2026-09-23')
    expect(s.lastEvent).toBeNull()
  })

  it('un giorno senza dato rende ignota la somma, non la abbassa', () => {
    const s = foragerRainSummary([day('2026-09-22', null), day('2026-09-23', 3)], '2026-09-23')
    expect(s.past7Mm).toBeNull()
  })

  it('etichette dei giorni', () => {
    expect(daysAgoLabel(0)).toBe('oggi')
    expect(daysAgoLabel(1)).toBe('ieri')
    expect(daysAgoLabel(13)).toBe('13 giorni fa')
  })
})
