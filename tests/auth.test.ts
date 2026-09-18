/**
 * Test dello stato di autenticazione.
 *
 * Girano contro un `AuthBackend` finto: nessuna rete, nessun progetto Supabase vero. Quello che
 * conta verificare è la macchina a stati — login, logout, persistenza della sessione, sessione
 * scaduta notificata dal backend — e il comportamento quando Supabase non è configurato.
 */

import { describe, expect, it } from 'vitest'

import { AuthController } from '@/lib/auth/controller'
import type { AuthBackend, AuthUser } from '@/lib/auth/types'

const USER: AuthUser = { id: 'u1', email: 'utente@esempio.it' }

class FakeAuthBackend implements AuthBackend {
  session: AuthUser | null = null
  listeners = new Set<(user: AuthUser | null) => void>()
  signOutCalls = 0
  lastMagicLinkEmail: string | null = null
  nextError: string | null = null

  async getSession(): Promise<AuthUser | null> {
    return this.session
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /** Simula un evento del provider reale: login altrove, refresh, scadenza. */
  emit(user: AuthUser | null): void {
    this.session = user
    for (const listener of this.listeners) listener(user)
  }

  async signInWithGoogle() {
    return { error: this.nextError }
  }

  async signInWithMagicLink(email: string) {
    this.lastMagicLinkEmail = email
    return { error: this.nextError }
  }

  async signOut() {
    this.signOutCalls += 1
    this.emit(null)
    return { error: this.nextError }
  }
}

describe('senza Supabase configurato', () => {
  it('parte "unavailable" e non prova mai a contattare un backend', async () => {
    const controller = new AuthController(null)
    expect(controller.getState().status).toBe('unavailable')

    await controller.init()
    expect(controller.getState().status).toBe('unavailable')
  })

  it('le azioni tornano un errore leggibile invece di lanciare', async () => {
    const controller = new AuthController(null)
    const google = await controller.signInWithGoogle('https://esempio.it')
    const magic = await controller.signInWithMagicLink('a@b.it', 'https://esempio.it')
    expect(google.error).toMatch(/non è configurata/)
    expect(magic.error).toMatch(/non è configurata/)
  })
})

describe('sessione al caricamento', () => {
  it('nessuna sessione salvata → signed-out', async () => {
    const backend = new FakeAuthBackend()
    const controller = new AuthController(backend)
    expect(controller.getState().status).toBe('loading')

    await controller.init()
    expect(controller.getState()).toEqual({ status: 'signed-out', user: null })
  })

  it('sessione già persistita dall\'SDK → signed-in, senza dover rifare login', async () => {
    const backend = new FakeAuthBackend()
    backend.session = USER
    const controller = new AuthController(backend)

    await controller.init()
    expect(controller.getState()).toEqual({ status: 'signed-in', user: USER })
  })
})

describe('cambi di sessione notificati dal backend', () => {
  it('un login altrove aggiorna lo stato e notifica gli iscritti', async () => {
    const backend = new FakeAuthBackend()
    const controller = new AuthController(backend)
    await controller.init()

    const seen: string[] = []
    controller.subscribe((state) => { seen.push(state.status) })

    backend.emit(USER)
    expect(controller.getState()).toEqual({ status: 'signed-in', user: USER })
    expect(seen.at(-1)).toBe('signed-in')
  })

  it('una sessione scaduta riporta a signed-out', async () => {
    const backend = new FakeAuthBackend()
    backend.session = USER
    const controller = new AuthController(backend)
    await controller.init()

    backend.emit(null)
    expect(controller.getState().status).toBe('signed-out')
  })

  it('signOut() chiama il backend e lo stato torna signed-out', async () => {
    const backend = new FakeAuthBackend()
    backend.session = USER
    const controller = new AuthController(backend)
    await controller.init()

    await controller.signOut()
    expect(backend.signOutCalls).toBe(1)
    expect(controller.getState().status).toBe('signed-out')
  })
})

describe('magic link', () => {
  it('rifiuta un indirizzo senza "@" senza contattare il backend', async () => {
    const backend = new FakeAuthBackend()
    const controller = new AuthController(backend)
    const result = await controller.signInWithMagicLink('non-un-email', 'https://esempio.it')
    expect(result.error).toMatch(/non valido/)
    expect(backend.lastMagicLinkEmail).toBeNull()
  })

  it('propaga l\'email al backend quando è valida', async () => {
    const backend = new FakeAuthBackend()
    const controller = new AuthController(backend)
    await controller.signInWithMagicLink('utente@esempio.it', 'https://esempio.it')
    expect(backend.lastMagicLinkEmail).toBe('utente@esempio.it')
  })

  it('propaga l\'errore del backend, ad esempio un rate limit', async () => {
    const backend = new FakeAuthBackend()
    backend.nextError = 'troppi tentativi, riprova fra un minuto'
    const controller = new AuthController(backend)
    const result = await controller.signInWithMagicLink('utente@esempio.it', 'https://esempio.it')
    expect(result.error).toBe('troppi tentativi, riprova fra un minuto')
  })
})

describe('subscribe()', () => {
  it('notifica subito lo stato corrente a un nuovo iscritto', async () => {
    const backend = new FakeAuthBackend()
    backend.session = USER
    const controller = new AuthController(backend)
    await controller.init()

    const received: string[] = []
    controller.subscribe((state) => { received.push(state.status) })
    expect(received).toEqual(['signed-in'])
  })

  it('un iscritto che si disiscrive non riceve più notifiche', async () => {
    const backend = new FakeAuthBackend()
    const controller = new AuthController(backend)
    await controller.init()

    const received: string[] = []
    const unsubscribe = controller.subscribe((state) => { received.push(state.status) })
    unsubscribe()
    backend.emit(USER)
    expect(received).toEqual(['signed-out']) // solo la notifica immediata alla iscrizione
  })
})
