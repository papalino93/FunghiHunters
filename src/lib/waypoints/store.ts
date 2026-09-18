import type { Waypoint, WaypointDraft } from '@/lib/waypoints/types'
import { WAYPOINTS_STORE, openDatabase, promisify } from '@/lib/diary/db'

export interface WaypointRepository {
  list(): Promise<Waypoint[]>
  add(draft: WaypointDraft): Promise<Waypoint>
  remove(id: string): Promise<boolean>
}

function makeId(): string {
  const c = globalThis.crypto
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID()
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

function sortByRecent(points: readonly Waypoint[]): Waypoint[] {
  return [...points].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export class InMemoryWaypointRepository implements WaypointRepository {
  private points = new Map<string, Waypoint>()

  async list(): Promise<Waypoint[]> {
    return sortByRecent([...this.points.values()])
  }

  async add(draft: WaypointDraft): Promise<Waypoint> {
    const point: Waypoint = { id: makeId(), createdAt: new Date().toISOString(), ...draft }
    this.points.set(point.id, point)
    return point
  }

  async remove(id: string): Promise<boolean> {
    return this.points.delete(id)
  }
}

export class IndexedDbWaypointRepository implements WaypointRepository {
  async list(): Promise<Waypoint[]> {
    const db = await openDatabase()
    const tx = db.transaction(WAYPOINTS_STORE, 'readonly')
    const all = await promisify(tx.objectStore(WAYPOINTS_STORE).getAll() as IDBRequest<Waypoint[]>)
    return sortByRecent(all)
  }

  async add(draft: WaypointDraft): Promise<Waypoint> {
    const point: Waypoint = { id: makeId(), createdAt: new Date().toISOString(), ...draft }
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
}

export function createWaypointRepository(): WaypointRepository {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbWaypointRepository()
  } catch {
    // Accedere a indexedDB puo' lanciare, non solo essere undefined.
  }
  return new InMemoryWaypointRepository()
}
