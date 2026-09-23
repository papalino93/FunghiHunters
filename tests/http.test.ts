import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchJson, fetchText, HttpError, NonJsonResponseError } from '@/lib/sources/http'

/**
 * `fetch` finto che restituisce, in ordine, le risposte date. Conta le chiamate: e' il numero di
 * tentativi, cioe' esattamente la cosa che questi test devono verificare.
 */
function stubFetch(...responses: Array<() => Response>): { calls: () => number } {
  let calls = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      const make = responses[Math.min(calls, responses.length - 1)]
      calls += 1
      if (make === undefined) throw new Error('nessuna risposta preparata')
      return Promise.resolve(make())
    }),
  )
  return { calls: () => calls }
}

// Backoff a zero: si verifica quante volte si ritenta, non quanto si aspetta.
const FAST = { backoffMs: 0, timeoutMs: 1_000 } as const

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchJson', () => {
  it('ritenta un 200 con corpo non JSON, come quello di Open-Meteo sotto carico', async () => {
    // La corsa 35805664027 e' morta qui: 200 con "timeoutReached" in chiaro, mai richiesto una
    // seconda volta perche' il parsing stava fuori dal ciclo dei tentativi.
    const fetchStub = stubFetch(
      () => new Response('timeoutReached', { status: 200 }),
      () => new Response(JSON.stringify([{ ok: true }]), { status: 200 }),
    )

    await expect(fetchJson('https://example.test/forecast', FAST)).resolves.toEqual([{ ok: true }])
    expect(fetchStub.calls()).toBe(2)
  })

  it('dopo l\'ultimo tentativo lancia un errore leggibile, non un SyntaxError nudo', async () => {
    const fetchStub = stubFetch(() => new Response('<html>timeoutReached</html>', { status: 200 }))

    const failure = fetchJson('https://example.test/forecast', { ...FAST, attempts: 3 })
    await expect(failure).rejects.toBeInstanceOf(NonJsonResponseError)
    await expect(failure).rejects.toThrow(/Risposta non JSON da https:\/\/example\.test\/forecast/)
    // Rispetta il numero di tentativi dichiarato: ne' uno solo, ne' all'infinito.
    expect(fetchStub.calls()).toBe(3)
  })

  it('non ritenta un errore definitivo come il 404', async () => {
    const fetchStub = stubFetch(() => new Response('not found', { status: 404 }))

    await expect(fetchJson('https://example.test/missing', FAST)).rejects.toBeInstanceOf(HttpError)
    expect(fetchStub.calls()).toBe(1)
  })

  it('ritenta un 503 e poi legge il JSON', async () => {
    const fetchStub = stubFetch(
      () => new Response('busy', { status: 503 }),
      () => new Response('{"a":1}', { status: 200 }),
    )

    await expect(fetchJson('https://example.test/x', FAST)).resolves.toEqual({ a: 1 })
    expect(fetchStub.calls()).toBe(2)
  })
})

describe('fetchText', () => {
  it('non ritenta un corpo testuale: per il testo non esiste un "formato sbagliato"', async () => {
    const fetchStub = stubFetch(() => new Response('timeoutReached', { status: 200 }))

    await expect(fetchText('https://example.test/plain', FAST)).resolves.toBe('timeoutReached')
    expect(fetchStub.calls()).toBe(1)
  })
})
