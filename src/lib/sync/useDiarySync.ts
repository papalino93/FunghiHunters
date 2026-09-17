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

function readLastSyncedAt(): string | null {
  try {
    return localStorage.getItem(LAST_SYNCED_KEY)
  } catch {
    return null
  }
}

function writeLastSyncedAt(value: string): void {
  try {
    localStorage.setItem(LAST_SYNCED_KEY, value)
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
  sync(): Promise<void>
}

export function useDiarySync(repo: DiaryRepository | null): DiarySyncState {
  const auth = useAuth()
  const [status, setStatus] = useState<SyncStatus>('local')
  const [error, setError] = useState<string | null>(null)
  // Inizializzatore pigro, non un effetto: `readLastSyncedAt()` è già sicuro su chi non ha
  // `localStorage` (server, finestra privata), quindi non c'è bisogno di un giro di render in più
  // solo per leggerlo.
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => readLastSyncedAt())
  const running = useRef(false)
  const prevSignedIn = useRef(false)

  const sync = useCallback(async (): Promise<void> => {
    if (repo === null || auth.status !== 'signed-in' || running.current) return
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
        writeLastSyncedAt(outcome.syncedAt)
      }
    } else {
      setStatus('error')
      setError(outcome.error)
    }
  }, [repo, auth.status, auth.user, lastSyncedAt])

  // Sincronizza al login e quando torna la rete dopo essere stata assente. Non ad ogni render:
  // il guard su `prevSignedIn` evita di ripartire solo perché `sync` ha cambiato identità dopo
  // essersi appena conclusa.
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

  return { status: effectiveStatus, error, lastSyncedAt, available: auth.status !== 'unavailable', sync }
}
