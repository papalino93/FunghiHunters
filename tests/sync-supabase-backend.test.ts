/**
 * Adapter Supabase della sincronizzazione, contro un client finto.
 *
 * Quello che va protetto qui è un caso reale e cattivo: un progetto Supabase aggiornato a metà —
 * migrazioni applicate fino alla quinta, la sesta no. PostgREST non conosce
 * `duration_minutes`/`searchers` e rifiuta **l'intero** upsert, non solo quelle due colonne: senza
 * rete di sicurezza, due campi facoltativi fermerebbero la sincronizzazione di tutto il diario.
 */

import { describe, expect, it } from 'vitest'

import { materialise } from '@/lib/diary/store'
import { createSupabaseSyncBackend } from '@/lib/sync/supabase-backend'

type UpsertResult = { error: { code?: string; message?: string } | null }

/**
 * Client finto: registra le righe di ogni upsert e restituisce a turno gli esiti programmati.
 * Riproduce solo la superficie che l'adapter usa davvero (`from().upsert()`, `from().select()`).
 */
function fakeClient(results: UpsertResult[]) {
  const upserts: Record<string, unknown>[][] = []
  let call = 0

  const client = {
    from() {
      return {
        upsert(rows: Record<string, unknown>[]) {
          upserts.push(rows)
          const result = results[call] ?? { error: null }
          call += 1
          return Promise.resolve(result)
        },
        select() {
          return {
            eq() {
              return Promise.resolve({ data: [], error: null })
            },
          }
        },
      }
    },
  }

  // L'adapter tipizza il client come `SupabaseClient`: qui serve solo la forma usata davvero.
  return { client: client as unknown as Parameters<typeof createSupabaseSyncBackend>[0], upserts }
}

const entry = () =>
  materialise({
    date: '2026-09-16',
    zoneCode: 'garfagnana',
    zoneName: 'Garfagnana',
    abundance: 'some',
    durationMinutes: 90,
    searchers: 2,
  })

describe('push con le colonne di contesto presenti sul server', () => {
  it('le invia, e non riprova niente', async () => {
    const { client, upserts } = fakeClient([{ error: null }])
    const backend = createSupabaseSyncBackend(client, 'utente-1')

    await backend.push([entry()])

    expect(upserts).toHaveLength(1)
    expect(upserts[0]?.[0]).toHaveProperty('duration_minutes', 90)
    expect(upserts[0]?.[0]).toHaveProperty('searchers', 2)
  })
})

describe('push su un progetto senza la migrazione 0006', () => {
  it('riprova senza le due colonne invece di fermare tutta la sincronizzazione', async () => {
    const { client, upserts } = fakeClient([
      { error: { code: 'PGRST204', message: "Could not find the 'duration_minutes' column" } },
      { error: null },
    ])
    const backend = createSupabaseSyncBackend(client, 'utente-1')

    // Non deve lanciare: il resto del diario si sincronizza comunque.
    await expect(backend.push([entry()])).resolves.toBeUndefined()

    expect(upserts).toHaveLength(2)
    expect(upserts[1]?.[0]).not.toHaveProperty('duration_minutes')
    expect(upserts[1]?.[0]).not.toHaveProperty('searchers')
    // Il resto della voce viaggia intatto: è tutto tranne i due campi nuovi.
    expect(upserts[1]?.[0]).toHaveProperty('zone_code', 'garfagnana')
    expect(upserts[1]?.[0]).toHaveProperty('abundance', 'some')
  })

  it('dopo il primo rifiuto smette di inviarle, senza un tentativo sprecato a ogni giro', async () => {
    const { client, upserts } = fakeClient([
      { error: { code: 'PGRST204', message: "Could not find the 'searchers' column" } },
      { error: null },
      { error: null },
    ])
    const backend = createSupabaseSyncBackend(client, 'utente-1')

    await backend.push([entry()])
    await backend.push([entry()])

    // Tre upsert in tutto: il primo rifiutato, il suo ritentativo, e il secondo push già "pulito".
    expect(upserts).toHaveLength(3)
    expect(upserts[2]?.[0]).not.toHaveProperty('duration_minutes')
  })

  it('un errore diverso resta un errore: non lo si nasconde togliendo colonne a caso', async () => {
    const { client, upserts } = fakeClient([
      { error: { code: '42501', message: 'permission denied for table user_observations' } },
    ])
    const backend = createSupabaseSyncBackend(client, 'utente-1')

    await expect(backend.push([entry()])).rejects.toThrow(/permission denied/)
    expect(upserts).toHaveLength(1)
  })
})
