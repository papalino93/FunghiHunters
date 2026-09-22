import type { DiaryEntry } from '@/lib/diary/types'

/**
 * Cio' che un tipo deve avere per passare da `runSync()`: un id stabile fra i dispositivi, un
 * timestamp per il confronto last-write-wins e un tombstone per la cancellazione. Il diario e le
 * zone seguite sono le due forme concrete oggi; qualunque altra lista personale sincronizzabile
 * in futuro passa dallo stesso motore senza copiarne la logica.
 */
export interface SyncableEntity {
  readonly id: string
  readonly updatedAt: string
  readonly deletedAt: string | null
}

/**
 * Ciò che serve al motore di sincronizzazione, indipendente da Supabase.
 *
 * Come `DiaryRepository` e `AuthBackend`: l'interfaccia rende testabile il merge senza una rete e
 * senza un progetto Supabase vero, e rende sostituibile il backend senza toccare la logica.
 *
 * Generico ma con `DiaryEntry` come default: il diario e' arrivato per primo e resta il caso
 * d'uso piu' comune di questo tipo, cosi' il codice e i test esistenti che scrivono
 * `implements SyncBackend` senza parametro continuano a compilare invariati.
 */
export interface SyncBackend<T extends SyncableEntity = DiaryEntry> {
  /**
   * Voci dell'utente modificate dopo `sinceIso` (tutte, se `null`). Include i tombstone
   * (`deletedAt` non nullo): sono la cancellazione, e vanno propagate come le altre modifiche.
   */
  pull(sinceIso: string | null): Promise<T[]>
  /** Upsert per id. Deve essere idempotente: la stessa voce può essere inviata più volte. */
  push(entries: readonly T[]): Promise<void>
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error'

export interface SyncOutcome {
  readonly status: SyncStatus
  readonly pushed: number
  readonly pulled: number
  readonly error: string | null
  /** `null` se questo giro non è riuscito: il prossimo giro riparte dall'ultimo buono. */
  readonly syncedAt: string | null
}
