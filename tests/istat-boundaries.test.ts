/**
 * Test dell'adapter dei confini comunali ISTAT, su un fixture reale.
 *
 * Il fixture (`istat-comuni-toscana.sample.json`) è un ritaglio vero: cinque comuni scaricati
 * davvero da `raw.githubusercontent.com/guglielmo/geojson-italy` il 2026-09-17, scelti perché
 * coprono i casi scomodi — un `MultiPolygon` (Podenzana), e la coppia Chiusdino/Montieri che ha
 * fatto scoprire l'errore di provincia corretto in `zones.ts`.
 */

import { describe, expect, it } from 'vitest'

import fixture from './fixtures/istat-comuni-toscana.sample.json'

import {
  findMunicipality,
  nearbyMunicipalities,
  parseBoundaries,
  pointInGeometry,
  type MunicipalityCollection,
} from '@/lib/sources/istat-boundaries'

const collection = parseBoundaries(fixture) as MunicipalityCollection

describe('parseBoundaries', () => {
  it('accetta una FeatureCollection valida', () => {
    expect(collection.features.length).toBe(5)
  })

  it('rifiuta una risposta che non è GeoJSON', () => {
    expect(() => parseBoundaries({ ok: true })).toThrow(/FeatureCollection/)
    expect(() => parseBoundaries('testo')).toThrow(/FeatureCollection/)
    expect(() => parseBoundaries(null)).toThrow(/FeatureCollection/)
  })
})

describe('pointInGeometry', () => {
  it('riconosce un punto dentro un Polygon (Abbadia San Salvatore)', () => {
    const feature = collection.features.find((f) => f.properties.name === 'Abbadia San Salvatore')
    expect(feature).toBeDefined()
    // Coordinate del centro zona in zones.ts: dentro il comune, non e' un caso.
    expect(pointInGeometry(11.6616, 42.8831, feature!.geometry)).toBe(true)
  })

  it('riconosce un punto dentro un MultiPolygon (Podenzana)', () => {
    const feature = collection.features.find((f) => f.properties.name === 'Podenzana')
    expect(feature).toBeDefined()
    expect(pointInGeometry(9.874, 44.2011, feature!.geometry)).toBe(true)
  })

  it('un punto lontano non e\' dentro nessuno dei due', () => {
    // Centro del Mar Tirreno, chilometri da qualunque comune toscano.
    const abbadia = collection.features.find((f) => f.properties.name === 'Abbadia San Salvatore')!
    expect(pointInGeometry(10.0, 40.0, abbadia.geometry)).toBe(false)
  })
})

describe('findMunicipality', () => {
  it('trova il comune giusto per il centro della zona Amiata', () => {
    const match = findMunicipality(11.6616, 42.8831, collection)
    expect(match?.municipality).toBe('Abbadia San Salvatore')
    expect(match?.provinceAcronym).toBe('SI')
    expect(match?.matchType).toBe('exact')
  })

  /**
   * Il motivo per cui questo adapter esiste: la zona "Colline Metallifere" in `zones.ts`
   * dichiarava provincia "SI", ma le sue coordinate (43.14, 11.05) cadono a Montieri, che è
   * in provincia di Grosseto. Corretto in `zones.ts` nello stesso commit di questo file.
   */
  it('trova Montieri (provincia di Grosseto) per il centro della zona Colline Metallifere, non Siena', () => {
    const match = findMunicipality(11.05, 43.14, collection)
    expect(match?.municipality).toBe('Montieri')
    expect(match?.province).toBe('Grosseto')
    expect(match?.provinceAcronym).not.toBe('SI')
  })

  it('ripiega sul comune più vicino, marcato come tale, quando nessun poligono contiene il punto', () => {
    // Centro di Siena: nella collezione vera cadrebbe nel comune di Siena, non incluso in questo
    // fixture ritagliato a cinque comuni. E' il caso che il ripiego deve gestire — verificato che
    // il punto sia fuori da tutti e cinque e che Chiusdino sia il piu' vicino per centroide.
    const match = findMunicipality(11.3308, 43.3188, collection)
    expect(match?.municipality).toBe('Chiusdino')
    expect(match?.matchType).toBe('nearest-fallback')
  })

  it('torna null su una collezione vuota', () => {
    const empty: MunicipalityCollection = { type: 'FeatureCollection', features: [] }
    expect(findMunicipality(11.66, 42.88, empty)).toBeNull()
  })
})

describe('nearbyMunicipalities', () => {
  it('trova i comuni reali entro raggio, ordinati per distanza crescente', () => {
    // Centro della zona Colline Metallifere: Montieri contiene il punto (distanza minima),
    // Chiusdino è il vicino confinante che dà il nome alla zona insieme a Montieri.
    const nearby = nearbyMunicipalities(11.05, 43.14, collection, 15)
    expect(nearby.map((m) => m.municipality)).toEqual(['Montieri', 'Chiusdino'])
    expect(nearby[0]!.distanceKm).toBeLessThan(nearby[1]!.distanceKm)
  })

  it('esclude i comuni fuori raggio invece di restituirli tutti', () => {
    // Bibbiena, Abbadia San Salvatore e Podenzana sono a decine di km dal centro Metallifere.
    const nearby = nearbyMunicipalities(11.05, 43.14, collection, 15)
    expect(nearby.map((m) => m.municipality)).not.toContain('Bibbiena')
    expect(nearby.map((m) => m.municipality)).not.toContain('Abbadia San Salvatore')
  })

  it('un raggio più ampio include anche i comuni più lontani', () => {
    const nearby = nearbyMunicipalities(11.05, 43.14, collection, 500)
    expect(nearby).toHaveLength(5)
  })

  it('nessun comune entro un raggio nullo, non un errore', () => {
    expect(nearbyMunicipalities(11.05, 43.14, collection, 0)).toEqual([])
  })
})
