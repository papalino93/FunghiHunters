import type { StoredWaypoint, Waypoint, WaypointDraft } from '@/lib/waypoints/types'
import { normaliseWaypoint } from '@/lib/waypoints/types'
import { WAYPOINTS_STORE, openDatabase, promisify } from '@/lib/diary/db'

export interface WaypointRepository {
  /** Tutti i punti salvati, liberi e associati a un'uscita insieme: chi filtra decide il resto. */
  list(): Promise<Waypoint[]>
  add(draft: WaypointDraft): Promise<Waypoint>
  remove(id: string): Promise<boolean>
  /** Tutti i punti di una specifica uscita, quando l'uscita stessa viene eliminata per sempre. */
  removeAllFor(entryId: string): Promise<void>
}

function makeId(): string {
  const c = globalThis.crypto
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID()
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

function sortByRecent(points: readonly Waypoint[]): Waypoint[] {
  return [...points].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function toWaypoint(draft: WaypointDraft): Waypoint {
  return {
    id: makeId(),
    createdAt: new Date().toISOString(),
    entryId: draft.entryId ?? null,
    kind: draft.kind,
    label: draft.label,
    latitude: draft.latitude,
    longitude: draft.longitude,
  }
}

export class InMemoryWaypointRepository implements WaypointRepository {
  private points = new Map<string, Waypoint>()

  async list(): Promise<Waypoint[]> {
    return sortByRecent([...this.points.values()])
  }

  async add(draft: WaypointDraft): Promise<Waypoint> {
    const point = toWaypoint(draft)
    this.points.set(point.id, point)
    return point
  }

  async remove(id: string): Promise<boolean> {
    return this.points.delete(id)
  }

  async removeAllFor(entryId: string): Promise<void> {
    for (const point of this.points.values()) {
      if (point.entryId === entryId) this.points.delete(point.id)
    }
  }
}

export class IndexedDbWaypointRepository implements WaypointRepository {
  async list(): Promise<Waypoint[]> {
    const db = await openDatabase()
    const tx = db.transaction(WAYPOINTS_STORE, 'readonly')
    const all = await promisify(
      tx.objectStore(WAYPOINTS_STORE).getAll() as IDBRequest<StoredWaypoint[]>,
    )
    return sortByRecent(all.map(normaliseWaypoint))
  }

  async add(draft: WaypointDraft): Promise<Waypoint> {
    const point = toWaypoint(draft)
    const db = await openDatabase()
    const tx = db.transaction(WAYPOINTS_STORE, 'readwrite')
    await promisify(tx.objectStore(WAYPOINTS_STORE).put(point) as IDBRequest<IDBValidKey>)
    return point
  }

  async remove(id: string): Promise<boolean> {
    const db = await openDatabase()
    const tx = db.transaction(WAYPOINTS_STORE, 'readwrite')
    await promisify(tx.objectStore(WAYPOINTS_STORE).delete(id) as IDBRequest<undefined>)
    return true
  }

  async removeAllFor(entryId: string): Promise<void> {
    const mine = (await this.list()).filter((p) => p.entryId === entryId)
    if (mine.length === 0) return
    const db = await openDatabase()
    const tx = db.transaction(WAYPOINTS_STORE, 'readwrite')
    await Promise.all(
      mine.map((p) => promisify(tx.objectStore(WAYPOINTS_STORE).delete(p.id) as IDBRequest<undefined>)),
    )
  }
}

export function createWaypointRepository(): WaypointRepository {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbWaypointRepository()
  } catch {
    // Accedere a indexedDB puo' lanciare, non solo essere undefined.
  }
  return new InMemoryWaypointRepository()
}
