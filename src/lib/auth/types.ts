/**
 * Tipi di autenticazione, indipendenti da Supabase.
 *
 * `AuthBackend` è l'unica cosa che dipende dall'SDK reale. Tutto il resto — il controller, il
 * context React, i test — parla con questa interfaccia, cosi' i test dello stato di
 * autenticazione (login, logout, persistenza, cambio di sessione) non hanno bisogno ne' di una
 * rete ne' di un progetto Supabase vero.
 */

export interface AuthUser {
  readonly id: string
  readonly email: string | null
}

export type AuthStatus =
  /** Nessuna variabile d'ambiente Supabase: login non disponibile, l'app resta usabile senza. */
  | 'unavailable'
  /** Sessione in verifica al primo caricamento. */
  | 'loading'
  | 'signed-out'
  | 'signed-in'

/** Unione discriminata su `status`: dove serve `user`, TypeScript lo sa già non nullo. */
export type AuthState =
  | { readonly status: 'unavailable'; readonly user: null }
  | { readonly status: 'loading'; readonly user: null }
  | { readonly status: 'signed-out'; readonly user: null }
  | { readonly status: 'signed-in'; readonly user: AuthUser }

export interface AuthActionResult {
  readonly error: string | null
}

export interface AuthBackend {
  /** Sessione già presente (persistita dall'SDK), se c'è. */
  getSession(): Promise<AuthUser | null>
  /** Notifica ogni cambio: login, logout, refresh del token, sessione scaduta. */
  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void
  signInWithGoogle(redirectTo: string): Promise<AuthActionResult>
  signInWithMagicLink(email: string, redirectTo: string): Promise<AuthActionResult>
  signOut(): Promise<AuthActionResult>
}
