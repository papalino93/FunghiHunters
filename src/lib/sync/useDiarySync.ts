'use client'

/**
 * Collega diario, autenticazione e motore di sincronizzazione in un hook.
 *
 * Stati esposti, esattamente i quattro richiesti: `local` (nessun account, o non ancora
 * sincronizzato), `syncing`, `synced`, `error`. Il timestamp dell'ultima sincronizzazione riuscita
 * vive in `localStorage` — non nel diario stesso — perché è per-dispositivo: due telefoni con lo
 * stesso account possono avere sincronizzato l'ultima volta in momenti diversi.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { DiaryRepository } from '@/lib/diary/store'
import { useAuth } from '@/lib/auth/context'
import { runSync } from '@/lib/sync/engine'
import { createSupabaseSyncBackend } from '@/lib/sync/supabase-backend'
import type { SyncStatus } from '@/lib/sync/types'
import { getBrowserClient } from '@/lib/supabase/client'

const LAST_SYNCED_KEY = 'fungicast:diary-last-synced-at'
const LAST_SYNCED_USER_KEY = 'fungicast:diary-last-synced-user-id'

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage bloccato (finestra privata): la prossima sincronizzazione ripartirà da zero,
    // ripescando tutto. Corretto ma ridondante, non un errore da mostrare.
  }
}

export interface DiarySyncState {
  readonly status: SyncStatus
  readonly error: string | null
  readonly lastSyncedAt: string | null
  readonly available: boolean
  /**
   * `true` quando il diario locale risulta sincronizzato l'ultima volta con un account diverso
   * da quello ora collegato — un dispositivo condiviso dove è appena entrato un altro utente.
   * Finché è `true`, `sync()` senza `force` non fa nulla: sincronizzare in automatico
   * spedirebbe il diario di chi ha usato il dispositivo prima verso l'account sbagliato. Vedi il
   * commento su `sync()`.
   */
  readonly accountMismatch: boolean
  sync(options?: { readonly force?: boolean }): Promise<void>
}

/**
 * Se il diario locale va sincronizzato in automatico con l'account ora collegato.
 *
 * Funzione pura, separata dall'hook apposta: è la decisione che ha permesso al diario di una
 * persona di finire nell'account di un'altra su un dispositivo condiviso, e va potuta testare
 * senza montare un componente React o un `localStorage` finto.
 */
export function isAccountMismatch(
  lastSyncedUserId: string | null,
  currentUserId: string,
): boolean {
  return lastSyncedUserId !== null && lastSyncedUserId !== currentUserId
}

export function useDiarySync(repo: DiaryRepository | null): DiarySyncState {
  const auth = useAuth()
  const [status, setStatus] = useState<SyncStatus>('local')
  const [error, setError] = useState<string | null>(null)
  // Inizializzatori pigri, non un effetto: la lettura da `localStorage` è già sicura su chi non
  // ce l'ha (server, finestra privata), quindi non serve un giro di render in più per farla.
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => readLocal(LAST_SYNCED_KEY))
  const [lastSyncedUserId, setLastSyncedUserId] = useState<string | null>(() =>
    readLocal(LAST_SYNCED_USER_KEY),
  )
  const running = useRef(false)
  const prevSignedIn = useRef(false)

  /*
   * Il bug che questo controllo chiude: due persone sullo stesso dispositivo, in sequenza.
   * `sync()` scattava in automatico a ogni login, e spediva TUTTE le voci locali verso l'account
   * appena collegato — comprese quelle lasciate lì dalla persona precedente, se non aveva
   * cancellato il diario prima di uscire (il logout non tocca il diario locale, di proposito: è
   * dati dell'utente, non va perso). Risultato: il diario di A, con eventuali coordinate esatte,
   * finiva nelle righe di B su Supabase. Ora si sincronizza solo quando l'ultimo account con cui
   * ci si è sincronizzati su questo dispositivo è lo stesso di quello collegato ora, oppure non
   * ce n'è mai stato uno (primo login, o dispositivo mai sincronizzato).
   */
  const accountMismatch =
    auth.status === 'signed-in' && isAccountMismatch(lastSyncedUserId, auth.user.id)

  const sync = useCallback(
    async (options?: { readonly force?: boolean }): Promise<void> => {
      if (repo === null || auth.status !== 'signed-in' || running.current) return
      if (accountMismatch && options?.force !== true) return
      const client = getBrowserClient()
      if (client === null) return

      running.current = true
      setStatus('syncing')
      const backend = createSupabaseSyncBackend(client, auth.user.id)
      const outcome = await runSync(repo, backend, lastSyncedAt)
      running.current = false

      if (outcome.status === 'synced') {
        setStatus('synced')
        setError(null)
        if (outcome.syncedAt !== null) {
          setLastSyncedAt(outcome.syncedAt)
          writeLocal(LAST_SYNCED_KEY, outcome.syncedAt)
        }
        setLastSyncedUserId(auth.user.id)
        writeLocal(LAST_SYNCED_USER_KEY, auth.user.id)
      } else {
        setStatus('error')
        setError(outcome.error)
      }
    },
    [repo, auth.status, auth.user, lastSyncedAt, accountMismatch],
  )

  // Sincronizza al login e quando torna la rete dopo essere stata assente. Non ad ogni render:
  // il guard su `prevSignedIn` evita di ripartire solo perché `sync` ha cambiato identità dopo
  // essersi appena conclusa. Non forzato: se l'account non corrisponde all'ultimo sincronizzato
  // su questo dispositivo, resta fermo finché non è l'utente a confermare esplicitamente.
  useEffect(() => {
    const signedIn = auth.status === 'signed-in'
    if (signedIn && !prevSignedIn.current) void sync()
    prevSignedIn.current = signedIn
  }, [auth.status, sync])

  // 'local' è derivato dal render, non da un setState nell'effetto sopra: da disconnessi lo stato
  // di un giro di sync passato non ha più senso da mostrare, e calcolarlo qui evita un giro di
  // render in più solo per azzerarlo.
  const effectiveStatus: SyncStatus = auth.status === 'signed-in' ? status : 'local'

  useEffect(() => {
    const handleOnline = (): void => { void sync() }
    window.addEventListener('online', handleOnline)
    return () => { window.removeEventListener('online', handleOnline) }
  }, [sync])

  return {
    status: effectiveStatus,
    error,
    lastSyncedAt,
    available: auth.status !== 'unavailable',
    accountMismatch,
    sync,
  }
}
