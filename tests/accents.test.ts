import { describe, expect, it } from 'vitest'

import { withAccents } from '@/lib/ui/accents'

describe('withAccents', () => {
  it('corregge gli accenti scritti con l apostrofo', () => {
    expect(withAccents("il massimo atteso e' al giorno 12")).toBe('il massimo atteso è al giorno 12')
    expect(withAccents("piu' pioggia, perche' il suolo e' secco.")).toBe('più pioggia, perché il suolo è secco.')
    expect(withAccents("qualita' del dato")).toBe('qualità del dato')
    expect(withAccents("E' la misura")).toBe('È la misura')
  })

  it('lascia stare le elisioni', () => {
    expect(withAccents("l'habitat dell'Amiata")).toBe("l'habitat dell'Amiata")
    expect(withAccents("un po' di pioggia")).toBe("un po' di pioggia")
  })
})
