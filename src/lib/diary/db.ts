/**
 * Connessione IndexedDB condivisa fra diario, foto e punti salvati.
 *
 * Un solo database, versionato una volta sola: aprirne due con versioni diverse per lo stesso
 * nome fa fallire l'`onupgradeneeded` del secondo. Ogni nuovo object store passa da qui.
 */

export const DB_NAME = 'fungicast'
export const DB_VERSION = 2
export const DIARY_STORE = 'diary'
export const PHOTOS_STORE = 'photos'
export const WAYPOINTS_STORE = 'waypoints'

let dbPromise: Promise<IDBDatabase> | null = null

export function openDatabase(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DIARY_STORE)) {
        const store = db.createObjectStore(DIARY_STORE, { keyPath: 'id' })
        store.createIndex('date', 'date')
      }
      if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
        const store = db.createObjectStore(PHOTOS_STORE, { keyPath: 'id' })
        store.createIndex('entryId', 'entryId')
      }
      if (!db.objectStoreNames.contains(WAYPOINTS_STORE)) {
        db.createObjectStore(WAYPOINTS_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => { resolve(request.result) }
    request.onerror = () => { reject(request.error ?? new Error('IndexedDB non disponibile')) }
  })
  return dbPromise
}

export function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => { resolve(request.result) }
    request.onerror = () => { reject(request.error ?? new Error('Operazione IndexedDB fallita')) }
  })
}
