/**
 * Pannello amministratore: la guardia e le statistiche.
 *
 * La guardia e' la parte che non puo' sbagliare in nessuna direzione. Un falso negativo chiude
 * fuori il titolare, un falso positivo apre il diario di tutti a chiunque: per questo ogni ramo
 * di `requireAdmin` ha il suo test, e in particolare quelli che devono dire *no*.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bandStats, computeStats, toCsv, type StatRow } from '@/lib/admin/stats'

const ADMIN_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_ID = '22222222-2222-2222-2222-222222222222'

// Il client Supabase finto: risponde all'unica chiamata che la guardia fa, `auth.getUser`.
const getUser = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  isSupabaseAdminConfigured: () =>
    (process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '') !== '' &&
    (process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '') !== '',
  getAdminClient: () => ({ auth: { getUser } }),
}))

const { bearerToken, isAdminConfigured, requireAdmin } = await import('@/lib/admin/guard')

function request(authorization?: string): Request {
  return new Request('https://example.test/api/admin/observations', {
    headers: authorization === undefined ? {} : { authorization },
  })
}

describe('guardia amministratore', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://progetto.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'chiave-di-servizio')
    vi.stubEnv('ADMIN_USER_ID', ADMIN_ID)
    getUser.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fa entrare l\'amministratore con un token valido', async () => {
    getUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null })
    const check = await requireAdmin(request('Bearer token-buono'))
    expect(check).toEqual({ ok: true, adminUserId: ADMIN_ID })
    // Il token va validato da Supabase, non decodificato qui: un JWT si legge senza chiave.
    expect(getUser).toHaveBeenCalledWith('token-buono')
  })

  it('respinge un utente autenticato che non è l\'amministratore', async () => {
    getUser.mockResolvedValue({ data: { user: { id: OTHER_ID } }, error: null })
    expect(await requireAdmin(request('Bearer token-altrui'))).toEqual({ ok: false, reason: 'not-admin' })
  })

  it('respinge un token che Supabase non riconosce', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } })
    expect(await requireAdmin(request('Bearer falso'))).toEqual({ ok: false, reason: 'bad-token' })
  })

  it('respinge una richiesta senza token, senza nemmeno chiedere a Supabase', async () => {
    expect(await requireAdmin(request())).toEqual({ ok: false, reason: 'no-token' })
    expect(getUser).not.toHaveBeenCalled()
  })

  it('senza ADMIN_USER_ID nega tutto, anche a un token valido', async () => {
    // Il caso di un deploy nuovo o di una variabile scritta male: lo stato sicuro è «chiuso».
    vi.stubEnv('ADMIN_USER_ID', '')
    getUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null })
    expect(isAdminConfigured()).toBe(false)
    expect(await requireAdmin(request('Bearer token-buono'))).toEqual({ ok: false, reason: 'not-configured' })
    expect(getUser).not.toHaveBeenCalled()
  })

  it('senza la service role key nega tutto', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(await requireAdmin(request('Bearer token-buono'))).toEqual({ ok: false, reason: 'not-configured' })
  })

  it('un id vuoto nel token non coincide con un ADMIN_USER_ID vuoto', async () => {
    // Il confronto `'' === ''` sarebbe vero: la guardia deve fermarsi prima, su «non configurato».
    vi.stubEnv('ADMIN_USER_ID', '')
    getUser.mockResolvedValue({ data: { user: { id: '' } }, error: null })
    expect((await requireAdmin(request('Bearer x'))).ok).toBe(false)
  })

  it('legge il token solo dallo schema Bearer', () => {
    expect(bearerToken(request('Bearer abc'))).toBe('abc')
    expect(bearerToken(request('Basic abc'))).toBeNull()
    expect(bearerToken(request('Bearer   '))).toBeNull()
    expect(bearerToken(request())).toBeNull()
  })
})

function row(overrides: Partial<StatRow> & { mpiAtEntry: number | null }): StatRow {
  return { userId: 'u1', date: '2026-09-20', zoneCode: 'amiata', abundance: 'none', ...overrides }
}

describe('statistiche di calibrazione', () => {
  it('una fascia senza uscite dice «non lo so», non «0%»', () => {
    const bands = bandStats([row({ mpiAtEntry: 70, abundance: 'many' })])
    const empty = bands.find((b) => b.label === 'sfavorevoli')
    expect(empty?.outings).toBe(0)
    expect(empty?.hitRate).toBeNull()
  })

  it('calcola il tasso di ritrovamento per fascia', () => {
    const bands = bandStats([
      row({ mpiAtEntry: 70, abundance: 'many' }),
      row({ mpiAtEntry: 75, abundance: 'none' }),
      row({ mpiAtEntry: 65, abundance: 'few' }),
      row({ mpiAtEntry: 72, abundance: 'none' }),
    ])
    const favorevoli = bands.find((b) => b.label === 'favorevoli')
    expect(favorevoli?.outings).toBe(4)
    expect(favorevoli?.withFinds).toBe(2)
    expect(favorevoli?.hitRate).toBe(0.5)
  })

  it('un punteggio di 100 finisce nell\'ultima fascia, non fuori da tutte', () => {
    const bands = bandStats([row({ mpiAtEntry: 100, abundance: 'many' })])
    expect(bands.find((b) => b.label === 'molto favorevoli')?.outings).toBe(1)
    expect(bands.reduce((n, b) => n + b.outings, 0)).toBe(1)
  })

  it('le uscite senza punteggio non entrano in nessuna fascia', () => {
    const bands = bandStats([row({ mpiAtEntry: null, abundance: 'many' })])
    expect(bands.every((b) => b.outings === 0)).toBe(true)
  })

  it('conta utenti e zone distinti, e ordina le zone per frequenza', () => {
    const stats = computeStats([
      row({ mpiAtEntry: 50, userId: 'a', zoneCode: 'mugello' }),
      row({ mpiAtEntry: 50, userId: 'a', zoneCode: 'mugello', abundance: 'few' }),
      row({ mpiAtEntry: 50, userId: 'b', zoneCode: 'amiata' }),
    ])
    expect(stats.totalOutings).toBe(3)
    expect(stats.distinctUsers).toBe(2)
    expect(stats.distinctZones).toBe(2)
    expect(stats.topZones[0]).toEqual({ zoneCode: 'mugello', outings: 2, withFinds: 1 })
  })

  it('raggruppa per mese e non inventa un mese per le date vuote', () => {
    const stats = computeStats([
      row({ mpiAtEntry: 50, date: '2026-09-01' }),
      row({ mpiAtEntry: 50, date: '2026-08-15' }),
      row({ mpiAtEntry: 50, date: '2026-09-20' }),
      row({ mpiAtEntry: 50, date: '' }),
    ])
    expect(stats.byMonth).toEqual([
      { month: '2026-08', outings: 1 },
      { month: '2026-09', outings: 2 },
    ])
    expect(stats.totalOutings).toBe(4)
  })

  it('su un elenco vuoto non esplode', () => {
    const stats = computeStats([])
    expect(stats.totalOutings).toBe(0)
    expect(stats.firstDate).toBeNull()
    expect(stats.bands.every((b) => b.hitRate === null)).toBe(true)
  })
})

describe('esportazione CSV', () => {
  it('protegge virgole, virgolette e a capo dentro le note', () => {
    const csv = toCsv(['note'], [['bosco, faggeta'], ['disse "qui"'], ['riga uno\nriga due']])
    const lines = csv.replace('﻿', '').split('\r\n')
    expect(lines[1]).toBe('"bosco, faggeta"')
    expect(lines[2]).toBe('"disse ""qui"""')
    // L'a capo resta dentro le virgolette: la nota non si spezza in due righe del CSV.
    expect(csv).toContain('"riga uno\nriga due"')
  })

  it('apre con il BOM, così Excel legge gli accenti', () => {
    expect(toCsv(['a'], []).startsWith('﻿')).toBe(true)
  })

  it('scrive le celle vuote come vuote, non come «null»', () => {
    const csv = toCsv(['a', 'b'], [[null, undefined]])
    expect(csv.replace('﻿', '').split('\r\n')[1]).toBe(',')
  })
})
