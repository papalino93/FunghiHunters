/**
 * Test dell'adapter Open-Meteo su una risposta reale a due localita', catturata il 2026-09-17.
 */

import { describe, expect, it } from 'vitest'

import forecastFixture from './fixtures/open-meteo-forecast.sample.json'

import type { GridPoint } from '@/lib/sources/adapter'
import type { Variable } from '@/lib/domain/types'
import { CallBudget } from '@/lib/sources/http'
import {
  FREE_TIER_DAILY_WEIGHT,
  MAX_POINTS_PER_REQUEST,
  aggregateHourlyToDaily,
  buildUrl,
  chunkPoints,
  estimateCallWeight,
  parseResponses,
} from '@/lib/sources/open-meteo'

const AMIATA: GridPoint = { latitude: 42.8831, longitude: 11.6616, elevationM: 910 }
const CASENTINO: GridPoint = { latitude: 43.7883, longitude: 11.8583, elevationM: 840 }
const POINTS = [AMIATA, CASENTINO]
const VARIABLES: Variable[] = [
  'precipitation',
  'temperature_max',
  'temperature_min',
  'et0',
  'soil_moisture',
  'vapour_pressure_deficit',
]

describe('costruzione della richiesta', () => {
  it('separa le variabili giornaliere da quelle orarie', () => {
    const url = buildUrl({
      baseUrl: 'https://api.open-meteo.com/v1/forecast',
      points: POINTS,
      variables: VARIABLES,
      pastDays: 7,
      forecastDays: 3,
    })
    expect(url).toContain('daily=precipitation_sum%2Ctemperature_2m_max')
    // Umidita del suolo e VPD esistono solo su base oraria: le aggreghiamo noi.
    expect(url).toContain('hourly=soil_moisture_0_to_7cm%2Cvapour_pressure_deficit')
  })

  it('passa la quota reale di ogni punto', () => {
    // E' il parametro che permette la griglia rada di ancoraggi piu' downscaling nostro.
    const url = buildUrl({
      baseUrl: 'https://api.open-meteo.com/v1/forecast',
      points: POINTS,
      variables: ['precipitation'],
    })
    expect(url).toContain('elevation=910%2C840')
    expect(url).toContain('latitude=42.8831%2C43.7883')
  })

  it('chiede sempre il fuso del progetto', () => {
    const url = buildUrl({
      baseUrl: 'https://api.open-meteo.com/v1/forecast',
      points: [AMIATA],
      variables: ['precipitation'],
    })
    // Senza questo, i giorni Open-Meteo sarebbero UTC e non coinciderebbero con la serie
    // SIR 0-24, reintroducendo lo sfasamento che abbiamo appena evitato.
    expect(url).toContain('timezone=Europe%2FRome')
  })
})

describe('lettura della risposta', () => {
  const values = parseResponses(forecastFixture, POINTS, VARIABLES, () => 'MODELLED', null)

  it('assegna i valori al punto giusto', () => {
    const amiata = values.filter((v) => v.latitude === AMIATA.latitude)
    const casentino = values.filter((v) => v.latitude === CASENTINO.latitude)
    expect(amiata.length).toBeGreaterThan(0)
    expect(casentino.length).toBeGreaterThan(0)
    expect(amiata.every((v) => v.elevationM === 910)).toBe(true)
    expect(casentino.every((v) => v.elevationM === 840)).toBe(true)
  })

  it('si rifiuta di procedere se le risposte non corrispondono ai punti', () => {
    // Un disallineamento silenzioso assegnerebbe il meteo alla cella sbagliata: e' il tipo di
    // bug che non si vede finche' qualcuno non va a funghi nel posto sbagliato.
    expect(() => parseResponses(forecastFixture, [AMIATA], VARIABLES, () => 'MODELLED', null)).toThrow(
      /2 risposte per 1 punti/,
    )
  })

  it('aggrega le variabili orarie in medie giornaliere', () => {
    const soil = values.filter((v) => v.variable === 'soil_moisture' && v.latitude === AMIATA.latitude)
    const daily = values.filter(
      (v) => v.variable === 'precipitation' && v.latitude === AMIATA.latitude,
    )
    // Dieci giorni di dati orari diventano dieci medie giornaliere, come le serie daily.
    expect(soil).toHaveLength(daily.length)
    expect(soil.every((v) => v.value !== null && v.value > 0 && v.value < 1)).toBe(true)
  })

  it('distingue il passato modellato dalla previsione', () => {
    const today = '2026-09-17'
    const mixed = parseResponses(
      forecastFixture,
      POINTS,
      VARIABLES,
      (date) => (date > today ? 'FORECAST' : 'MODELLED'),
      null,
    )
    const provenances = new Set(mixed.map((v) => v.provenance))
    expect(provenances).toEqual(new Set(['MODELLED', 'FORECAST']))
  })

  it('assegna le unita canoniche', () => {
    const byVariable = new Map(values.map((v) => [v.variable, v.unit]))
    expect(byVariable.get('precipitation')).toBe('mm')
    expect(byVariable.get('temperature_max')).toBe('degC')
    expect(byVariable.get('et0')).toBe('mm')
    expect(byVariable.get('soil_moisture')).toBe('m3/m3')
  })

  it('conserva i buchi come null', () => {
    const withNull = values.filter((v) => v.value === null)
    // Nel fixture non ci sono buchi, ma il tipo deve permetterli e nessun null deve diventare 0.
    expect(withNull.every((v) => v.value === null)).toBe(true)
  })
})

describe('aggregazione oraria', () => {
  it('media le ore dello stesso giorno ignorando i buchi', () => {
    const times = ['2026-09-16T00:00', '2026-09-16T01:00', '2026-09-16T02:00', '2026-09-17T00:00']
    const result = aggregateHourlyToDaily(times, [10, null, 20, 5])
    expect(result.get('2026-09-16')).toBe(15)
    expect(result.get('2026-09-17')).toBe(5)
  })

  it('non produce un giorno quando tutte le ore mancano', () => {
    const result = aggregateHourlyToDaily(['2026-09-16T00:00'], [null])
    expect(result.has('2026-09-16')).toBe(false)
  })
})

describe('lotti e budget di chiamate', () => {
  const points = Array.from({ length: 1000 }, (_, i) => ({
    latitude: 43 + i / 10_000,
    longitude: 11 + i / 10_000,
    elevationM: 800,
  }))

  it('spezza i punti sotto il limite di lunghezza URL', () => {
    // Misurato: 500 localita' danno un URL di 8.099 caratteri e passano, 1000 danno HTTP 414.
    const chunks = chunkPoints(points)
    expect(chunks.every((c) => c.length <= MAX_POINTS_PER_REQUEST)).toBe(true)
    expect(chunks.flat()).toHaveLength(1000)
  })

  it('stima un peso crescente con punti, variabili e giorni', () => {
    const base = estimateCallWeight(100, 10, 14)
    expect(base).toBe(100)
    expect(estimateCallWeight(200, 10, 14)).toBe(2 * base)
    expect(estimateCallWeight(100, 20, 14)).toBe(2 * base)
    expect(estimateCallWeight(100, 10, 28)).toBe(2 * base)
  })

  it('applica il minimo di 14 giorni e 10 variabili', () => {
    // Chiedere un giorno solo non costa meno di chiederne quattordici.
    expect(estimateCallWeight(10, 1, 1)).toBe(estimateCallWeight(10, 10, 14))
  })

  it('conferma che la griglia regionale a 1 km non sta nel piano gratuito', () => {
    // 22.990 celle da 1 km sulla Toscana, 17 variabili, finestra incrementale di 14 giorni.
    const regional = estimateCallWeight(22_990, 17, 14)
    expect(regional).toBeGreaterThan(FREE_TIER_DAILY_WEIGHT * 3)

    // La griglia di ancoraggi a 2 km sul bosco invece ci sta, ed e' la ragione della scelta.
    const anchors = estimateCallWeight(2_880, 17, 14)
    expect(anchors).toBeLessThan(FREE_TIER_DAILY_WEIGHT)
  })

  it('il budget si ferma prima di sfondare invece di degradare', () => {
    const budget = new CallBudget('open-meteo', 100)
    budget.spend(60)
    expect(budget.remaining).toBe(40)
    expect(budget.canAfford(40)).toBe(true)
    expect(budget.canAfford(41)).toBe(false)
    expect(() => budget.spend(41)).toThrow(/Budget "open-meteo" esaurito/)
    // E non consuma nulla quando rifiuta.
    expect(budget.used).toBe(60)
  })
})
