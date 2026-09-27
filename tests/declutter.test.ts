/**
 * `pickFullPins`: la mappa a zoom regionale non deve più impilare 226 gocce una sull'altra.
 */

import { describe, expect, it } from 'vitest'

import { pickFullPins, type ScreenPoint } from '@/lib/ui/declutter'

const BOX = { width: 40, height: 50 }

function p(code: string, x: number, y: number, priority: number): ScreenPoint {
  return { code, x, y, priority }
}

describe('pickFullPins', () => {
  it('zone lontane fra loro diventano tutte gocce', () => {
    const full = pickFullPins([p('a', 0, 100, 10), p('b', 100, 100, 20), p('c', 200, 100, 30)], BOX)
    expect([...full].sort()).toEqual(['a', 'b', 'c'])
  })

  it('fra due zone che si toccano vince il punteggio più alto; l\'altra resta pallino', () => {
    const full = pickFullPins([p('bassa', 0, 100, 2), p('alta', 10, 105, 61)], BOX)
    expect([...full]).toEqual(['alta'])
  })

  it('la zona selezionata è sempre goccia, anche se ha il punteggio più basso', () => {
    const full = pickFullPins([p('alta', 0, 100, 90), p('scelta', 5, 100, 1)], BOX, new Set(['scelta']))
    expect([...full]).toEqual(['scelta'])
  })

  it('le gocce si toccano solo se i riquadri si sovrappongono davvero', () => {
    // Affiancate a 40 px esatti: si sfiorano, non si coprono.
    expect(pickFullPins([p('a', 0, 100, 5), p('b', 40, 100, 4)], BOX).size).toBe(2)
    // Una sopra l'altra a 50 px: la punta dell'una tocca la testa dell'altra, non la copre.
    expect(pickFullPins([p('a', 0, 100, 5), p('b', 0, 150, 4)], BOX).size).toBe(2)
    expect(pickFullPins([p('a', 0, 100, 5), p('b', 0, 140, 4)], BOX).size).toBe(1)
  })

  it('a parità di punteggio sceglie sempre la stessa, qualunque sia l\'ordine d\'ingresso', () => {
    const one = pickFullPins([p('b', 0, 100, 50), p('a', 5, 100, 50)], BOX)
    const two = pickFullPins([p('a', 5, 100, 50), p('b', 0, 100, 50)], BOX)
    expect([...one]).toEqual(['a'])
    expect([...two]).toEqual(['a'])
  })

  it('un grappolo fitto lascia gocce solo dove c\'è spazio, e sempre le migliori', () => {
    const cluster = Array.from({ length: 30 }, (_, i) => p(`z${String(i).padStart(2, '0')}`, (i % 6) * 12, 100 + Math.floor(i / 6) * 12, i))
    const full = pickFullPins(cluster, BOX)
    expect(full.size).toBeGreaterThan(0)
    expect(full.size).toBeLessThan(6)
    expect(full.has('z29')).toBe(true)
  })

  it('sotto la soglia resta pallino anche con spazio libero, tranne la zona selezionata', () => {
    const points = [p('buona', 0, 100, 40), p('scarsa', 200, 100, 2), p('scelta', 400, 100, 1)]
    const full = pickFullPins(points, BOX, new Set(['scelta']), 15)
    expect([...full].sort()).toEqual(['buona', 'scelta'])
  })
})
