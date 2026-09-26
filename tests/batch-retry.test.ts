/**
 * `runBatches`: il secondo giro dei lotti Open-Meteo falliti. Protegge i due guasti del
 * 26/09/2026 — un 429 al minuto e una risposta troncata — che un minuto dopo non c'erano piu'.
 */

import { describe, expect, it } from 'vitest'

import { runBatches } from '@/lib/pipeline/batch-retry'

class Fatal extends Error {}

describe('runBatches', () => {
  it('senza errori esegue ogni lotto una volta, in ordine, senza pause', async () => {
    const calls: string[] = []
    const waits: number[] = []
    const lost = await runBatches(['a', 'b', 'c'], async (c, i, attempt) => { calls.push(`${c}${i}${attempt}`) }, {
      retryDelayMs: 65_000,
      wait: async (ms) => { waits.push(ms) },
    })
    expect(lost).toEqual([])
    expect(calls).toEqual(['a01', 'b11', 'c21'])
    expect(waits).toEqual([])
  })

  it('un lotto fallito si riprova una volta, dopo la pausa e dopo tutti gli altri', async () => {
    const calls: string[] = []
    const waits: number[] = []
    let retried = 0
    const lost = await runBatches(
      ['a', 'b', 'c'],
      async (c, _i, attempt) => {
        calls.push(`${c}${attempt}`)
        if (c === 'a' && attempt === 1) throw new Error('HTTP 429')
      },
      { retryDelayMs: 65_000, wait: async (ms) => { waits.push(ms) }, onRetry: (n) => { retried = n } },
    )
    expect(lost).toEqual([])
    expect(calls).toEqual(['a1', 'b1', 'c1', 'a2'])
    expect(waits).toEqual([65_000])
    expect(retried).toBe(1)
  })

  it('un lotto che fallisce anche al secondo giro è perso, con l\'ultimo errore; mai un terzo', async () => {
    const calls: string[] = []
    const lost = await runBatches(
      ['a', 'b'],
      async (c, _i, attempt) => {
        calls.push(`${c}${attempt}`)
        if (c === 'b') throw new Error(`guasto ${attempt}`)
      },
      { retryDelayMs: 1, wait: async () => {} },
    )
    expect(calls).toEqual(['a1', 'b1', 'b2'])
    expect(lost).toHaveLength(1)
    expect(lost[0]?.index).toBe(1)
    expect((lost[0]?.error as Error).message).toBe('guasto 2')
  })

  it('un errore fatale ferma tutto: i lotti rimasti sono persi e non c\'è secondo giro', async () => {
    const calls: string[] = []
    const waits: number[] = []
    const lost = await runBatches(
      ['a', 'b', 'c', 'd'],
      async (c, _i, attempt) => {
        calls.push(`${c}${attempt}`)
        if (c === 'a') throw new Error('transitorio')
        if (c === 'c') throw new Fatal('budget finito')
      },
      { retryDelayMs: 1, wait: async (ms) => { waits.push(ms) }, isFatal: (e) => e instanceof Fatal },
    )
    expect(calls).toEqual(['a1', 'b1', 'c1'])
    expect(waits).toEqual([])
    expect(lost.map((f) => f.index)).toEqual([0, 2, 3])
  })

  it('un errore fatale durante il secondo giro perde quel lotto e quelli dopo', async () => {
    const lost = await runBatches(
      ['a', 'b', 'c'],
      async (c, _i, attempt) => {
        if (attempt === 1 && c !== 'b') throw new Error('transitorio')
        if (attempt === 2 && c === 'a') throw new Fatal('budget finito')
      },
      { retryDelayMs: 1, wait: async () => {}, isFatal: (e) => e instanceof Fatal },
    )
    expect(lost.map((f) => f.index)).toEqual([0, 2])
    expect(lost.every((f) => f.error instanceof Fatal)).toBe(true)
  })
})
