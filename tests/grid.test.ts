/**
 * Test della griglia pilota.
 *
 * Il punto da testare non è la geometria (approssimazione locale standard, niente di originale):
 * è che una cella senza dati risulti esplicitamente "non valutabile" e mai "favorevole" o
 * "sfavorevole" per assenza di dati — è la regola esplicitamente richiesta per questo pilota, e
 * un'inversione qui (una cella senza dati che sembra un punteggio basso invece di "non so")
 * sarebbe il tipo di falsa precisione che il progetto esiste per evitare.
 */

import { describe, expect, it } from 'vitest'

import { assessEvaluability, generateGrid, type GridCell } from '@/lib/spatial/grid'

function cell(overrides: Partial<GridCell> = {}): GridCell {
  return {
    id: 'test-1000-0-0',
    resolutionM: 1000,
    centroidLat: 43,
    centroidLon: 11,
    bounds: { south: 42.99, west: 10.99, north: 43.01, east: 11.01 },
    zoneCode: 'test',
    elevationM: null,
    slopeDeg: null,
    aspectDeg: null,
    forestFraction: null,
    adminMunicipality: null,
    adminProvince: null,
    ...overrides,
  }
}

describe('generateGrid', () => {
  it('genera almeno la cella centrale', () => {
    const cells = generateGrid({ zoneCode: 'amiata', centerLat: 42.88, centerLon: 11.66, radiusKm: 1, resolutionM: 1000 })
    expect(cells.length).toBeGreaterThan(0)
    const center = cells.find((c) => c.id === 'amiata-1000-0-0')
    expect(center?.centroidLat).toBeCloseTo(42.88, 3)
    expect(center?.centroidLon).toBeCloseTo(11.66, 3)
  })

  it('e\' deterministica: stessi argomenti, stesse celle', () => {
    const opts = { zoneCode: 'amiata', centerLat: 42.88, centerLon: 11.66, radiusKm: 3, resolutionM: 1000 }
    const a = generateGrid(opts)
    const b = generateGrid(opts)
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
  })

  it('ogni cella sta entro il raggio richiesto dal centro', () => {
    const centerLat = 43.5
    const centerLon = 11.2
    const radiusKm = 4
    const cells = generateGrid({ zoneCode: 'z', centerLat, centerLon, radiusKm, resolutionM: 1000 })
    for (const c of cells) {
      // Riconverto in km con la stessa approssimazione locale usata dal generatore, per un
      // confronto coerente — non una misura geodetica indipendente.
      const dLat = (c.centroidLat - centerLat) * 111.32
      const dLon = (c.centroidLon - centerLon) * 111.32 * Math.cos((centerLat * Math.PI) / 180)
      expect(Math.hypot(dLat, dLon)).toBeLessThanOrEqual(radiusKm + 1e-6)
    }
  })

  it('un raggio o una risoluzione non positivi tornano una griglia vuota, non un errore', () => {
    expect(generateGrid({ zoneCode: 'z', centerLat: 43, centerLon: 11, radiusKm: 0, resolutionM: 1000 })).toEqual([])
    expect(generateGrid({ zoneCode: 'z', centerLat: 43, centerLon: 11, radiusKm: 3, resolutionM: 0 })).toEqual([])
  })

  it('id distinti per ogni cella', () => {
    const cells = generateGrid({ zoneCode: 'amiata', centerLat: 42.88, centerLon: 11.66, radiusKm: 3, resolutionM: 1000 })
    expect(new Set(cells.map((c) => c.id)).size).toBe(cells.length)
  })
})

describe('assessEvaluability', () => {
  it('una cella senza copertura forestale è non valutabile, non "sfavorevole"', () => {
    const result = assessEvaluability(cell({ elevationM: 800 }))
    expect(result.status).toBe('not-evaluable')
    expect(result.reasons.join(' ')).toMatch(/copertura forestale/)
  })

  it('una cella senza quota è non valutabile', () => {
    const result = assessEvaluability(cell({ forestFraction: 0.8 }))
    expect(result.status).toBe('not-evaluable')
    expect(result.reasons.join(' ')).toMatch(/quota/)
  })

  it('una cella con troppo poco bosco è non valutabile, non semplicemente "bassa"', () => {
    const result = assessEvaluability(cell({ elevationM: 200, forestFraction: 0.02 }))
    expect(result.status).toBe('not-evaluable')
  })

  it('una cella con dati sufficienti è valutabile', () => {
    const result = assessEvaluability(cell({ elevationM: 900, forestFraction: 0.7 }))
    expect(result.status).toBe('evaluable')
    expect(result.reasons).toEqual([])
  })

  it('senza nessun dato territoriale, ogni cella generata oggi è non valutabile', () => {
    // E' il risultato onesto con le fonti attive oggi: nessuna cella deve sembrare "favorevole"
    // o "sfavorevole" solo perche' non abbiamo ancora la maschera forestale.
    const cells = generateGrid({ zoneCode: 'amiata', centerLat: 42.88, centerLon: 11.66, radiusKm: 2, resolutionM: 1000 })
    expect(cells.length).toBeGreaterThan(0)
    expect(cells.every((c) => assessEvaluability(c).status === 'not-evaluable')).toBe(true)
  })
})
