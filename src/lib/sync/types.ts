import type { DiaryEntry } from '@/lib/diary/types'

/**
 * Ciò che serve al motore di sincronizzazione, indipendente da Supabase.
 *
 * Come `DiaryRepository` e `AuthBackend`: l'interfaccia rende testabile il merge senza una rete e
 * senza un progetto Supabase vero, e rende sostituibile il backend senza toccare la logica.
 */
export interface SyncBackend {
  /**
   * Voci dell'utente modificate dopo `sinceIso` (tutte, se `null`). Include i tombstone
   * (`deletedAt` non nullo): sono la cancellazione, e vanno propagate come le altre modifiche.
   */
  pull(sinceIso: string | null): Promise<DiaryEntry[]>
  /** Upsert per id. Deve essere idempotente: la stessa voce può essere inviata più volte. */
  push(entries: readonly DiaryEntry[]): Promise<void>
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
