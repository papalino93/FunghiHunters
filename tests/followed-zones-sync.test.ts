/**
 * Le zone che seguo passano dallo stesso motore di sincronizzazione del diario
 * (`runSync()`, generalizzato in `src/lib/sync/engine.ts` proprio per questo). Non riscrive tutti
 * i casi di `tests/sync.test.ts` — quella logica è unica e già coperta — ma verifica che il motore
 * generico si comporti correttamente anche con un tipo diverso da `DiaryEntry`: conflitto,
 * tombstone, e il caso specifico di questa lista, seguire di nuovo una zona dopo averla
 * tombstonata (l'id è il codice zona, non un uuid nuovo ogni volta — vedi `followed-zones.test.ts`).
 */

import { describe, expect, it } from 'vitest'

import { InMemoryFollowedZoneRepository } from '@/lib/zones/store'
import type { FollowedZone } from '@/lib/zones/types'
import { runSync } from '@/lib/sync/engine'
import type { SyncBackend } from '@/lib/sync/types'

class FakeZonesBackend implements SyncBackend<FollowedZone> {
  rows = new Map<string, FollowedZone>()

  async pull(sinceIso: string | null): Promise<FollowedZone[]> {
    return [...this.rows.values()].filter((z) => sinceIso === null || z.updatedAt > sinceIso)
  }

  async push(entries: readonly FollowedZone[]): Promise<void> {
    for (const entry of entries) this.rows.set(entry.id, entry)
  }
}

describe('runSync con le zone che seguo', () => {
  it('la prima sincronizzazione spedisce tutto ciò che è locale', async () => {
    const repo = new InMemoryFollowedZoneRepository()
    await repo.follow({ zoneCode: 'amiata', zoneName: 'Monte Amiata', regionSlug: 'toscana' })
    await repo.follow({ zoneCode: 'it-048017', zoneName: 'Firenze', regionSlug: 'toscana' })
    const backend = new FakeZonesBackend()

    const outcome = await runSync(repo, backend, null)

    expect(outcome.status).toBe('synced')
    expect(outcome.pushed).toBe(2)
    expect(backend.rows.size).toBe(2)
  })

  it('applica le zone già seguite sul server', async () => {
    const repo = new InMemoryFollowedZoneRepository()
    const backend = new FakeZonesBackend()
    const remote: FollowedZone = {
      id: 'garfagnana',
      zoneCode: 'garfagnana',
      zoneName: 'Garfagnana',
      regionSlug: 'toscana',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      deletedAt: null,
    }
    backend.rows.set(remote.id, remote)

    const outcome = await runSync(repo, backend, null)

    expect(outcome.pulled).toBe(1)
    expect((await repo.list()).map((z) => z.id)).toEqual(['garfagnana'])
  })

  it('un "non seguire più" si propaga e poi si pulisce in locale', async () => {
    const repo = new InMemoryFollowedZoneRepository()
    const zone = await repo.follow({ zoneCode: 'amiata', zoneName: 'Monte Amiata', regionSlug: 'toscana' })
    const backend = new FakeZonesBackend()
    backend.rows.set(zone.id, zone) // già sincronizzata in un giro precedente
    await repo.unfollow('amiata')

    const outcome = await runSync(repo, backend, '2020-01-01T00:00:00.000Z')

    expect(outcome.pushed).toBe(1)
    expect(backend.rows.get('amiata')?.deletedAt).not.toBeNull()
    expect(await repo.listAll()).toHaveLength(0) // tombstone confermato, ripulito

    // Seguirla di nuovo dopo la sincronizzazione riparte pulita, stesso id.
    const followedAgain = await repo.follow({
      zoneCode: 'amiata',
      zoneName: 'Monte Amiata',
      regionSlug: 'toscana',
    })
    expect(followedAgain.id).toBe('amiata')
    expect(followedAgain.deletedAt).toBeNull()
  })

  it('un "non seguire più" fatto su un altro dispositivo non resuscita la zona qui', async () => {
    const repo = new InMemoryFollowedZoneRepository()
    const zone = await repo.follow({ zoneCode: 'mugello', zoneName: 'Mugello', regionSlug: 'toscana' })
    const later = new Date(Date.parse(zone.updatedAt) + 60_000).toISOString()
    const backend = new FakeZonesBackend()
    backend.rows.set(zone.id, { ...zone, deletedAt: later, updatedAt: later })

    const outcome = await runSync(repo, backend, '2020-01-01T00:00:00.000Z')

    expect(outcome.pulled).toBe(1)
    expect(await repo.list()).toHaveLength(0)
  })
})
