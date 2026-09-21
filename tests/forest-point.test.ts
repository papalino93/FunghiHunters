/**
 * Test dello spostamento del punto di calcolo dentro il bosco.
 *
 * Il bug originale non si vedeva: il punto restava plausibile, il meteo arrivava, il punteggio
 * usciva. Era solo il meteo del posto sbagliato. Questi controlli descrivono i casi in cui lo
 * spostamento deve avvenire e quelli in cui non deve.
 */

import { describe, expect, it } from 'vitest'

import { CELL_M, cellKey, forestPoint, type WoodCell } from '@/lib/sources/forest-point'

/** Celle costruite dal loro centro: `x`,`y` e' dove sta il bosco di quella cella. */
function cells(
  entries: ReadonlyArray<{ x: number; y: number; wooded: number; total: number }>,
): Map<string, WoodCell> {
  const out = new Map<string, WoodCell>()
  for (const entry of entries) {
    out.set(cellKey(entry.x, entry.y), {
      wooded: entry.wooded,
      total: entry.total,
      sumX: entry.x * entry.wooded,
      sumY: entry.y * entry.wooded,
    })
  }
  return out
}

const ORIGIN = { x: 0, y: 0 }

describe('forestPoint', () => {
  it('non muove niente dove il bosco non c\'e\'', () => {
    const result = forestPoint(ORIGIN, cells([{ x: 0, y: 0, wooded: 0, total: 2500 }]))
    expect(result.outcome).toBe('niente-bosco')
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
  })

  it('lascia stare un punto gia\' dentro al bosco', () => {
    const result = forestPoint(ORIGIN, cells([{ x: 100, y: 0, wooded: 2000, total: 2500 }]))
    expect(result.outcome).toBe('gia-nel-bosco')
    expect(result.x).toBe(0)
    expect(result.movedM).toBe(0)
    expect(result.density).toBeCloseTo(0.8, 6)
  })

  it('porta il punto alpino giu\' nel bosco', () => {
    // Il caso Bormio: il punto sta sulla pietraia, il bosco e' due chilometri piu' in basso.
    const result = forestPoint(
      ORIGIN,
      cells([
        { x: 0, y: 0, wooded: 0, total: 2500 },
        { x: 0, y: -2000, wooded: 2000, total: 2500 },
      ]),
    )
    expect(result.outcome).toBe('spostato')
    expect(result.x).toBeCloseTo(0, 6)
    expect(result.y).toBeCloseTo(-2000, 6)
    expect(result.movedM).toBeCloseTo(2000, 6)
  })

  it('non si fa ingannare da una scheggia di cella al bordo della tessera', () => {
    // Due pixel, tutti e due a bosco: densita' 100%, ma non e' un bosco, e' un bordo.
    const result = forestPoint(
      ORIGIN,
      cells([
        { x: 1000, y: 0, wooded: 2000, total: 2500 },
        { x: -3000, y: 0, wooded: 2, total: 2 },
      ]),
    )
    expect(result.x).toBeCloseTo(1000, 6)
  })

  it('non mette il punto nella radura in mezzo al bosco', () => {
    // Bosco tutt'attorno a una conca spoglia: il baricentro del bosco cade proprio nella conca,
    // ed e' il caso in cui prendere il baricentro e basta sposterebbe il punto in un prato.
    const result = forestPoint(
      ORIGIN,
      cells([
        { x: 0, y: 0, wooded: 0, total: 2500 },
        { x: 1500, y: 0, wooded: 1500, total: 2500 },
        { x: -1500, y: 0, wooded: 1500, total: 2500 },
        { x: 0, y: 1600, wooded: 1600, total: 2500 },
        { x: 0, y: -1500, wooded: 1500, total: 2500 },
      ]),
    )
    expect(result.outcome).toBe('spostato')
    expect(Math.hypot(result.x, result.y)).toBeGreaterThan(1000)
    expect(result.density).toBeGreaterThanOrEqual(0.5)
  })

  it('ripiega sulla cella piu\' boscosa quando nessuna supera la soglia', () => {
    // Comune d'alta quota: il bosco c'e' ma non domina nessuna cella. Meglio il punto meno
    // peggiore che lasciarlo sulla pietraia.
    const result = forestPoint(
      ORIGIN,
      cells([
        { x: 0, y: 0, wooded: 50, total: 2500 },
        { x: 0, y: -2500, wooded: 700, total: 2500 },
      ]),
    )
    expect(result.outcome).toBe('spostato')
    expect(result.y).toBeCloseTo(-2500, 6)
    expect(result.density).toBeCloseTo(0.28, 2)
  })

  it('usa celle da mezzo chilometro', () => {
    expect(CELL_M).toBe(500)
    expect(cellKey(10, 10)).toBe(cellKey(400, 400))
    expect(cellKey(10, 10)).not.toBe(cellKey(600, 10))
  })
})
