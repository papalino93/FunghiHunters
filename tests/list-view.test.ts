/**
 * `toListSnapshot`: le pagine elenco (home, diario, `/italia/[regione]`) non aprono mai il
 * dettaglio di una zona, quindi non devono ricevere il suo peso. Il test protegge due cose
 * insieme: che i quattro campi pesanti spariscano davvero, e che tutto ciò che l'elenco legge
 * davvero (serie, meteo, fattori negativi, factor di classifica) resti intatto.
 */

import { describe, expect, it } from 'vitest'

import type { SnapshotZone } from '@/lib/snapshot/types'
import { toListSnapshot } from '@/lib/snapshot/list-view'
import { bandNameFor } from '@/lib/recommend/verdict'

function zone(code: string): SnapshotZone {
  return {
    code, name: code, reference: code, province: 'LU', municipality: 'Comune',
    latitude: 44, longitude: 10.4, elevationM: 1000, forest: ['faggeta'], stationNotes: '',
    mpi: 40, confidence: 70, dataQuality: 70, forecastCertainty: 100,
    label: bandNameFor(40), limitingFactor: 'Temperatura',
    development: 0,
    series: [{ date: '2026-09-22', mpi: 40, confidence: 70, dataQuality: 70, forecastCertainty: 100, provenance: 'MODELLED', rainMm: 0, tMinC: 10, tMaxC: 20, windMs: null }],
    nearbyMunicipalities: [{ municipality: 'Vicino', province: 'Lucca', provinceAcronym: 'LU', distanceKm: 3 }],
    weather: {
      rain24h: 0, rain72h: 0, rain7d: 0, rain14d: 0, rain26d: 100,
      effectiveWaterMm: 50, initialDeficitMm: 0, et0_7d: 0, et0_14d: 0,
      tMean20d: 15, tMinWindow: 8, tMaxWindow: 24,
      soilTemperatureMean: 15, soilMoisture: 0.25, vpdMean7d: 0.6, windMean7d: 2, humidityMean7d: 70,
    },
    positiveFactors: [{ key: 'water', label: 'Acqua', contribution: 5, value: '50mm', provenance: 'calibrate' }],
    negativeFactors: [{ key: 'thermal', label: 'Temperatura', contribution: -8, value: '15°C', provenance: 'sourced' }],
    neutralFactors: [{ key: 'wind', label: 'Vento', contribution: 0, value: '2 m/s', provenance: 'calibrate' }],
    stations: [{ code: 'S1', name: 'Stazione', latitude: 44, longitude: 10.4, elevationM: 900, distanceKm: 3, elevationDiffM: 100, effectiveKm: 3, variable: 'pioggia' }],
    bestWindow: { peakDate: '2026-09-23', peakMpi: 45, start: '2026-09-22', end: '2026-09-24', narrative: 'Il potenziale sale.' },
    observedDays: 60, windowDays: 61, lastObservedDate: '2026-09-21',
    thermalOptimumC: 13, lapseRateCPerKm: -0.6,
  }
}

describe('toListSnapshot', () => {
  it('svuota i quattro campi che solo la scheda di dettaglio legge', () => {
    const out = toListSnapshot({
      generatedAt: 'x', algorithmVersion: 'v', referenceDate: '2026-09-22',
      zones: [zone('a')], sources: [], uncalibratedParams: [],
    })
    const z = out.zones[0]
    expect(z?.positiveFactors).toEqual([])
    expect(z?.neutralFactors).toEqual([])
    expect(z?.bestWindow).toBeNull()
    expect(z?.nearbyMunicipalities).toEqual([])
  })

  it('lascia intatto tutto ciò che classifica, verdetto e scheda compatta leggono davvero', () => {
    const original = zone('a')
    const out = toListSnapshot({
      generatedAt: 'x', algorithmVersion: 'v', referenceDate: '2026-09-22',
      zones: [original], sources: [], uncalibratedParams: [],
    })
    const z = out.zones[0]
    // La serie tiene giorni e campi che l'elenco legge; temperature e vento del giorno no.
    expect(z?.series.map((p) => [p.date, p.mpi, p.confidence, p.rainMm])).toEqual(
      original.series.map((p) => [p.date, Math.round(p.mpi * 10) / 10, Math.round(p.confidence * 10) / 10, p.rainMm === null ? null : Math.round(p.rainMm * 10) / 10]),
    )
    expect(z?.series.every((p) => p.tMinC === null && p.windMs === null)).toBe(true)
    expect(z?.weather).toEqual(original.weather)
    // Dei fattori negativi il verdetto legge chiave, etichetta e contributo: il resto sta nella mappa.
    expect(z?.negativeFactors.map((f) => [f.key, f.label, f.contribution])).toEqual(
      original.negativeFactors.map((f) => [f.key, f.label, Math.round(f.contribution * 10) / 10]),
    )
    expect(z?.mpi).toBe(original.mpi)
    expect(z?.limitingFactor).toBe(original.limitingFactor)
    expect(z?.thermalOptimumC).toBe(original.thermalOptimumC)
    expect(z?.forest).toEqual(original.forest)
    expect(z?.stations).toEqual(original.stations)
  })

  it('non tocca il numero di zone né i campi a livello di snapshot', () => {
    const out = toListSnapshot({
      generatedAt: '2026-09-22T06:00:00.000Z', algorithmVersion: 'v1', referenceDate: '2026-09-22',
      zones: [zone('a'), zone('b')], sources: [], uncalibratedParams: ['x'],
    })
    expect(out.zones).toHaveLength(2)
    expect(out.generatedAt).toBe('2026-09-22T06:00:00.000Z')
    expect(out.uncalibratedParams).toEqual(['x'])
  })
})
