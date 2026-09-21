import { describe, expect, it } from 'vitest'

import {
  OPEN_METEO_FREE_LIMITS,
  RateBudgetExhausted,
  RatePacer,
} from '@/lib/sources/open-meteo-rate'

/**
 * Orologio finto: il tempo avanza solo quando il pacer decide di dormire, o quando lo muove il
 * test. Senza, verificare la finestra oraria vorrebbe dire un test che dura un'ora, cioe' un test
 * che non si scrive e una regola che resta non verificata.
 */
function fakeClock(): { now: () => number; advance: (ms: number) => void; wait: (ms: number) => Promise<void> } {
  let current = 0
  return {
    now: () => current,
    advance: (ms) => {
      current += ms
    },
    wait: (ms) => {
      current += ms
      return Promise.resolve()
    },
  }
}

describe('RatePacer', () => {
  it('non fa aspettare finche\' si sta sotto il limite al minuto', async () => {
    const clock = fakeClock()
    const pacer = new RatePacer({ now: clock.now, wait: clock.wait })

    for (let i = 0; i < 6; i += 1) {
      expect(await pacer.reserve(100)).toBe(0)
    }
    expect(pacer.used).toBe(600)
  })

  it('riproduce il 429 vero: il settimo lotto da 100 aspetta il minuto', async () => {
    // E' esattamente quello che e' successo il 21/09/2026 generando il catalogo: sei richieste
    // passate, la settima respinta con "Minutely API request limit exceeded".
    const clock = fakeClock()
    const pacer = new RatePacer({ now: clock.now, wait: clock.wait })

    for (let i = 0; i < 6; i += 1) await pacer.reserve(100)
    expect(await pacer.reserve(100)).toBe(60_000)
  })

  it('aspetta solo quanto basta, non un minuto pieno per abitudine', async () => {
    const clock = fakeClock()
    const pacer = new RatePacer({ now: clock.now, wait: clock.wait })

    await pacer.reserve(600)
    clock.advance(50_000)
    // La spesa esce dalla finestra fra 10 secondi: dormire di piu' sarebbe tempo buttato.
    expect(await pacer.reserve(600)).toBe(10_000)
  })

  it('rispetta anche la finestra oraria, non solo quella al minuto', async () => {
    const clock = fakeClock()
    const pacer = new RatePacer({
      limits: { perMinute: 600, perHour: 1_000, perDay: 10_000 },
      maxWaitMs: 2 * 3_600_000,
      now: clock.now,
      wait: clock.wait,
    })

    await pacer.reserve(600)
    clock.advance(60_000)
    await pacer.reserve(400)
    clock.advance(60_000)

    // Sotto il minuto c'e' spazio, ma l'ora e' piena: si aspetta che scada la prima spesa.
    expect(await pacer.reserve(100)).toBe(3_600_000 - 120_000)
  })

  it('si ferma invece di dormire per ore quando il budget e\' finito', async () => {
    const clock = fakeClock()
    const pacer = new RatePacer({
      limits: { perMinute: 600, perHour: 1_000, perDay: 10_000 },
      maxWaitMs: 60_000,
      now: clock.now,
      wait: clock.wait,
    })

    await pacer.reserve(600)
    clock.advance(60_000)
    await pacer.reserve(400)
    clock.advance(60_000)

    // L'ora e' piena: aspettare sarebbe possibile, ma quasi un'ora di sonno non e' accettabile.
    await expect(pacer.reserve(100)).rejects.toBeInstanceOf(RateBudgetExhausted)
  })

  it('dice subito che un lotto e\' troppo grande, invece di aspettare per sempre', () => {
    const pacer = new RatePacer()
    expect(() => pacer.waitMsFor(OPEN_METEO_FREE_LIMITS.perMinute + 1)).toThrow(
      /va spezzato in lotti piu' piccoli/,
    )
  })
})
