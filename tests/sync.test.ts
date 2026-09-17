/**
 * Test del motore di sincronizzazione.
 *
 * Girano contro un `SyncBackend` finto, in memoria: non serve una rete né un progetto Supabase
 * vero. Quello che deve essere corretto — e quindi testato — è il merge: chi vince un conflitto,
 * come si propaga una cancellazione, cosa succede quando il backend fallisce a metà.
 */

import { describe, expect, it } from 'vitest'

import { InMemoryDiaryRepository, materialise } from '@/lib/diary/store'
import type { DiaryEntry } from '@/lib/diary/types'
import { runSync } from '@/lib/sync/engine'
import type { SyncBackend } from '@/lib/sync/types'

function draft(overrides: Partial<Parameters<InMemoryDiaryRepository['add']>[0]> = {}) {
  return {
    date: '2026-09-16',
    zoneCode: 'garfagnana',
    zoneName: 'Garfagnana',
    abundance: 'some' as const,
    ...overrides,
  }
}

/** Backend finto: un archivio in memoria che il test popola direttamente per simulare "il server". */
class FakeBackend implements SyncBackend {
  rows = new Map<string, DiaryEntry>()
  pushCalls: DiaryEntry[][] = []
  pullError: Error | null = null
  pushError: Error | null = null

  async pull(sinceIso: string | null): Promise<DiaryEntry[]> {
    if (this.pullError !== null) throw this.pullError
    return [...this.rows.values()].filter((e) => sinceIso === null || e.updatedAt > sinceIso)
  }

  async push(entries: readonly DiaryEntry[]): Promise<void> {
    if (this.pushError !== null) throw this.pushError
    this.pushCalls.push([...entries])
    for (const entry of entries) this.rows.set(entry.id, entry)
  }
}

function at(iso: string, entry: DiaryEntry): DiaryEntry {
  return { ...entry, updatedAt: iso }
}

describe('prima sincronizzazione (lastSyncedAt nullo)', () => {
  it('spedisce tutto ciò che c\'è in locale', async () => {
    const repo = new InMemoryDiaryRepository()
    await repo.add(draft({ date: '2026-09-10' }))
    await repo.add(draft({ date: '2026-09-16' }))
    const backend = new FakeBackend()

    const outcome = await runSync(repo, backend, null)

    expect(outcome.status).toBe('synced')
    expect(outcome.pushed).toBe(2)
    expect(backend.rows.size).toBe(2)
  })

  it('applica tutto ciò che il server ha già', async () => {
    const repo = new InMemoryDiaryRepository()
    const backend = new FakeBackend()
    const remote = materialise(draft({ date: '2026-09-01' }))
    backend.rows.set(remote.id, remote)

    const outcome = await runSync(repo, backend, null)

    expect(outcome.pulled).toBe(1)
    expect((await repo.list()).map((e) => e.id)).toEqual([remote.id])
  })
})

describe('conflitto: vince la modifica più recente', () => {
  it('il locale, se è più recente, sovrascrive il server', async () => {
    const repo = new InMemoryDiaryRepository()
    const original = materialise(draft())
    await repo.upsertRaw(at('2026-09-10T08:00:00.000Z', original))
    const backend = new FakeBackend()
    backend.rows.set(original.id, {
      ...original,
      notes: 'versione vecchia sul server',
      updatedAt: '2026-09-10T07:00:00.000Z',
    })

    const outcome = await runSync(repo, backend, '2026-09-09T00:00:00.000Z')

    expect(outcome.pushed).toBe(1)
    expect(outcome.pulled).toBe(0)
    expect(backend.rows.get(original.id)?.updatedAt).toBe('2026-09-10T08:00:00.000Z')
  })

  it('il server, se è più recente, sovrascrive il locale', async () => {
    const repo = new InMemoryDiaryRepository()
    const original = materialise(draft())
    await repo.upsertRaw(at('2026-09-10T07:00:00.000Z', original))
    const backend = new FakeBackend()
    const newer = { ...original, notes: 'modificato da un altro telefono', updatedAt: '2026-09-10T09:00:00.000Z' }
    backend.rows.set(original.id, newer)

    const outcome = await runSync(repo, backend, '2026-09-09T00:00:00.000Z')

    expect(outcome.pushed).toBe(0)
    expect(outcome.pulled).toBe(1)
    const stored = (await repo.list())[0]
    expect(stored?.notes).toBe('modificato da un altro telefono')
  })

  it('un dispositivo tornato online dopo tanto tempo non cancella una modifica altrui più recente', async () => {
    // Il caso che il pull-prima-del-push esiste per prevenire: telefono A modifica offline alle
    // 8, telefono B modifica online alle 9 e sincronizza, telefono A torna online alle 10 ancora
    // con la sua modifica delle 8 come "locale non sincronizzata".
    const repo = new InMemoryDiaryRepository()
    const original = materialise(draft())
    await repo.upsertRaw(at('2026-09-10T08:00:00.000Z', { ...original, notes: 'da telefono A, offline' }))
    const backend = new FakeBackend()
    backend.rows.set(original.id, {
      ...original,
      notes: 'da telefono B, già sincronizzato',
      updatedAt: '2026-09-10T09:00:00.000Z',
    })

    const outcome = await runSync(repo, backend, '2026-09-10T07:00:00.000Z')

    expect(outcome.pushed).toBe(0)
    const stored = (await repo.list())[0]
    expect(stored?.notes).toBe('da telefono B, già sincronizzato')
  })
})

describe('tombstone: la cancellazione si propaga', () => {
  it('una cancellazione locale arriva al server e poi si pulisce in locale', async () => {
    const repo = new InMemoryDiaryRepository()
    const entry = await repo.add(draft())
    const backend = new FakeBackend()
    backend.rows.set(entry.id, entry) // già sincronizzata in un giro precedente
    await repo.remove(entry.id)

    const outcome = await runSync(repo, backend, '2020-01-01T00:00:00.000Z')

    expect(outcome.pushed).toBe(1)
    expect(backend.rows.get(entry.id)?.deletedAt).not.toBeNull()
    expect(await repo.listAll()).toHaveLength(0) // pulito in locale dopo la conferma
  })

  it('una cancellazione remota arriva sul dispositivo e non resuscita la voce', async () => {
    const repo = new InMemoryDiaryRepository()
    const entry = await repo.add(draft())
    const later = new Date(Date.parse(entry.updatedAt) + 60_000).toISOString()
    const backend = new FakeBackend()
    backend.rows.set(entry.id, { ...entry, deletedAt: later, updatedAt: later })

    const outcome = await runSync(repo, backend, '2020-01-01T00:00:00.000Z')

    expect(outcome.pulled).toBe(1)
    expect(await repo.list()).toHaveLength(0)
    expect(await repo.listAll()).toHaveLength(0) // il tombstone pulled viene subito ripulito
  })
})

describe('errori', () => {
  it('un fallimento in pull torna uno stato di errore leggibile, senza toccare il locale', async () => {
    const repo = new InMemoryDiaryRepository()
    await repo.add(draft())
    const backend = new FakeBackend()
    backend.pullError = new Error('rete assente')

    const outcome = await runSync(repo, backend, null)

    expect(outcome.status).toBe('error')
    expect(outcome.error).toBe('rete assente')
    expect(await repo.list()).toHaveLength(1)
  })

  it('un fallimento in push torna uno stato di errore e non purga i tombstone', async () => {
    const repo = new InMemoryDiaryRepository()
    const entry = await repo.add(draft())
    await repo.remove(entry.id)
    const backend = new FakeBackend()
    backend.pushError = new Error('scrittura rifiutata')

    const outcome = await runSync(repo, backend, null)

    expect(outcome.status).toBe('error')
    expect(await repo.listAll()).toHaveLength(1) // il tombstone resta: si riprova al prossimo giro
  })
})
