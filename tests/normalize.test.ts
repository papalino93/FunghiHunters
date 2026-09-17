import { describe, expect, it } from 'vitest'

import { looksLikeMojibake, repairMojibake } from '@/lib/normalize/mojibake'
import { parseNumeric, parseText } from '@/lib/normalize/values'

describe('riparazione della codifica dei nomi SIR', () => {
  it('ripara il caso reale osservato nell anagrafica', () => {
    // "Monte di Fo'" (Mugello) arriva dal SIR con la o accentata ri-codificata.
    const broken = 'Monte di FÃ²'
    expect(looksLikeMojibake(broken)).toBe(true)
    expect(repairMojibake(broken)).toBe('Monte di Fò')
  })

  it('ripara altri accenti e apostrofi tipici dei toponimi', () => {
    expect(repairMojibake('CittÃ  di Castello')).toBe('Città di Castello')
    expect(repairMojibake('PiÃ¹ Alto')).toBe('Più Alto')
  })

  it('lascia intatti i nomi gia corretti', () => {
    for (const name of [
      'Abbadia S. Salvatore',
      'Abbadia S. S. - Laghetto Verde',
      'Badia Prataglia',
      'Orecchiella',
      'Monte di Fò',
    ]) {
      expect(repairMojibake(name)).toBe(name)
    }
  })

  it('non tocca la stringa vuota', () => {
    expect(repairMojibake('')).toBe('')
  })

  it('e idempotente: riparare due volte non peggiora', () => {
    const once = repairMojibake('Monte di FÃ²')
    expect(repairMojibake(once)).toBe(once)
  })
})

describe('conversione dei valori grezzi', () => {
  it('converte le stringhe numeriche del SIR', () => {
    // Formato reale di SerieDati: {"Data":"...","Valore":"24.6","TipoValore":"P"}
    expect(parseNumeric('24.6')).toBe(24.6)
    expect(parseNumeric('0.0')).toBe(0)
    expect(parseNumeric('-3.2')).toBe(-3.2)
    expect(parseNumeric(18.4)).toBe(18.4)
  })

  it('restituisce null per il dato mancante e non zero', () => {
    // E' il test che protegge dal bug piu' insidioso: un buco che diventa un giorno secco.
    for (const missing of [null, undefined, '', '  ', '-', 'n.d.', 'NULL', 'NaN']) {
      expect(parseNumeric(missing)).toBeNull()
    }
  })

  it('distingue lo zero vero dal dato assente', () => {
    expect(parseNumeric('0')).toBe(0)
    expect(parseNumeric('')).toBeNull()
    expect(parseNumeric('0')).not.toBeNull()
  })

  it('scarta i valori non finiti', () => {
    expect(parseNumeric(Number.POSITIVE_INFINITY)).toBeNull()
    expect(parseNumeric('abc')).toBeNull()
  })

  it('tollera la virgola decimale', () => {
    expect(parseNumeric('24,6')).toBe(24.6)
  })

  it('normalizza i campi testuali opzionali', () => {
    expect(parseText('  Cecina ')).toBe('Cecina')
    expect(parseText('')).toBeNull()
    expect(parseText('   ')).toBeNull()
    expect(parseText(null)).toBeNull()
    expect(parseText(42)).toBeNull()
  })
})
