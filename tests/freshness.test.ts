import { describe, expect, it } from 'vitest'

import {
  effectiveToday,
  formatAge,
  isSnapshotStale,
  snapshotAgeHours,
  STALE_AFTER_HOURS,
} from '@/lib/snapshot/freshness'

const HOUR = 3_600_000

describe('freshness dello snapshot', () => {
  const snapshot = { generatedAt: '2026-09-23T15:41:09.003Z', referenceDate: '2026-09-23' }
  const written = Date.parse(snapshot.generatedAt)

  it('il ritardo normale del cron non accende l\'avviso', () => {
    // Corsa di ieri puntuale, corsa di oggi ancora non partita a 5,5 ore dall'orario scritto:
    // ~29,5 ore, dentro la soglia. E' il caso che un avviso a 24 ore segnalerebbe a vuoto.
    const age = snapshotAgeHours(snapshot, written + 29.5 * HOUR)
    expect(isSnapshotStale(age)).toBe(false)
  })

  it('un giorno saltato si vede, senza aspettare le 48 ore', () => {
    const age = snapshotAgeHours(snapshot, written + (STALE_AFTER_HOURS + 1) * HOUR)
    expect(isSnapshotStale(age)).toBe(true)
    expect(formatAge(age)).toBe('31 ore fa')
  })

  it('usa l\'istante di scrittura, non il giorno di calendario', () => {
    // Stesso `referenceDate`, due istanti diversi: conta l'ora vera del calcolo.
    const early = snapshotAgeHours({ ...snapshot, generatedAt: '2026-09-23T00:30:00Z' }, written)
    expect(early).toBeCloseTo(15.19, 1)
  })

  it('senza un generatedAt leggibile ricade sul mezzogiorno della data di riferimento', () => {
    const age = snapshotAgeHours(
      { generatedAt: 'n/d', referenceDate: '2026-09-21' },
      Date.parse('2026-09-23T12:00:00Z'),
    )
    expect(age).toBe(48)
    expect(formatAge(age)).toBe('2 giorni fa')
  })

  it('un orologio indietro non produce eta\' negative', () => {
    expect(snapshotAgeHours(snapshot, written - HOUR)).toBe(0)
  })
})

describe('effectiveToday', () => {
  const snap = (ref: string, dates: string[]) => ({ referenceDate: ref, zones: [{ series: dates.map((date) => ({ date })) }] })

  it('con uno snapshot di ieri, oggi è la data vera se la serie la contiene', () => {
    expect(effectiveToday(snap('2026-09-23', ['2026-09-23', '2026-09-24']), '2026-09-24')).toBe('2026-09-24')
  })

  it('se la serie non arriva a oggi resta la data dello snapshot', () => {
    expect(effectiveToday(snap('2026-09-20', ['2026-09-20', '2026-09-21']), '2026-09-24')).toBe('2026-09-20')
  })

  it('uno snapshot di oggi resta com è', () => {
    expect(effectiveToday(snap('2026-09-24', ['2026-09-24']), '2026-09-24')).toBe('2026-09-24')
  })
})
