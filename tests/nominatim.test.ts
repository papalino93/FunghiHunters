/**
 * Test del parsing della geocodifica inversa (Nominatim): puro, nessuna rete.
 *
 * La forma della risposta è quella reale, verificata con una richiesta a
 * `nominatim.openstreetmap.org/reverse?format=jsonv2` su un punto vero in Toscana.
 */
import { describe, expect, it } from 'vitest'

import { parseReverseGeocode } from '@/lib/sources/nominatim'

describe('geocodifica inversa: priorità del nome', () => {
  it('preferisce il quartiere/frazione al comune, e riporta il comune come secondo livello', () => {
    const risultato = parseReverseGeocode({
      name: 'Capannuccia',
      address: { hamlet: 'Capannuccia', village: 'San Colombano', town: 'Scandicci', county: 'Firenze' },
    })
    expect(risultato).toEqual({ name: 'Capannuccia', admin1: 'Scandicci' })
  })

  it('senza un livello locale, usa direttamente il comune e non ripete il nome due volte', () => {
    const risultato = parseReverseGeocode({ address: { city: 'Firenze', county: 'Firenze' } })
    expect(risultato).toEqual({ name: 'Firenze', admin1: null })
  })

  it('scende fino alla provincia quando non c\'è nemmeno un comune', () => {
    const risultato = parseReverseGeocode({ address: { county: 'Grosseto' } })
    expect(risultato).toEqual({ name: 'Grosseto', admin1: null })
  })

  it('usa il campo "name" di primo livello come ultima risorsa', () => {
    const risultato = parseReverseGeocode({ name: 'Mar Tirreno', address: {} })
    expect(risultato).toEqual({ name: 'Mar Tirreno', admin1: null })
  })

  it('restituisce null quando non c\'è proprio nulla da mostrare (es. alto mare)', () => {
    expect(parseReverseGeocode({ address: {} })).toBeNull()
    expect(parseReverseGeocode({})).toBeNull()
  })

  it('rifiuta una risposta di forma sbagliata invece di restituire dati inventati', () => {
    expect(() => parseReverseGeocode({ address: { city: 42 } })).toThrow()
  })
})
