/**
 * Ricerca dei posti per il diario (Photon, dati OpenStreetMap): puro, nessuna rete.
 *
 * La fixture è una risposta vera di `photon.komoot.io/api/?q=Lago di San Zanobi`, vicino a
 * Scandicci: il caso che ha fatto nascere la funzione.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { parsePhotonSearch, photonSearchUrl } from '@/lib/sources/photon'

const fixture = JSON.parse(readFileSync('tests/fixtures/photon-san-zanobi.sample.json', 'utf8')) as unknown

describe('ricerca di un posto', () => {
  it('trova il Lago San Zanobi a Scandicci, per primo e al posto giusto', () => {
    const [first] = parsePhotonSearch(fixture)
    expect(first?.name).toBe('Lago San Zanobi')
    expect(first?.detail).toContain('Scandicci')
    expect(first?.kind).toBe('lago')
    expect(first?.latitude).toBeCloseTo(43.7196, 3)
    expect(first?.longitude).toBeCloseTo(11.1676, 3)
  })

  it('scarta quello che non è in Italia e le risposte malformate', () => {
    expect(
      parsePhotonSearch({
        features: [
          { geometry: { coordinates: [-46.6, -23.5] }, properties: { name: 'San Zanobi', countrycode: 'BR' } },
          { geometry: {}, properties: { name: 'rotto' } },
        ],
      }),
    ).toEqual([])
    expect(parsePhotonSearch('non json')).toEqual([])
  })

  it('non ripete lo stesso posto e non ripete il comune nel dettaglio', () => {
    const feature = {
      geometry: { coordinates: [11.1, 43.7] },
      properties: { name: 'Scandicci', city: 'Scandicci', county: 'Firenze', countrycode: 'IT', osm_key: 'place', osm_value: 'town' },
    }
    const out = parsePhotonSearch({ features: [feature, feature] })
    expect(out).toHaveLength(1)
    expect(out[0]?.detail).toBe('Firenze')
    expect(out[0]?.kind).toBe('comune')
  })

  it('limita la ricerca all’Italia e la avvicina alla zona', () => {
    const url = new URL(photonSearchUrl(' Lago di San Zanobi ', { latitude: 43.71963, longitude: 11.16757 }))
    expect(url.searchParams.get('q')).toBe('Lago di San Zanobi')
    expect(url.searchParams.get('bbox')).toBe('6.5,35.3,18.6,47.1')
    expect(url.searchParams.get('lat')).toBe('43.7')
  })
})
