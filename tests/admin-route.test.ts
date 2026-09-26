/**
 * Rotta `/api/admin/observations`: chi entra, e cosa succede se il registro non si scrive.
 *
 * L'informativa promette che ogni lettura del titolare resta registrata. Questi test fissano la
 * condizione che rende vera quella frase: il registro non è un effetto collaterale della lettura,
 * ne è il prerequisito. Se non si scrive, i dati non partono.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const ADMIN_ID = '11111111-1111-1111-1111-111111111111'

const getUser = vi.fn()
const insert = vi.fn()
const readObservations = vi.fn()
const adminRow = vi.fn()

/*
 * Un client Supabase finto, ridotto alle due catene che la rotta usa davvero: la lettura delle
 * uscite (`select → is → order → limit`) e la scrittura del registro (`insert`).
 */
vi.mock('@/lib/supabase/admin', () => ({
  isSupabaseAdminConfigured: () => true,
  getAdminClient: () => ({
    auth: { getUser },
    from: (table: string) =>
      table === 'admin_access_log'
        ? { insert }
        : table === 'app_admins'
          ? { select: () => ({ eq: () => ({ maybeSingle: adminRow }) }) }
          : { select: () => ({ is: () => ({ order: () => ({ limit: readObservations }) }) }) },
  }),
}))

const { GET } = await import('@/app/api/admin/observations/route')

const ROW = {
  user_id: 'utente-a', client_id: 'uscita-1', observed_at: '2026-09-20', zone_code: 'amiata',
  zone_name: 'Monte Amiata', abundance: 'few', elevation_m: 1100, notes: 'sotto i faggi',
  duration_minutes: 120, searchers: 2, mpi_at_observation: 64, confidence_at_observation: 70,
  algorithm_version_text: '1.6.1-porcino', created_at: '2026-09-20T08:00:00Z',
  updated_at: '2026-09-20T08:00:00Z', deleted_at: null,
}

function call(token = 'token-buono'): Promise<Response> {
  return GET(new Request('https://example.test/api/admin/observations', {
    headers: { authorization: `Bearer ${token}` },
  }))
}

describe('rotta amministratore', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null })
    adminRow.mockReset().mockResolvedValue({ data: { user_id: ADMIN_ID }, error: null })
    insert.mockReset().mockResolvedValue({ error: null })
    readObservations.mockReset().mockResolvedValue({ data: [ROW], error: null })
  })

  it('restituisce le uscite, note comprese, e registra la lettura', async () => {
    const response = await call()
    expect(response.status).toBe(200)
    const body = (await response.json()) as { observations: Array<{ notes: string }> }
    expect(body.observations[0]?.notes).toBe('sotto i faggi')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ admin_user_id: ADMIN_ID, action: 'observations.list', rows_returned: 1 }),
    )
  })

  it('se il registro non si scrive, nega la lettura e non restituisce niente', async () => {
    // È il caso di `0009_admin_access_log.sql` non ancora applicata.
    insert.mockResolvedValue({ error: { message: 'relation "admin_access_log" does not exist' } })
    const response = await call()
    expect(response.status).toBe(503)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).not.toHaveProperty('observations')
    expect(String(body['error'])).toContain('0009_admin_access_log.sql')
  })

  it('a chi non è l\'amministratore risponde 404 e non legge il database', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'qualcun-altro' } }, error: null })
    adminRow.mockResolvedValue({ data: null, error: null })
    const response = await call()
    expect(response.status).toBe(404)
    expect(readObservations).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('un 404 da non-amministratore è identico a quello di una rotta che non esiste', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } })
    expect(await (await call('falso')).json()).toEqual({ error: 'Not found' })
  })
})
