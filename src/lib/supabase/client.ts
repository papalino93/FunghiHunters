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
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return cached
}
