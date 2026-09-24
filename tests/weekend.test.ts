import { describe, expect, it } from 'vitest'

import { weekendDates, weekendOutlook } from '@/lib/recommend/weekend'
import type { SnapshotZone } from '@/lib/snapshot/types'

// 2026-09-24 è giovedì: sabato 26, domenica 27.
const DATES = ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28']

describe('weekendDates', () => {
  it('trova il prossimo sabato e domenica', () => {
    expect(weekendDates(DATES, '2026-09-24')).toEqual(['2026-09-26', '2026-09-27'])
  })

  it('di sabato include oggi, di domenica solo oggi', () => {
    expect(weekendDates(DATES, '2026-09-26')).toEqual(['2026-09-26', '2026-09-27'])
    expect(weekendDates(DATES, '2026-09-27')).toEqual(['2026-09-27'])
  })

  it('se la serie non arriva al fine settimana non inventa giorni', () => {
    expect(weekendDates(['2026-09-24', '2026-09-25'], '2026-09-24')).toEqual([])
  })
})

describe('weekendOutlook', () => {
  const zone = (code: string, byDate: Record<string, number>) =>
    ({ code, name: code, mpi: 0, series: Object.entries(byDate).map(([date, mpi]) => ({ date, mpi })) }) as unknown as SnapshotZone

  it('ordina le zone per il punteggio di quel giorno, non di oggi', () => {
    const out = weekendOutlook(
      [zone('a', { '2026-09-26': 20, '2026-09-27': 80 }), zone('b', { '2026-09-26': 60, '2026-09-27': 10 })],
      DATES,
      '2026-09-24',
    )
    expect(out[0]?.best.map((b) => b.zone.code)).toEqual(['b', 'a'])
    expect(out[1]?.best.map((b) => b.zone.code)).toEqual(['a', 'b'])
  })
})
