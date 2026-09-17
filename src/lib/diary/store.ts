/**
 * Persistenza del diario.
 *
 * **Sta sul telefono, non su un server.** Non è una scelta di principio: è che il progetto non ha
 * ancora un database, e inventarne uno finto sarebbe peggio che dirlo. La conseguenza onesta è
 * che il diario vive in un solo browser e si perde cambiando dispositivo — per questo
 * l'esportazione non è una funzione accessoria ma parte del contratto, ed è raggiungibile in due
 * tocchi.
 *
 * Cosa manca per sincronizzare: un progetto Supabase con le sue chiavi in `.env.local`
 * (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) e la migrazione
 * `db/migrations/0001_init.sql` applicata. Lo schema c'è già, con RLS sulle tabelle utente.
 *
 * La logica sta dietro un'interfaccia perché il passaggio a Supabase deve toccare
 * un'implementazione e nient'altro, e perché i test girano su quella in memoria senza IndexedDB.
 */

import {
  type DiaryDraft,
  type DiaryEntry,
  type DiaryExport,
  applyPrivacy,
} from '@/lib/diary/types'

export interface DiaryRepository {
  list(): Promise<DiaryEntry[]>
  add(draft: DiaryDraft): Promise<DiaryEntry>
  update(id: string, patch: Partial<DiaryDraft>): Promise<DiaryEntry | null>
  remove(id: string): Promise<boolean>
  clear(): Promise<void>
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(): string {
  // `randomUUID` non c'è ovunque (contesti non sicuri, browser vecchi): il ripiego resta unico
  // abbastanza per un diario personale.
  const c = globalThis.crypto
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID()
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/** Costruisce una voce completa da una bozza, applicando la riservatezza scelta. */
export function materialise(draft: DiaryDraft, existing?: DiaryEntry): DiaryEntry {
  const privacy = draft.privacy ?? existing?.privacy ?? 'area'
  const coords = applyPrivacy(
    draft.latitude ?? existing?.latitude ?? null,
    draft.longitude ?? existing?.longitude ?? null,
    privacy,
  )

  return {
    id: existing?.id ?? makeId(),
    date: draft.date,
    zoneCode: draft.zoneCode,
    zoneName: draft.zoneName,
    abundance: draft.abundance,
    elevationM: draft.elevationM ?? existing?.elevationM ?? null,
    notes: draft.notes ?? existing?.notes ?? '',
    latitude: coords.latitude,
    longitude: coords.longitude,
    privacy,
    // I campi congelati non si riscrivono mai in aggiornamento: descrivono il momento
    // dell'inserimento, non lo stato attuale del modello.
    mpiAtEntry: existing?.mpiAtEntry ?? draft.mpiAtEntry ?? null,
    confidenceAtEntry: existing?.confidenceAtEntry ?? draft.confidenceAtEntry ?? null,
    algorithmVersionAtEntry:
      existing?.algorithmVersionAtEntry ?? draft.algorithmVersionAtEntry ?? null,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  }
}

/** Ordina dalla più recente, che è l'ordine in cui si guarda un diario. */
export function sortEntries(entries: readonly DiaryEntry[]): DiaryEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
}

/** Implementazione in memoria: usata dai test e come ripiego se IndexedDB non è disponibile. */
export class InMemoryDiaryRepository implements DiaryRepository {
  private entries = new Map<string, DiaryEntry>()

  async list(): Promise<DiaryEntry[]> {
    return sortEntries([...this.entries.values()])
  }

  async add(draft: DiaryDraft): Promise<DiaryEntry> {
    const entry = materialise(draft)
    this.entries.set(entry.id, entry)
    return entry
  }

  async update(id: string, patch: Partial<DiaryDraft>): Promise<DiaryEntry | null> {
    const existing = this.entries.get(id)
    if (existing === undefined) return null
    const updated = materialise({ ...existing, ...patch }, existing)
    this.entries.set(id, updated)
    return updated
  }

  async remove(id: string): Promise<boolean> {
    return this.entries.delete(id)
  }

  async clear(): Promise<void> {
    this.entries.clear()
  }
}

const DB_NAME = 'fungicast'
const DB_VERSION = 1
const STORE = 'diary'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('date', 'date')
      }
    }
    request.onsuccess = () => { resolve(request.result) }
    request.onerror = () => { reject(request.error ?? new Error('IndexedDB non disponibile')) }
  })
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => { resolve(request.result) }
    request.onerror = () => { reject(request.error ?? new Error('Operazione IndexedDB fallita')) }
  })
}

/** Implementazione su IndexedDB. Sopravvive alla chiusura del browser, non al cambio di telefono. */
export class IndexedDbDiaryRepository implements DiaryRepository {
  private db: Promise<IDBDatabase> | null = null

  private connect(): Promise<IDBDatabase> {
    this.db ??= openDatabase()
    return this.db
  }

  async list(): Promise<DiaryEntry[]> {
    const db = await this.connect()
    const tx = db.transaction(STORE, 'readonly')
    const all = await promisify(tx.objectStore(STORE).getAll() as IDBRequest<DiaryEntry[]>)
    return sortEntries(all)
  }

  async add(draft: DiaryDraft): Promise<DiaryEntry> {
    const entry = materialise(draft)
    const db = await this.connect()
    const tx = db.transaction(STORE, 'readwrite')
    await promisify(tx.objectStore(STORE).put(entry) as IDBRequest<IDBValidKey>)
    return entry
  }

  async update(id: string, patch: Partial<DiaryDraft>): Promise<DiaryEntry | null> {
    const db = await this.connect()
    const read = db.transaction(STORE, 'readonly')
    const existing = await promisify(
      read.objectStore(STORE).get(id) as IDBRequest<DiaryEntry | undefined>,
    )
    if (existing === undefined) return null

    const updated = materialise({ ...existing, ...patch }, existing)
    const write = db.transaction(STORE, 'readwrite')
    await promisify(write.objectStore(STORE).put(updated) as IDBRequest<IDBValidKey>)
    return updated
  }

  async remove(id: string): Promise<boolean> {
    const db = await this.connect()
    const tx = db.transaction(STORE, 'readwrite')
    await promisify(tx.objectStore(STORE).delete(id) as IDBRequest<undefined>)
    return true
  }

  async clear(): Promise<void> {
    const db = await this.connect()
    const tx = db.transaction(STORE, 'readwrite')
    await promisify(tx.objectStore(STORE).clear() as IDBRequest<undefined>)
  }
}

/**
 * Il repository da usare nell'app.
 * In finestra privata o con lo storage bloccato IndexedDB può mancare: in quel caso il diario
 * funziona comunque per la sessione corrente, e l'interfaccia lo dice invece di fingere.
 */
export function createDiaryRepository(): { repo: DiaryRepository; persistent: boolean } {
  try {
    if (typeof indexedDB !== 'undefined') {
      return { repo: new IndexedDbDiaryRepository(), persistent: true }
    }
  } catch {
    // Accedere a indexedDB può lanciare, non solo essere undefined.
  }
  return { repo: new InMemoryDiaryRepository(), persistent: false }
}

// ============================================================================
// ESPORTAZIONE E IMPORTAZIONE
// ============================================================================

export function toExport(entries: readonly DiaryEntry[]): DiaryExport {
  return {
    format: 'fungicast-diary',
    version: 1,
    exportedAt: nowIso(),
    entries: sortEntries(entries),
  }
}

export interface ImportResult {
  readonly imported: number
  readonly skipped: number
  readonly errors: readonly string[]
}

/**
 * Importa un file di esportazione, saltando le voci già presenti.
 *
 * Tollerante sulle voci singole e severa sul formato: un file sbagliato deve fallire subito, una
 * riga malformata dentro un file giusto non deve far perdere tutte le altre.
 */
export async function importInto(
  repo: DiaryRepository,
  payload: unknown,
): Promise<ImportResult> {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('File non riconosciuto: non è un oggetto JSON.')
  }
  const data = payload as Partial<DiaryExport>
  if (data.format !== 'fungicast-diary') {
    throw new Error('File non riconosciuto: manca il formato "fungicast-diary".')
  }
  if (!Array.isArray(data.entries)) {
    throw new Error('File non riconosciuto: manca l’elenco delle uscite.')
  }

  const existing = new Set((await repo.list()).map((e) => e.id))
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const raw of data.entries) {
    const entry = raw as Partial<DiaryEntry>
    if (typeof entry.id === 'string' && existing.has(entry.id)) {
      skipped += 1
      continue
    }
    if (typeof entry.date !== 'string' || typeof entry.zoneCode !== 'string') {
      errors.push(`Voce senza data o zona, saltata (id ${String(entry.id ?? 'ignoto')}).`)
      continue
    }
    await repo.add({
      date: entry.date,
      zoneCode: entry.zoneCode,
      zoneName: entry.zoneName ?? entry.zoneCode,
      abundance: entry.abundance ?? 'none',
      elevationM: entry.elevationM ?? null,
      notes: entry.notes ?? '',
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null,
      privacy: entry.privacy ?? 'area',
      mpiAtEntry: entry.mpiAtEntry ?? null,
      confidenceAtEntry: entry.confidenceAtEntry ?? null,
      algorithmVersionAtEntry: entry.algorithmVersionAtEntry ?? null,
    })
    imported += 1
  }

  return { imported, skipped, errors }
}
