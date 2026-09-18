/**
 * Cancellazione account: unica rotta del progetto che usa la service role key.
 *
 * Cancellare l'utente da `auth.users` richiede un privilegio che la anon key, vincolata da RLS,
 * non ha — per questo esiste una rotta server e non un semplice `supabase.auth.admin.*` chiamato
 * dal browser, cosa che esporrebbe quella chiave a chiunque apra la console del browser.
 *
 * Il token dell'utente arriva nell'header `Authorization`, verificato qui prima di cancellare
 * qualunque cosa: senza quella verifica chiunque potrebbe cancellare l'account di chiunque altro
 * passando un id a caso.
 */

import { NextResponse } from 'next/server'

import { getAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase/admin'

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: 'Cancellazione account non disponibile: variabili di servizio non configurate.' },
      { status: 503 },
    )
  }

  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null
  if (token === null) {
    return NextResponse.json({ error: 'Sessione mancante.' }, { status: 401 })
  }

  const admin = getAdminClient()
  if (admin === null) {
    return NextResponse.json({ error: 'Servizio non disponibile.' }, { status: 503 })
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError !== null || userData.user === null) {
    return NextResponse.json({ error: 'Sessione non valida o scaduta.' }, { status: 401 })
  }
  const userId = userData.user.id

  // Le tabelle utente, in ordine: non ci sono foreign key fra loro che impongano un ordine
  // particolare, ma cancellare prima i dati e poi l'account evita di lasciare righe orfane se
  // uno dei passaggi fallisce a metà.
  for (const table of ['alerts', 'user_observations', 'user_locations'] as const) {
    const { error } = await admin.from(table).delete().eq('user_id', userId)
    if (error !== null) {
      return NextResponse.json(
        { error: `Cancellazione dati (${table}) fallita: ${error.message}` },
        { status: 500 },
      )
    }
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId)
  if (deleteUserError !== null) {
    return NextResponse.json(
      { error: `Dati cancellati, ma l'account non è stato rimosso: ${deleteUserError.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
