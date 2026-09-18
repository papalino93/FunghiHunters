/**
 * Foto a supporto di una voce di diario.
 *
 * Store separato da quello delle voci apposta: un `Blob` dentro il record JSON del diario
 * renderebbe l'esportazione enorme e imprevedibile in dimensione. Qui restano solo sul
 * dispositivo — vedi il commento su `DiaryEntry.photoIds` in `types.ts` per la conseguenza
 * sull'esportazione.
 */

import { PHOTOS_STORE, openDatabase, promisify } from '@/lib/diary/db'

export interface Photo {
  readonly id: string
  readonly entryId: string
  readonly blob: Blob
  readonly createdAt: string
}

export interface PhotoRepository {
  add(entryId: string, blob: Blob): Promise<Photo>
  listFor(entryId: string): Promise<Photo[]>
  remove(id: string): Promise<boolean>
  /** Toglie tutte le foto di una voce, quando la voce stessa viene eliminata per sempre. */
  removeAllFor(entryId: string): Promise<void>
}

function makeId(): string {
  const c = globalThis.crypto
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID()
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export class InMemoryPhotoRepository implements PhotoRepository {
  private photos = new Map<string, Photo>()

  async add(entryId: string, blob: Blob): Promise<Photo> {
    const photo: Photo = { id: makeId(), entryId, blob, createdAt: new Date().toISOString() }
    this.photos.set(photo.id, photo)
    return photo
  }

  async listFor(entryId: string): Promise<Photo[]> {
    return [...this.photos.values()]
      .filter((p) => p.entryId === entryId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async remove(id: string): Promise<boolean> {
    return this.photos.delete(id)
  }

  async removeAllFor(entryId: string): Promise<void> {
    for (const photo of await this.listFor(entryId)) this.photos.delete(photo.id)
  }
}

export class IndexedDbPhotoRepository implements PhotoRepository {
  async add(entryId: string, blob: Blob): Promise<Photo> {
    const photo: Photo = { id: makeId(), entryId, blob, createdAt: new Date().toISOString() }
    const db = await openDatabase()
    const tx = db.transaction(PHOTOS_STORE, 'readwrite')
    await promisify(tx.objectStore(PHOTOS_STORE).put(photo) as IDBRequest<IDBValidKey>)
    return photo
  }

  async listFor(entryId: string): Promise<Photo[]> {
    const db = await openDatabase()
    const tx = db.transaction(PHOTOS_STORE, 'readonly')
    const index = tx.objectStore(PHOTOS_STORE).index('entryId')
    const all = await promisify(index.getAll(entryId) as IDBRequest<Photo[]>)
    return [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async remove(id: string): Promise<boolean> {
    const db = await openDatabase()
    const tx = db.transaction(PHOTOS_STORE, 'readwrite')
    await promisify(tx.objectStore(PHOTOS_STORE).delete(id) as IDBRequest<undefined>)
    return true
  }

  async removeAllFor(entryId: string): Promise<void> {
    const photos = await this.listFor(entryId)
    const db = await openDatabase()
    const tx = db.transaction(PHOTOS_STORE, 'readwrite')
    await Promise.all(
      photos.map((p) => promisify(tx.objectStore(PHOTOS_STORE).delete(p.id) as IDBRequest<undefined>)),
    )
  }
}

export function createPhotoRepository(): PhotoRepository {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbPhotoRepository()
  } catch {
    // Accedere a indexedDB puo' lanciare, non solo essere undefined.
  }
  return new InMemoryPhotoRepository()
}
