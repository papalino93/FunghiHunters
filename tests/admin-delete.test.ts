/**
 * Eliminazione delle uscite dal pannello: solo l'amministratore, prima il registro, e una marca
 * (`deleted_at`) invece della riga cancellata, perché la cancellazione arrivi anche al telefono.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ADMIN_ID = '11111111-1111-1111-1111-111111111111'
const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const U2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const getUser = vi.fn()
const insert = vi.fn()
const adminRow = vi.fn()
const updates: Array<{ patch: Record<string, unknown>; userId: string; ids: string[] }> = []

vi.mock('@/lib/supabase/admin', () => ({
  isSupabaseAdminConfigured: () => true,
  getAdminClient: () => ({
    auth: { getUser },
    from: (table: string) =>
      table === 'admin_access_log'
        ? { insert }
        : table === 'app_admins'
          ? { select: () => ({ eq: () => ({ maybeSingle: adminRow }) }) }
          : {
              update: (patch: Record<string, unknown>) => ({
                eq: (_col: string, userId: string) => ({
                  in: (_c: string, ids: string[]) => ({
                    is: () => ({
                      select: async () => {
                        updates.push({ patch, userId, ids })
                        return { data: ids.map((id) => ({ client_id: id })), error: null }
                      },
                    }),
                  }),
                }),
              }),
            },
  }),
}))

const { DELETE } = await import('@/app/api/admin/observations/route')

function request(body: unknown, token = 'token-valido'): Request {
  return new Request('http://localhost/api/admin/observations', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  updates.length = 0
  getUser.mockReset().mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null })
  adminRow.mockReset().mockResolvedValue({ data: { user_id: ADMIN_ID }, error: null })
  insert.mockReset().mockResolvedValue({ error: null })
})

describe('DELETE /api/admin/observations', () => {
  it('chi non è amministratore riceve 404 e non tocca niente', async () => {
    adminRow.mockResolvedValue({ data: null, error: null })
    const response = await DELETE(request({ items: [{ userId: U1, id: 'e1' }] }))
    expect(response.status).toBe(404)
    expect(insert).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
  })

  it('senza registro non elimina niente', async () => {
    insert.mockResolvedValue({ error: { message: 'tabella assente' } })
    const response = await DELETE(request({ items: [{ userId: U1, id: 'e1' }] }))
    expect(response.status).toBe(503)
    expect(updates).toHaveLength(0)
  })

  it('marca le uscite come eliminate, raggruppate per utente, e lo registra', async () => {
    const response = await DELETE(
      request({ items: [{ userId: U1, id: 'e1' }, { userId: U1, id: 'e2' }, { userId: U2, id: 'e9' }] }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: 3 })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'observations.delete', rows_returned: 3 }))
    expect(updates.map((u) => [u.userId, u.ids])).toEqual([[U1, ['e1', 'e2']], [U2, ['e9']]])
    const patch = updates[0]?.patch ?? {}
    expect(typeof patch['deleted_at']).toBe('string')
    expect(patch['deleted_at']).toBe(patch['updated_at'])
    // Note e coordinate non restano sul server.
    expect(patch).toMatchObject({ notes: null, geom_exact: null, geom_public: null })
  })

  it('rifiuta richieste vuote o malformate', async () => {
    expect((await DELETE(request({ items: [] }))).status).toBe(400)
    expect((await DELETE(request({ items: [{ userId: U1 }] }))).status).toBe(400)
    expect((await DELETE(request('niente'))).status).toBe(400)
    expect((await DELETE(request({ items: [{ userId: 'non-un-uuid', id: 'e1' }] }))).status).toBe(400)
    expect(updates).toHaveLength(0)
  })
})
