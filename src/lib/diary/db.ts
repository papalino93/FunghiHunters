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

/**
 * Il database è bloccato da un'altra scheda ferma su una versione precedente.
 *
 * Riconoscibile dall'interfaccia, che deve poter distinguere "non riesco ad aprire l'archivio"
 * da "non hai ancora registrato niente": sono due schermate diverse, e confonderle significa
 * dire a qualcuno che ha perso il diario quando invece è tutto lì.
 */
export class DatabaseBlockedError extends Error {
  constructor() {
    super(
      'Il diario è aperto in un\'altra scheda con una versione precedente dell\'app. ' +
        'Chiudi le altre schede di FungiCast e ricarica.',
    )
    this.name = 'DatabaseBlockedError'
  }
}

let dbPromise: Promise<IDBDatabase> | null = null

export function openDatabase(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
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
    /*
     * Senza questo, un aggiornamento di versione con una vecchia scheda ancora aperta lascia la
     * richiesta sospesa per sempre: né `onsuccess` né `onerror` arrivano mai, la promessa non si
     * risolve e il diario resta sullo scheletro di caricamento senza dire perché. È lo scenario
     * del giorno del rilascio, non un caso di laboratorio: chi ha l'app aperta in background
     * apre una seconda scheda e cade esattamente qui.
     */
    request.onblocked = () => { reject(new DatabaseBlockedError()) }
    request.onsuccess = () => {
      const db = request.result
      // Se un domani un'altra scheda vorrà salire di versione, questa deve farsi da parte invece
      // di bloccarla — cioè invece di riprodurre altrove il bug che `onblocked` qui sopra copre.
      db.onversionchange = () => { db.close(); dbPromise = null }
      resolve(db)
    }
    request.onerror = () => { reject(request.error ?? new Error('IndexedDB non disponibile')) }
  })
  /*
   * Una promessa fallita non va tenuta in cache: con `??=` il primo errore — una scheda che
   * blocca l'upgrade, lo storage pieno, un permesso negato — resterebbe l'unica risposta
   * possibile per tutta la vita della pagina, anche dopo che la causa è sparita.
   */
  return dbPromise.catch((error: unknown) => {
    dbPromise = null
    throw error
  })
}

export function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => { resolve(request.result) }
    request.onerror = () => { reject(request.error ?? new Error('Operazione IndexedDB fallita')) }
  })
}
