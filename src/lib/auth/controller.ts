/**
 * Macchina a stati dell'autenticazione, senza React.
 *
 * Separata dal context per lo stesso motivo del `DiaryRepository`: la logica si testa da sola,
 * senza montare componenti né un DOM finto.
 */

import type { AuthActionResult, AuthBackend, AuthState, AuthUser } from '@/lib/auth/types'

export class AuthController {
  private state: AuthState
  private readonly listeners = new Set<(state: AuthState) => void>()
  private unsubscribeBackend: (() => void) | null = null

  constructor(private readonly backend: AuthBackend | null) {
    this.state = backend === null ? { status: 'unavailable', user: null } : { status: 'loading', user: null }
  }

  getState(): AuthState {
    return this.state
  }

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  private setState(next: AuthState): void {
    this.state = next
    for (const listener of this.listeners) listener(this.state)
  }

  /** Da chiamare una volta, al montaggio del provider. */
  async init(): Promise<void> {
    if (this.backend === null) return
    const user = await this.backend.getSession()
    this.applyUser(user)
    this.unsubscribeBackend = this.backend.onAuthStateChange((changed) => { this.applyUser(changed) })
  }

  private applyUser(user: AuthUser | null): void {
    if (user === null) this.setState({ status: 'signed-out', user: null })
    else this.setState({ status: 'signed-in', user })
  }

  dispose(): void {
    this.unsubscribeBackend?.()
    this.unsubscribeBackend = null
  }

  async signInWithGoogle(redirectTo: string): Promise<AuthActionResult> {
    if (this.backend === null) return { error: 'La sincronizzazione non è configurata su questo deploy.' }
    return this.backend.signInWithGoogle(redirectTo)
  }

  async signInWithMagicLink(email: string, redirectTo: string): Promise<AuthActionResult> {
    if (this.backend === null) return { error: 'La sincronizzazione non è configurata su questo deploy.' }
    if (!email.includes('@')) return { error: 'Indirizzo email non valido.' }
    return this.backend.signInWithMagicLink(email, redirectTo)
  }

  async signOut(): Promise<AuthActionResult> {
    if (this.backend === null) return { error: null }
    return this.backend.signOut()
  }
}
