/**
 * `/api/salute`: una richiesta minima al database, senza restituire dati.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const select = vi.fn()
let configured = true

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => (configured ? { from: () => ({ select }) } : null),
}))

const { GET } = await import('@/app/api/salute/route')

function request(ip: string): Request {
  return new Request('http://localhost/api/salute', { headers: { 'x-forwarded-for': ip } })
}

beforeEach(() => {
  configured = true
  select.mockReset().mockResolvedValue({ error: null, count: 1 })
})

describe('/api/salute', () => {
  it('database raggiungibile: 200, nessun dato', async () => {
    const response = await GET(request('198.51.100.1'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body['ok']).toBe(true)
    expect(body).not.toHaveProperty('count')
    // Un conteggio senza righe: la richiesta più piccola possibile.
    expect(select).toHaveBeenCalledWith('user_id', { count: 'exact', head: true })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('database in pausa o irraggiungibile: 503, così la corsa di GitHub diventa rossa', async () => {
    select.mockResolvedValue({ error: { message: 'project paused' } })
    const response = await GET(request('198.51.100.2'))
    expect(response.status).toBe(503)
    expect(((await response.json()) as { ok: boolean }).ok).toBe(false)
  })

  it('senza chiavi configurate: 503', async () => {
    configured = false
    expect((await GET(request('198.51.100.3'))).status).toBe(503)
  })

  it('oltre dieci richieste al minuto dallo stesso indirizzo: 429', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) statuses.push((await GET(request('198.51.100.4'))).status)
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true)
    expect(statuses[10]).toBe(429)
  })
})
