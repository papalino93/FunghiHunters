'use client'

/**
 * Collega le zone che seguo, l'autenticazione e il motore di sincronizzazione — stessa forma di
 * `src/lib/sync/useDiarySync.ts`, con chiavi di `localStorage` separate: le due liste hanno un
 * proprio cursore di sincronizzazione, ognuna per dispositivo.
 *
 * Duplicata di proposito invece di condivisa dietro un hook generico: `useDiarySync` è già in
 * produzione e testato per il diario, che deve restare perfetto in Toscana. Fondere i due hook
 * avrebbe risparmiato una settantina di righe ma avrebbe voluto dire toccare quel codice per una
 * funzione nuova — il rischio non vale il risparmio. La parte che conta davvero — il merge, il
 * conflitto, i tombstone — non è duplicata: vive una sola volta in `runSync()`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { FollowedZoneRepository } from '@/lib/zones/store'
import type { FollowedZone } from '@/lib/zones/types'
import { useAuth } from '@/lib/auth/context'
import { runSync } from '@/lib/sync/engine'
import { createFollowedZonesSyncBackend } from '@/lib/zones/supabase-backend'
import { isAccountMismatch } from '@/lib/sync/useDiarySync'
import type { SyncStatus } from '@/lib/sync/types'
import { getBrowserClient } from '@/lib/supabase/client'

const LAST_SYNCED_KEY = 'fungicast:zones-last-synced-at'
const LAST_SYNCED_USER_KEY = 'fungicast:zones-last-synced-user-id'

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
    // Storage bloccato: la prossima sincronizzazione riparte da zero, corretto ma ridondante.
  }
}

export interface FollowedZonesSyncState {
  readonly status: SyncStatus
  readonly error: string | null
  readonly available: boolean
  /** Stesso significato di `DiarySyncState.accountMismatch`: dispositivo condiviso, non inviare da sola. */
  readonly accountMismatch: boolean
  sync(options?: { readonly force?: boolean }): Promise<void>
}

export function useFollowedZonesSync(repo: FollowedZoneRepository | null): FollowedZonesSyncState {
  const auth = useAuth()
  const [status, setStatus] = useState<SyncStatus>('local')
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => readLocal(LAST_SYNCED_KEY))
  const [lastSyncedUserId, setLastSyncedUserId] = useState<string | null>(() =>
    readLocal(LAST_SYNCED_USER_KEY),
  )
  const running = useRef(false)
  const prevSignedIn = useRef(false)

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
      const backend = createFollowedZonesSyncBackend(client, auth.user.id)
      const outcome = await runSync<FollowedZone>(repo, backend, lastSyncedAt)
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

  // Stessi inneschi del diario: al login e al ritorno della rete, mai da sola in caso di mismatch.
  useEffect(() => {
    const signedIn = auth.status === 'signed-in'
    if (signedIn && !prevSignedIn.current) void sync()
    prevSignedIn.current = signedIn
  }, [auth.status, sync])

  const effectiveStatus: SyncStatus = auth.status === 'signed-in' ? status : 'local'

  useEffect(() => {
    const handleOnline = (): void => { void sync() }
    window.addEventListener('online', handleOnline)
    return () => { window.removeEventListener('online', handleOnline) }
  }, [sync])

  return {
    status: effectiveStatus,
    error,
    available: auth.status !== 'unavailable',
    accountMismatch,
    sync,
  }
}
