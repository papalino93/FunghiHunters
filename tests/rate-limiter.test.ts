import { describe, expect, it } from 'vitest'

import { SlidingWindowLimiter, clientKey } from '@/lib/rate/limiter'

describe('limite di richieste', () => {
  it('lascia passare fino al limite nella finestra, poi ferma, poi riapre', () => {
    const limiter = new SlidingWindowLimiter(3, 1_000)
    expect([0, 10, 20].map((t) => limiter.allow('a', t))).toEqual([true, true, true])
    expect(limiter.allow('a', 30)).toBe(false)
    // Un altro chiamante ha il suo conto.
    expect(limiter.allow('b', 30)).toBe(true)
    // Passata la finestra della prima richiesta, se ne libera una.
    expect(limiter.allow('a', 1_001)).toBe(true)
    expect(limiter.allow('a', 1_002)).toBe(false)
  })

  it('prende il primo indirizzo di x-forwarded-for', () => {
    const request = new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } })
    expect(clientKey(request)).toBe('203.0.113.7')
    expect(clientKey(new Request('http://x'))).toBe('sconosciuto')
  })
})
