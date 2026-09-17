/**
 * Client Supabase con la service role key.
 *
 * **Solo lato server.** Bypassa la Row Level Security, quindi può leggere e cancellare i dati di
 * chiunque: deve essere importato esclusivamente da `src/app/api/**\/route.ts` e mai da un
 * componente `'use client'` o da codice condiviso col browser. `SUPABASE_SERVICE_ROLE_KEY` non ha
 * il prefisso `NEXT_PUBLIC_` apposta — Next.js non la include mai nel bundle del client.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function isSupabaseAdminConfigured(): boolean {
  return (
    (process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '') !== '' &&
    (process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '') !== ''
  )
}

/** `null` se mancano le variabili: il chiamante deve rispondere con uno stato esplicito, non un crash. */
export function getAdminClient(): SupabaseClient | null {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (url === undefined || url === '' || serviceKey === undefined || serviceKey === '') {
    return null
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
