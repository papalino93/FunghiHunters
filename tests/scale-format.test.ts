import { describe, expect, it } from 'vitest'

import { formatValue, mpiBand, mpiBandColor, mpiBandInk } from '@/lib/ui/scale'

describe('formatValue', () => {
  it('usa la virgola decimale italiana', () => {
    expect(formatValue(0.5, 'mm', 1)).toBe('0,5 mm')
    expect(formatValue(18.44, '°C', 1)).toBe('18,4 °C')
    expect(formatValue(1234.5, 'mm', 0)).toBe('1235 mm')
  })

  it('niente zero negativo e trattino per il dato mancante', () => {
    expect(formatValue(-0.04, 'mm', 1)).toBe('0,0 mm')
    expect(formatValue(null, 'mm')).toBe('—')
  })
})

describe('scala del punteggio', () => {
  it('cinque gradini con gli stessi confini delle etichette', () => {
    expect([0, 19.9, 20, 39, 40, 60, 80, 100].map(mpiBand)).toEqual([0, 0, 1, 1, 2, 3, 4, 4])
    expect(mpiBandColor(98)).toBe('var(--mpi-4)')
    expect(mpiBandInk(10)).toBe('var(--mpi-ink-0)')
  })
})
