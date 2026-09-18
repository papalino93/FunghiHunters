/**
 * Client Supabase lato browser.
 *
 * L'app deve restare consultabile senza account: se le variabili d'ambiente non ci sono (sviluppo
 * locale senza `.env.local`, o un deploy che non le ha ancora configurate), `getBrowserClient()`
 * torna `null` invece di lanciare. Ogni chiamante deve gestire quel caso — è il modo con cui
 * "login solo quando serve" resta vero anche quando Supabase non è configurato, invece di rompere
 * tutta l'app.
 *
 * Solo `NEXT_PUBLIC_SUPABASE_ANON_KEY` arriva qui: è la chiave pubblica, protetta dalla Row Level
 * Security definita in `db/migrations/0001_init.sql`. La service role key non deve mai comparire
 * in un modulo importato dal client — vive solo nelle route API (`src/app/api/.../route.ts`).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null | undefined

function readEnv(): { url: string; anonKey: string } | null {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
  if (url === undefined || url === '' || anonKey === undefined || anonKey === '') return null
  return { url, anonKey }
}

export function isSupabaseConfigured(): boolean {
  return readEnv() !== null
}

/** `null` se mancano le variabili d'ambiente: il chiamante deve trattarlo come "sync non disponibile". */
export function getBrowserClient(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const env = readEnv()
  if (env === null) {
    cached = null
    return null
  }
  cached = createClient(env.url, env.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Legge da solo il ritorno dal redirect (OAuth Google, link via email) e crea la sessione.
      // In caso di errore invece non dice niente a nessuno: lo raccoglie
      // `src/lib/auth/callback.ts`, vedi il commento in testa a quel file.
      detectSessionInUrl: true,
      /*
       * Flusso implicito, fissato a mano e non lasciato al default dell'SDK.
       *
       * Con PKCE il verificatore resta nel `localStorage` del browser che ha iniziato l'accesso,
       * quindi un link di accesso aperto altrove — l'email letta sul telefono, la richiesta
       * partita dal portatile — fallirebbe con un errore che l'utente non può capire né
       * aggirare. Qui il caso non è raro: è mobile-first e l'email si apre dove capita.
       *
       * Il prezzo del flusso implicito è che i token tornano nel frammento dell'URL. Restano nel
       * browser (un frammento non viene inviato al server, non finisce nei log e non entra nella
       * cache del service worker, che vede solo l'URL senza frammento) e l'SDK lo ripulisce
       * appena letto. Da rivedere se un giorno una pagina dovesse essere resa lato server per
       * utente autenticato: lì servirebbe PKCE.
       */
      flowType: 'implicit',
    },
  })
  return cached
}
