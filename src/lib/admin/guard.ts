/**
 * Guardia dell'accesso amministratore. **Solo server.**
 *
 * Questo file non deve mai finire in un bundle del browser: importa `@/lib/supabase/admin`, che
 * regge la service role key. Stessa convenzione di quel modulo - importabile solo da
 * `src/app/api/**\/route.ts`, mai da un componente `'use client'`. Ne' `SUPABASE_SERVICE_ROLE_KEY`
 * ne' `ADMIN_USER_ID` hanno il prefisso `NEXT_PUBLIC_`, apposta: anche se questo modulo finisse per
 * errore nel bundle del client, entrambe sarebbero `undefined` li' dentro e `isAdminConfigured()`
 * negherebbe tutto, invece di lasciar trapelare un segreto.
 *
 * ## Perche' un id e non un'email
 *
 * `ADMIN_USER_ID` e' l'uuid di `auth.users`. Un confronto sull'email sarebbe piu' leggibile e
 * peggiore: l'email di un account Supabase si puo' cambiare, e con Google basta che cambi
 * l'indirizzo dell'account collegato. L'uuid e' l'unica cosa che identifica quella persona per
 * sempre.
 *
 * ## Perche' 404 e non 403
 *
 * Un 403 dice "questa rotta esiste, ma tu non sei l'amministratore", ed e' un'informazione
 * gratuita per chi sta cercando la superficie d'attacco di un sito. Un 404 non dice niente: per
 * chiunque non sia l'amministratore, `/api/admin/*` semplicemente non esiste. Non e' sicurezza
 * per oscurita' - il controllo vero e' il confronto sull'uuid, e regge anche se la rotta e' nota -
 * e' non regalare la mappa.
 *
 * ## Senza `ADMIN_USER_ID`
 *
 * La funzione nega tutto. Una variabile mancante non deve mai voler dire "passa pure": e' il
 * caso di un deploy nuovo, di una variabile scritta male, di un'anteprima senza segreti, e in
 * tutti e tre lo stato sicuro e' "chiuso".
 */

import { getAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase/admin'

export type AdminCheck =
  | { readonly ok: true; readonly adminUserId: string }
  /** `reason` serve ai log del server, mai al corpo della risposta: vedi il commento sul 404. */
  | { readonly ok: false; readonly reason: 'not-configured' | 'no-token' | 'bad-token' | 'not-admin' }

/** Il progetto ha sia la service role key sia l'id dell'amministratore. */
export function isAdminConfigured(): boolean {
  return isSupabaseAdminConfigured() && (process.env['ADMIN_USER_ID'] ?? '') !== ''
}

/** Estrae il token da `Authorization: Bearer ...`, `null` se manca o e' di un altro schema. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token === '' ? null : token
}

/**
 * Verifica che la richiesta arrivi dall'amministratore.
 *
 * Il token viene validato da Supabase, non decodificato qui: un JWT si legge senza chiave, e
 * fidarsi del `sub` che contiene significherebbe far entrare chiunque sappia scrivere tre
 * stringhe in base64. `admin.auth.getUser(token)` controlla la firma e la scadenza.
 */
export async function requireAdmin(request: Request): Promise<AdminCheck> {
  if (!isAdminConfigured()) return { ok: false, reason: 'not-configured' }

  const token = bearerToken(request)
  if (token === null) return { ok: false, reason: 'no-token' }

  const admin = getAdminClient()
  if (admin === null) return { ok: false, reason: 'not-configured' }

  const { data, error } = await admin.auth.getUser(token)
  if (error !== null || data.user === null) return { ok: false, reason: 'bad-token' }

  if (data.user.id !== process.env['ADMIN_USER_ID']) return { ok: false, reason: 'not-admin' }
  return { ok: true, adminUserId: data.user.id }
}
