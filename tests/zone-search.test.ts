/**
 * `searchZones`: il pulsante «Cerca» della mappa. Deve trovare il comune comunque lo si scriva, e
 * mettere per primo quello che si sta cercando davvero.
 */

import { describe, expect, it } from 'vitest'

import { normalizeName, searchZones } from '@/lib/zones/search'

const zones = [
  { code: 'a', name: "Sant'Anna di Stazzema", score: 30 },
  { code: 'b', name: 'Stazzema', score: 64 },
  { code: 'c', name: 'Marina di Pisa', score: 5 },
  { code: 'd', name: 'Castagneto Carducci', score: 20 },
  { code: 'e', name: 'Montemignaio', score: 95 },
  { code: 'f', name: 'Città di Castello', score: 40 },
  { code: 'g', name: 'Castel del Piano', score: 50 },
]

describe('normalizeName', () => {
  it('ignora maiuscole, accenti, apostrofi e spazi in più', () => {
    expect(normalizeName("  Sant'Anna  di STAZZEMA ")).toBe('sant anna di stazzema')
    expect(normalizeName('Città')).toBe('citta')
    expect(normalizeName('Reggio-Emilia')).toBe('reggio emilia')
  })
})

describe('searchZones', () => {
  it('trova il comune comunque lo si scriva', () => {
    expect(searchZones(zones, 'sant anna').map((z) => z.code)).toEqual(['a'])
    expect(searchZones(zones, "SANT'ANNA").map((z) => z.code)).toEqual(['a'])
    expect(searchZones(zones, 'citta').map((z) => z.code)).toEqual(['f'])
  })

  it('prima chi comincia con il testo, poi chi ha una parola che comincia così, poi il resto', () => {
    // «stazzema»: Stazzema comincia così; Sant'Anna di Stazzema lo ha come parola.
    expect(searchZones(zones, 'stazzema').map((z) => z.code)).toEqual(['b', 'a'])
    // «castel»: Castel del Piano e Castagneto no (castag…); Città di Castello ha la parola.
    expect(searchZones(zones, 'castel').map((z) => z.code)).toEqual(['g', 'f'])
  })

  it('a parità di posizione vince il punteggio più alto', () => {
    expect(searchZones(zones, 'cast').map((z) => z.code)).toEqual(['g', 'd', 'f'])
  })

  it('niente testo, niente risultati; e al massimo quanti ne chiedi', () => {
    expect(searchZones(zones, '   ')).toEqual([])
    expect(searchZones(zones, 'a', 2)).toHaveLength(2)
  })

  it('trova anche a metà parola, dopo tutti gli altri', () => {
    expect(searchZones(zones, 'mignaio').map((z) => z.code)).toEqual(['e'])
  })
})
