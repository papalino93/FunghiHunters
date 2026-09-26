/**
 * Guardia dell'accesso amministratore. **Solo server.**
 *
 * Questo file non deve mai finire in un bundle del browser: importa `@/lib/supabase/admin`, che
 * regge la service role key. Stessa convenzione di quel modulo - importabile solo da
 * `src/app/api/**\/route.ts`, mai da un componente `'use client'`. `SUPABASE_SERVICE_ROLE_KEY`
 * non ha il prefisso `NEXT_PUBLIC_`, apposta: anche se questo modulo finisse per errore nel
 * bundle del client, la chiave sarebbe `undefined` lì dentro e la guardia negherebbe tutto,
 * invece di lasciar trapelare un segreto.
 *
 * ## Chi è l'amministratore
 *
 * Chi ha una riga in `app_admins` (migrazione `0009`). Una tabella e non una variabile
 * d'ambiente: la variabile voleva dire cercare il proprio UID su Supabase, copiarlo su Vercel e
 * rifare il deploy. La tabella si riempie con una riga di SQL, dove si eseguono già tutte le
 * migrazioni, e vale subito. La tabella è irraggiungibile dal browser: per aggiungersi bisogna
 * già avere accesso al database.
 *
 * ## Perché 404 e non 403
 *
 * Un 403 dice "questa rotta esiste, ma tu non sei l'amministratore", ed è un'informazione
 * gratuita per chi sta cercando la superficie d'attacco di un sito. Un 404 non dice niente: per
 * chiunque non sia l'amministratore, `/api/admin/*` semplicemente non esiste. Non è sicurezza
 * per oscurità - il controllo vero è la verifica del token e la riga in `app_admins`, e reggono
 * anche se la rotta è nota - è non regalare la mappa.
 *
 * ## Quando qualcosa manca
 *
 * La funzione nega tutto: senza service role key, senza la tabella (migrazione non applicata),
 * con un errore del database. Lo stato sicuro è sempre "chiuso".
 */

import { getAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase/admin'

export type AdminCheck =
  | { readonly ok: true; readonly adminUserId: string }
  /** `reason` serve ai log del server, mai al corpo della risposta: vedi il commento sul 404. */
  | { readonly ok: false; readonly reason: 'not-configured' | 'no-token' | 'bad-token' | 'not-admin' }

/** Estrae il token da `Authorization: Bearer ...`, `null` se manca o è di un altro schema. */
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
 * stringhe in base64. `admin.auth.getUser(token)` controlla la firma e la scadenza. Solo *dopo*
 * si guarda `app_admins`, con l'id che Supabase ha appena confermato.
 */
export async function requireAdmin(request: Request): Promise<AdminCheck> {
  if (!isSupabaseAdminConfigured()) return { ok: false, reason: 'not-configured' }

  const token = bearerToken(request)
  if (token === null) return { ok: false, reason: 'no-token' }

  const admin = getAdminClient()
  if (admin === null) return { ok: false, reason: 'not-configured' }

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError !== null || userData.user === null) return { ok: false, reason: 'bad-token' }
  const userId = userData.user.id

  const { data: row, error: rowError } = await admin
    .from('app_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  // Tabella assente (migrazione non applicata) o database irraggiungibile: chiuso, non aperto.
  if (rowError !== null) return { ok: false, reason: 'not-configured' }
  if (row === null) return { ok: false, reason: 'not-admin' }
  return { ok: true, adminUserId: userId }
}
