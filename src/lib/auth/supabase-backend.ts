/**
 * Adapter fra il client Supabase reale e `AuthBackend`.
 *
 * Unico file che tocca `supabase.auth.*`. Se domani cambia SDK o si aggiunge Apple Sign In,
 * cambia solo questo file.
 */

import type { Session, SupabaseClient } from '@supabase/supabase-js'

import type { AuthBackend, AuthUser } from '@/lib/auth/types'

function toUser(session: Session | null): AuthUser | null {
  if (session === null) return null
  return { id: session.user.id, email: session.user.email ?? null }
}

export function createSupabaseAuthBackend(client: SupabaseClient): AuthBackend {
  return {
    async getSession() {
      const { data } = await client.auth.getSession()
      return toUser(data.session)
    },

    onAuthStateChange(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        callback(toUser(session))
      })
      return () => { data.subscription.unsubscribe() }
    },

    async signInWithGoogle(redirectTo) {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      return { error: error?.message ?? null }
    },

    async signInWithMagicLink(email, redirectTo) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      })
      return { error: error?.message ?? null }
    },

    async signOut() {
      const { error } = await client.auth.signOut()
      return { error: error?.message ?? null }
    },
  }
}
