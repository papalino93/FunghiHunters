/**
 * Test dell'ordinamento "Dove vado oggi".
 *
 * Il punto da proteggere: l'ordinamento non è il punteggio. Deve tenere conto della distanza e
 * dell'affidabilità, perché è quello che fa un cercatore quando decide dove andare.
 */

import { describe, expect, it } from 'vitest'

import type { SnapshotZone } from '@/lib/snapshot/types'
import {
  availableForestTypes,
  bestDayFrom,
  excludedZones,
  rankZones,
  suggestedTiming,
  trend72h,
} from '@/lib/recommend/rank'

const TODAY = '2026-09-17'

function zone(
  code: string,
  overrides: {
    mpi?: number
    confidence?: number
    lat?: number
    lon?: number
    elevationM?: number
    forest?: string[]
    series?: Array<{ date: string; mpi: number }>
  } = {},
): SnapshotZone {
  const mpi = overrides.mpi ?? 30
  const confidence = overrides.confidence ?? 70
  const series = (overrides.series ?? [
    { date: TODAY, mpi },
    { date: '2026-09-18', mpi },
    { date: '2026-09-19', mpi },
    { date: '2026-09-20', mpi },
  ]).map((p) => ({
    date: p.date,
    mpi: p.mpi,
    confidence,
    dataQuality: confidence,
    forecastCertainty: 100,
    provenance: 'MODELLED' as const,
    rainMm: 0,
    tMinC: 10,
    tMaxC: 18,
    windMs: null,
  }))

  return {
    code,
    name: code,
    reference: code,
    province: 'LU',
    municipality: null,
    latitude: overrides.lat ?? 44,
    longitude: overrides.lon ?? 10.4,
    elevationM: overrides.elevationM ?? 1000,
    forest: overrides.forest ?? ['faggeta'],
    stationNotes: '',
    mpi,
    confidence,
    label: 'condizioni poco favorevoli',
    limitingFactor: 'Temperatura',
    development: 0,
    series,
    weather: {
      rain24h: 0, rain72h: 0, rain7d: 0, rain14d: 0, rain26d: 0,
      effectiveWaterMm: 0, initialDeficitMm: 0, et0_7d: 0, et0_14d: 0,
      tMean20d: 18, tMinWindow: 8, tMaxWindow: 24, soilTemperatureMean: 15,
      soilMoisture: 0.2, vpdMean7d: 0.6, windMean7d: 2, humidityMean7d: 70,
    },
    positiveFactors: [], negativeFactors: [], neutralFactors: [], stations: [],
    dataQuality: confidence, forecastCertainty: 100,
    bestWindow: null, observedDays: 0, windowDays: 61, lastObservedDate: null,
    thermalOptimumC: 13, lapseRateCPerKm: null, nearbyMunicipalities: [],
  }
}

describe('ordinamento delle aree', () => {
  it('senza posizione ordina per potenziale e affidabilità', () => {
    const result = rankZones([zone('bassa', { mpi: 10 }), zone('alta', { mpi: 50 })], {
      date: TODAY,
      from: null,
    })
    expect(result.map((s) => s.zone.code)).toEqual(['alta', 'bassa'])
    expect(result[0]?.distanceKm).toBeNull()
  })

  it('la distanza sposta l ordine fra zone di potenziale simile', () => {
    // È il caso reale: un 30 a venti minuti batte un 34 a due ore e mezza.
    const vicina = zone('vicina', { mpi: 30, lat: 44.0, lon: 10.4 })
    const lontana = zone('lontana', { mpi: 34, lat: 42.9, lon: 11.7 })
    const result = rankZones([lontana, vicina], {
      date: TODAY,
      from: { latitude: 44.0, longitude: 10.4 },
    })
    expect(result[0]?.zone.code).toBe('vicina')
    expect(result[0]?.distanceKm).toBe(0)
    expect((result[1]?.distanceKm ?? 0)).toBeGreaterThan(100)
  })

  it('ma la distanza non salva una zona senza potenziale', () => {
    const risultato = rankZones(
      [zone('scarsa', { mpi: 2, lat: 44.0, lon: 10.4 }), zone('buona', { mpi: 60, lat: 42.9, lon: 11.7 })],
      { date: TODAY, from: { latitude: 44.0, longitude: 10.4 } },
    )
    expect(risultato[0]?.zone.code).toBe('buona')
  })

  it('l affidabilità separa due zone altrimenti identiche', () => {
    const result = rankZones(
      [zone('incerta', { mpi: 30, confidence: 35 }), zone('solida', { mpi: 30, confidence: 85 })],
      { date: TODAY, from: null },
    )
    expect(result[0]?.zone.code).toBe('solida')
  })

  it('spiega in chiaro perché una zona sta in quella posizione', () => {
    const result = rankZones([zone('x', { mpi: 45, confidence: 80, lat: 44, lon: 10.4 })], {
      date: TODAY,
      from: { latitude: 44, longitude: 10.4 },
    })
    const reasons = result[0]?.reasons.join(' | ') ?? ''
    expect(reasons).toMatch(/potenziale/)
    expect(reasons).toMatch(/0 km da te/)
    expect(reasons).toMatch(/stazioni vicine/)
    expect(reasons).toMatch(/limite principale/)
  })
})

describe('filtri', () => {
  const zones = [
    zone('alta', { elevationM: 1400, forest: ['faggeta'], lat: 44, lon: 10.4 }),
    zone('bassa', { elevationM: 500, forest: ['cerreta', 'leccio'], lat: 43.1, lon: 11 }),
  ]
  const from = { latitude: 44, longitude: 10.4 }

  it('filtra per distanza massima', () => {
    const result = rankZones(zones, { date: TODAY, from, maxDistanceKm: 50 })
    expect(result.map((s) => s.zone.code)).toEqual(['alta'])
  })

  it('filtra per quota', () => {
    expect(rankZones(zones, { date: TODAY, from, minElevationM: 1000 })).toHaveLength(1)
    expect(rankZones(zones, { date: TODAY, from, maxElevationM: 800 })[0]?.zone.code).toBe('bassa')
  })

  it('filtra per tipo di bosco', () => {
    const result = rankZones(zones, { date: TODAY, from, forestTypes: ['leccio'] })
    expect(result.map((s) => s.zone.code)).toEqual(['bassa'])
  })

  it('filtra per affidabilità minima', () => {
    const misto = [zone('debole', { confidence: 30 }), zone('forte', { confidence: 90 })]
    const result = rankZones(misto, { date: TODAY, from: null, minDataQuality: 50 })
    expect(result.map((s) => s.zone.code)).toEqual(['forte'])
  })

  it('un filtro che non lascia nulla restituisce lista vuota, non un ripiego', () => {
    // Meglio dire "nessuna area corrisponde" che mostrare qualcosa che non rispetta i filtri.
    // La posizione è lontana da entrambe le zone, altrimenti quella a distanza zero passerebbe.
    const altrove = { latitude: 45.5, longitude: 9.2 }
    expect(rankZones(zones, { date: TODAY, from: altrove, maxDistanceKm: 10 })).toHaveLength(0)
  })
})

describe('aree escluse: mai nascoste senza motivo', () => {
  const zones = [
    zone('alta', { elevationM: 1400, forest: ['faggeta'], lat: 44, lon: 10.4 }),
    zone('bassa', { elevationM: 500, forest: ['cerreta', 'leccio'], lat: 43.1, lon: 11 }),
  ]
  const from = { latitude: 44, longitude: 10.4 }

  it('una zona esclusa per distanza compare qui con il motivo, e non fra i suggerimenti', () => {
    const suggestions = rankZones(zones, { date: TODAY, from, maxDistanceKm: 50 })
    const excluded = excludedZones(zones, { date: TODAY, from, maxDistanceKm: 50 })

    expect(suggestions.map((s) => s.zone.code)).toEqual(['alta'])
    expect(excluded.map((e) => e.zone.code)).toEqual(['bassa'])
    expect(excluded[0]?.reason).toMatch(/linea d'aria/)
  })

  it('nessuna zona compare due volte: o è un suggerimento, o è esclusa, mai entrambe', () => {
    const options = { date: TODAY, from, minElevationM: 1000 }
    const suggestedCodes = new Set(rankZones(zones, options).map((s) => s.zone.code))
    const excludedCodes = new Set(excludedZones(zones, options).map((e) => e.zone.code))
    expect([...suggestedCodes].some((c) => excludedCodes.has(c))).toBe(false)
    expect(suggestedCodes.size + excludedCodes.size).toBe(zones.length)
  })

  it('senza filtri attivi, nessuna zona è esclusa', () => {
    expect(excludedZones(zones, { date: TODAY, from: null })).toHaveLength(0)
  })

  it('il motivo cita la soglia di quota, non solo "esclusa"', () => {
    const excluded = excludedZones(zones, { date: TODAY, from, minElevationM: 1000 })
    expect(excluded[0]?.reason).toMatch(/quota minima di 1000/)
  })
})

describe('andamento e giorno migliore', () => {
  const series = [
    { date: TODAY, mpi: 20 },
    { date: '2026-09-18', mpi: 25 },
    { date: '2026-09-19', mpi: 30 },
    { date: '2026-09-20', mpi: 38 },
    { date: '2026-09-21', mpi: 22 },
  ]

  it('misura la variazione a 72 ore', () => {
    expect(trend72h(zone('z', { series }), TODAY)).toBe(18)
  })

  it('trova il giorno migliore, che spesso non è oggi', () => {
    const best = bestDayFrom(zone('z', { series }), TODAY)
    expect(best?.date).toBe('2026-09-20')
    expect(best?.mpi).toBe(38)
  })

  it('dice quando il giorno migliore non è oggi', () => {
    expect(suggestedTiming({ date: '2026-09-20', mpi: 38 }, TODAY)).toMatch(/non oggi/)
    expect(suggestedTiming({ date: TODAY, mpi: 38 }, TODAY)).toMatch(/Oggi/)
  })

  it('non consiglia un giorno quando nessuno si distingue', () => {
    expect(suggestedTiming({ date: '2026-09-20', mpi: 5 }, TODAY)).toMatch(/Nessun giorno/)
  })
})

describe('costruzione dei filtri', () => {
  it('ricava i tipi di bosco dai dati invece di cablarli', () => {
    const types = availableForestTypes([
      zone('a', { forest: ['faggeta', 'abetina'] }),
      zone('b', { forest: ['faggeta', 'castagneto'] }),
    ])
    expect(types).toEqual(['abetina', 'castagneto', 'faggeta'])
  })
})
