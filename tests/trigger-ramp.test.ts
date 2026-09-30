/**
 * L'innesco graduale (`trigger.rampMm`): perché mezzo millimetro di pioggia non valga 70 punti.
 *
 * Il caso vero, 17 settembre 2026: Trappola (Pratomagno) 19,5 mm, Vallombrosa (Montemignaio)
 * 47,1 mm, a 12 km. Con la soglia secca il primo non contava niente e il secondo tutto.
 */
import { describe, expect, it } from 'vitest'

import { ALGORITHM_V1 } from '@/lib/config/algorithm'
import type { CellFeatures } from '@/lib/model/features'
import { computeTrigger, triggerRainWeight } from '@/lib/model/mpi'
import { configTriggerRamp } from '@/lib/validation/variants'

function features(rain: { daysAgo: number; mm: number }[]): CellFeatures {
  const intense = rain.filter((r) => r.mm >= 20).map((r) => r.daysAgo)
  return {
    daysSinceIntenseEvent: intense.length === 0 ? null : Math.min(...intense),
    triggerRain: rain,
  } as unknown as CellFeatures
}

describe('peso di un giorno di pioggia', () => {
  it('soglia secca senza rampa, proporzionale con la rampa', () => {
    expect(triggerRainWeight(19.5, 20, 0)).toBe(0)
    expect(triggerRainWeight(20, 20, 0)).toBe(1)
    expect(triggerRainWeight(19.5, 20, 10)).toBeCloseTo(0.95)
    expect(triggerRainWeight(15, 20, 10)).toBeCloseTo(0.5)
    expect(triggerRainWeight(9, 20, 10)).toBe(0)
    expect(triggerRainWeight(47, 20, 10)).toBe(1)
  })
})

describe('innesco', () => {
  it('in produzione (1.7.0) la rampa è accesa: 19,5 mm innescano quasi per intero', () => {
    expect(ALGORITHM_V1.trigger.rampMm?.value).toBe(10)
    const t = computeTrigger(features([{ daysAgo: 12, mm: 19.5 }]), ALGORITHM_V1)
    expect(t.closeness).toBeCloseTo(0.95)
  })

  it('senza rampa resta la soglia secca: 19,5 mm non innescano', () => {
    const t = computeTrigger(features([{ daysAgo: 12, mm: 19.5 }]), configTriggerRamp(0))
    expect(t.closeness).toBe(0)
  })

  it('con la rampa 19,5 e 20,6 mm danno quasi lo stesso innesco', () => {
    const config = configTriggerRamp(10)
    const a = computeTrigger(features([{ daysAgo: 12, mm: 19.5 }]), config)
    const b = computeTrigger(features([{ daysAgo: 12, mm: 20.6 }]), config)
    expect(Math.abs(a.closeness - b.closeness)).toBeLessThan(0.06)
    expect(a.detail).toContain('conta in parte')
  })

  it('un temporale piccolo e recente non scalza la pioggia forte di dodici giorni fa', () => {
    const config = configTriggerRamp(10)
    const t = computeTrigger(features([{ daysAgo: 12, mm: 47 }, { daysAgo: 1, mm: 12 }]), config)
    expect(t.daysSinceEvent).toBe(12)
    expect(t.closeness).toBeCloseTo(1)
  })
})
