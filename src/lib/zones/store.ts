/**
 * Persistenza delle zone che seguo.
 *
 * Stessa idea del diario (`src/lib/diary/store.ts`): sta sul telefono per prima cosa, un account è
 * solo una seconda copia allineata da `runSync()`. L'interfaccia sta dietro un repository perché
 * il motore di sincronizzazione non deve sapere se sta parlando con IndexedDB o con un backend
 * finto nei test.
 */

import {
  type FollowedZone,
  type FollowedZoneDraft,
  type StoredFollowedZone,
  normaliseFollowedZone,
} from '@/lib/zones/types'
import { FOLLOWED_ZONES_STORE, openDatabase, promisify } from '@/lib/diary/db'

export interface FollowedZoneRepository {
  /** Zone seguite vive, per l'interfaccia. */
  list(): Promise<FollowedZone[]>
  /** Vive e tombstone, per il motore di sincronizzazione. */
  listAll(): Promise<FollowedZone[]>
  isFollowed(zoneCode: string): Promise<boolean>
  /** Segue una zona. Idempotente: seguirla di nuovo dopo averla già seguita non fa nulla di nuovo. */
  follow(draft: FollowedZoneDraft): Promise<FollowedZone>
  /** Soft-delete: marca `deletedAt`, non toglie la riga — vedi il tombstone in `types.ts`. */
  unfollow(zoneCode: string): Promise<boolean>
  purge(id: string): Promise<boolean>
  upsertRaw(entry: FollowedZone): Promise<void>
  clear(): Promise<void>
}

function nowIso(): string {
  return new Date().toISOString()
}

/** Costruisce/aggiorna una riga da una bozza. L'id è il codice zona: vedi il commento in `types.ts`. */
function materialise(draft: FollowedZoneDraft, existing?: FollowedZone): FollowedZone {
  return {
    id: draft.zoneCode,
    zoneCode: draft.zoneCode,
    zoneName: draft.zoneName,
    regionSlug: draft.regionSlug,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
    deletedAt: null,
  }
}

function sortByName(zones: readonly FollowedZone[]): FollowedZone[] {
  return [...zones].sort((a, b) => a.zoneName.localeCompare(b.zoneName, 'it'))
}

export class InMemoryFollowedZoneRepository implements FollowedZoneRepository {
  private rows = new Map<string, FollowedZone>()

  async list(): Promise<FollowedZone[]> {
    return sortByName([...this.rows.values()].filter((z) => z.deletedAt === null))
  }

  async listAll(): Promise<FollowedZone[]> {
    return sortByName([...this.rows.values()])
  }

  async isFollowed(zoneCode: string): Promise<boolean> {
    return (this.rows.get(zoneCode)?.deletedAt ?? null) === null && this.rows.has(zoneCode)
  }

  async follow(draft: FollowedZoneDraft): Promise<FollowedZone> {
    const existing = this.rows.get(draft.zoneCode)
    const zone = materialise(draft, existing)
    this.rows.set(zone.id, zone)
    return zone
  }

  async unfollow(zoneCode: string): Promise<boolean> {
    const existing = this.rows.get(zoneCode)
    if (existing === undefined || existing.deletedAt !== null) return false
    this.rows.set(zoneCode, { ...existing, deletedAt: nowIso(), updatedAt: nowIso() })
    return true
  }

  async purge(id: string): Promise<boolean> {
    return this.rows.delete(id)
  }

  async upsertRaw(entry: FollowedZone): Promise<void> {
    this.rows.set(entry.id, entry)
  }

  async clear(): Promise<void> {
    this.rows.clear()
  }
}

const STORE = FOLLOWED_ZONES_STORE

export class IndexedDbFollowedZoneRepository implements FollowedZoneRepository {
  private connect(): Promise<IDBDatabase> {
    return openDatabase()
  }

  async list(): Promise<FollowedZone[]> {
    const all = await this.listAll()
    return all.filter((z) => z.deletedAt === null)
  }

  async listAll(): Promise<FollowedZone[]> {
    const db = await this.connect()
    const tx = db.transaction(STORE, 'readonly')
    const all = await promisify(tx.objectStore(STORE).getAll() as IDBRequest<StoredFollowedZone[]>)
    return sortByName(all.map(normaliseFollowedZone))
  }

  async isFollowed(zoneCode: string): Promise<boolean> {
    const db = await this.connect()
    const tx = db.transaction(STORE, 'readonly')
    const stored = await promisify(
      tx.objectStore(STORE).get(zoneCode) as IDBRequest<StoredFollowedZone | undefined>,
    )
    if (stored === undefined) return false
    return normaliseFollowedZone(stored).deletedAt === null
  }

  async follow(draft: FollowedZoneDraft): Promise<FollowedZone> {
    const db = await this.connect()
    const read = db.transaction(STORE, 'readonly')
    const stored = await promisify(
      read.objectStore(STORE).get(draft.zoneCode) as IDBRequest<StoredFollowedZone | undefined>,
    )
    const existing = stored === undefined ? undefined : normaliseFollowedZone(stored)
    const zone = materialise(draft, existing)
    const write = db.transaction(STORE, 'readwrite')
    await promisify(write.objectStore(STORE).put(zone) as IDBRequest<IDBValidKey>)
    return zone
  }

  async unfollow(zoneCode: string): Promise<boolean> {
    const db = await this.connect()
    const read = db.transaction(STORE, 'readonly')
    const stored = await promisify(
      read.objectStore(STORE).get(zoneCode) as IDBRequest<StoredFollowedZone | undefined>,
    )
    if (stored === undefined) return false
    const existing = normaliseFollowedZone(stored)
    if (existing.deletedAt !== null) return false

    const tombstoned: FollowedZone = { ...existing, deletedAt: nowIso(), updatedAt: nowIso() }
    const write = db.transaction(STORE, 'readwrite')
    await promisify(write.objectStore(STORE).put(tombstoned) as IDBRequest<IDBValidKey>)
    return true
  }

  async purge(id: string): Promise<boolean> {
    const db = await this.connect()
    const tx = db.transaction(STORE, 'readwrite')
    await promisify(tx.objectStore(STORE).delete(id) as IDBRequest<undefined>)
    return true
  }

  async upsertRaw(entry: FollowedZone): Promise<void> {
    const db = await this.connect()
    const tx = db.transaction(STORE, 'readwrite')
    await promisify(tx.objectStore(STORE).put(entry) as IDBRequest<IDBValidKey>)
  }

  async clear(): Promise<void> {
    const db = await this.connect()
    const tx = db.transaction(STORE, 'readwrite')
    await promisify(tx.objectStore(STORE).clear() as IDBRequest<undefined>)
  }
}

/**
 * Il repository da usare nell'app. Stesso ripiego del diario: in finestra privata o con lo
 * storage bloccato, le zone seguite restano utilizzabili per la sessione corrente invece di far
 * fallire l'interfaccia.
 */
export function createFollowedZoneRepository(): { repo: FollowedZoneRepository; persistent: boolean } {
  try {
    if (typeof indexedDB !== 'undefined') {
      return { repo: new IndexedDbFollowedZoneRepository(), persistent: true }
    }
  } catch {
    // Accedere a indexedDB può lanciare, non solo essere undefined.
  }
  return { repo: new InMemoryFollowedZoneRepository(), persistent: false }
}
