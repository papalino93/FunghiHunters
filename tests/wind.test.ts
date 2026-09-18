/**
 * Test del modulo vento: conversione U/V, e separazione fra segnale idrico/informativo e
 * segnale di sicurezza/prudenza — mai lo stesso numero, mai dentro l'MPI.
 */

import { describe, expect, it } from 'vitest'

import {
  describeOutingWind,
  describeWaterWind,
  fromComponents,
  microclimateUncertainty,
  toComponents,
  WIND_THRESHOLD_FORTE_MS,
  WIND_THRESHOLD_TESO_MS,
} from '@/lib/model/wind'

describe('conversione U/V <-> velocità/direzione', () => {
  it('vento da nord (0°): soffia verso sud, componente v negativa e u nulla', () => {
    const { u, v } = toComponents(10, 0)
    expect(u).toBeCloseTo(0, 6)
    expect(v).toBeCloseTo(-10, 6)
  })

  it('vento da est (90°): soffia verso ovest, componente u negativa e v nulla', () => {
    const { u, v } = toComponents(10, 90)
    expect(u).toBeCloseTo(-10, 6)
    expect(v).toBeCloseTo(0, 6)
  })

  it('vento da sud (180°): soffia verso nord, componente v positiva', () => {
    const { u, v } = toComponents(10, 180)
    expect(u).toBeCloseTo(0, 6)
    expect(v).toBeCloseTo(10, 6)
  })

  it('va e torna: velocità e direzione si ricostruiscono per qualunque angolo', () => {
    for (const dir of [0, 45, 90, 135, 180, 225, 270, 315, 359]) {
      const vector = toComponents(7.3, dir)
      const polar = fromComponents(vector)
      expect(polar.speedMs).toBeCloseTo(7.3, 6)
      expect(polar.directionFromDeg).toBeCloseTo(dir, 4)
    }
  })

  it('velocità zero: la direzione non è definita, non "0" per convenzione', () => {
    const polar = fromComponents({ u: 0, v: 0 })
    expect(polar.speedMs).toBe(0)
    expect(polar.directionFromDeg).toBeNull()
  })
})

describe('vento e asciugamento del suolo (informativo, mai una penalità)', () => {
  it('dati assenti: lo dice, non finge un valore', () => {
    const result = describeWaterWind(null)
    expect(result.level).toBe('dati-insufficienti')
    expect(result.dataQuality).toBe('insufficient')
  })

  it('vento debole: messaggio neutro', () => {
    const result = describeWaterWind(3)
    expect(result.level).toBe('calma')
    expect(result.message).toMatch(/debole/)
  })

  it('vento persistente: spiega che passa dall\'ET0, non da una seconda penalità', () => {
    const result = describeWaterWind(WIND_THRESHOLD_TESO_MS + 2)
    expect(result.level).toBe('teso')
    expect(result.message).toMatch(/ET0|bilancio idrico/)
  })
})

describe('vento previsto durante l\'uscita (sicurezza, separato dal potenziale)', () => {
  it('dati assenti: lo dice esplicitamente', () => {
    expect(describeOutingWind(null).level).toBe('dati-insufficienti')
  })

  it('vento forte: messaggio di prudenza, mai un divieto assoluto', () => {
    const result = describeOutingWind(WIND_THRESHOLD_FORTE_MS + 1)
    expect(result.level).toBe('forte')
    expect(result.message).toMatch(/prudenza/)
    expect(result.message).not.toMatch(/impedisce|vietato|non uscire/i)
  })

  it('vento debole: nessun avviso', () => {
    const result = describeOutingWind(2)
    expect(result.level).toBe('calma')
  })
})

describe('incertezza microclimatica: dichiarata, non inventata', () => {
  it('senza copertura forestale nota, dice che il dato resta di campo aperto', () => {
    expect(microclimateUncertainty(null)).toMatch(/campo aperto/)
  })

  it('con copertura nota, dichiara comunque che non esiste un modello di correzione validato', () => {
    expect(microclimateUncertainty(0.7)).toMatch(/non esiste un modello validato/)
  })
})
