'use client'

/**
 * Stato di autenticazione condiviso da tutta l'app, via React context.
 *
 * Sta sopra `AuthController` (testato da solo, senza React) solo per il collegamento con
 * `useSyncExternalStore`. Se Supabase non è configurato lo stato resta `unavailable` e ogni
 * azione torna un errore leggibile invece di lanciare: l'app deve restare consultabile senza
 * account, come richiesto — login solo quando l'utente vuole salvare o sincronizzare qualcosa.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'

import { readAuthCallbackError, urlWithoutAuthParams } from '@/lib/auth/callback'
import type { AuthCallbackError } from '@/lib/auth/callback'
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
  /** Esito negativo dell'ultimo ritorno da Supabase, finché non viene chiuso. */
  readonly callbackError: AuthCallbackError | null
  dismissCallbackError(): void
  /** L'URL su cui Supabase rimanda dopo l'accesso: va autorizzato nel progetto. */
  readonly callbackUrl: string
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

  /*
   * Esito del ritorno da Supabase.
   *
   * Letto durante il render e non dentro un effetto, per la stessa ragione spiegata in
   * `useIsHydrated`: leggere uno stato esterno in un effetto e chiamare `setState` innesca un
   * render a cascata. L'ordine però è vincolante, ed è l'unico motivo per cui questa riga sta
   * *dopo* lo `useMemo` qui sopra: il client Supabase legge `window.location.href` in modo
   * sincrono dentro il proprio costruttore, quindi solo da qui in poi l'URL è già stato
   * consumato dall'SDK e si può leggere — e poi ripulire — senza togliergli niente.
   *
   * Chi rende questo valore deve aspettare l'idratazione (`useIsHydrated`), altrimenti il
   * markup del server e quello del browser non coinciderebbero.
   */
  const [callbackError, setCallbackError] = useState<AuthCallbackError | null>(() =>
    typeof window === 'undefined' ? null : readAuthCallbackError(window.location.href),
  )

  /*
   * Ripulire l'URL non è cosmesi: dopo un errore l'SDK lascia i parametri nella barra degli
   * indirizzi, e ogni ricaricamento ripresenterebbe lo stesso errore all'infinito. Dopo un
   * accesso riuscito ci pensa già l'SDK, e qui non c'è niente da togliere.
   */
  useEffect(() => {
    if (callbackError === null) return
    window.history.replaceState(
      window.history.state,
      '',
      urlWithoutAuthParams(window.location.href),
    )
  }, [callbackError])

  const dismissCallbackError = useCallback(() => { setCallbackError(null) }, [])

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
      callbackError,
      dismissCallbackError,
      callbackUrl: redirectTo,
    }),
    [state, controller, redirectTo, callbackError, dismissCallbackError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === null) throw new Error('useAuth va chiamato dentro <AuthProvider>.')
  return ctx
}
