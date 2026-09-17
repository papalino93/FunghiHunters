'use client'

/**
 * Stato di autenticazione condiviso da tutta l'app, via React context.
 *
 * Sta sopra `AuthController` (testato da solo, senza React) solo per il collegamento con
 * `useSyncExternalStore`. Se Supabase non è configurato lo stato resta `unavailable` e ogni
 * azione torna un errore leggibile invece di lanciare: l'app deve restare consultabile senza
 * account, come richiesto — login solo quando l'utente vuole salvare o sincronizzare qualcosa.
 */

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'

import { AuthController } from '@/lib/auth/controller'
import { createSupabaseAuthBackend } from '@/lib/auth/supabase-backend'
import type { AuthState } from '@/lib/auth/types'
import { getBrowserClient } from '@/lib/supabase/client'

// Intersezione, non `extends`: `AuthState` è un'unione discriminata, e solo l'intersezione la
// distribuisce sui singoli membri mantenendo la discriminazione su `status` disponibile a chi usa
// `useAuth()` (es. `if (auth.status === 'signed-in') auth.user.id`, senza controlli su `null`).
type AuthContextValue = AuthState & {
  signInWithGoogle(): Promise<{ error: string | null }>
  signInWithMagicLink(email: string): Promise<{ error: string | null }>
  signOut(): Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const LOADING_STATE: AuthState = { status: 'loading', user: null }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const controller = useMemo(() => {
    const client = getBrowserClient()
    return new AuthController(client === null ? null : createSupabaseAuthBackend(client))
  }, [])

  useEffect(() => {
    void controller.init()
    return () => { controller.dispose() }
  }, [controller])

  const state = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getState(),
    () => LOADING_STATE,
  )

  // Dove torna Supabase dopo il redirect OAuth / il link dell'email: la pagina account, dove
  // l'utente può vedere subito l'esito invece di ritrovarsi sulla home senza spiegazione.
  const redirectTo = typeof window === 'undefined' ? '' : `${window.location.origin}/account`

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signInWithGoogle: () => controller.signInWithGoogle(redirectTo),
      signInWithMagicLink: (email: string) => controller.signInWithMagicLink(email, redirectTo),
      signOut: () => controller.signOut(),
    }),
    [state, controller, redirectTo],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === null) throw new Error('useAuth va chiamato dentro <AuthProvider>.')
  return ctx
}
