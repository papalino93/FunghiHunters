import { NextResponse } from 'next/server'

import { SlidingWindowLimiter, clientKey } from '@/lib/rate/limiter'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * Controllo di salute del database: `/api/salute`.
 *
 * Supabase, sul piano gratuito, mette in pausa i progetti che restano una settimana senza
 * attività sul database: con poche persone che sincronizzano il diario, fuori stagione succede.
 * In pausa, l'accesso, il diario sincronizzato e il pannello smettono di funzionare finché
 * qualcuno non lo riattiva a mano dalla dashboard. Il flusso `.github/workflows/salute.yml`
 * chiama questo indirizzo una volta al giorno: è anche un controllo vero, perché se il database
 * non risponde la corsa diventa rossa e arriva l'avviso di GitHub.
 *
 * La richiesta è la più piccola possibile: un conteggio senza righe (`head: true`) su
 * `app_admins`, con la service role, lato server. Non restituisce nessun dato, nemmeno il numero:
 * solo «raggiungibile» o no. Limite di frequenza perché nessuno la usi per far lavorare il
 * database a nostro nome.
 */
export const dynamic = 'force-dynamic'

const limiter = new SlidingWindowLimiter(10, 60_000)
const NO_STORE = { 'Cache-Control': 'no-store' } as const

export async function GET(request: Request): Promise<NextResponse> {
  if (!limiter.allow(clientKey(request))) {
    return NextResponse.json({ ok: false, error: 'Troppe richieste' }, { status: 429, headers: NO_STORE })
  }
  const admin = getAdminClient()
  if (admin === null) {
    return NextResponse.json({ ok: false, database: 'non configurato' }, { status: 503, headers: NO_STORE })
  }
  const { error } = await admin.from('app_admins').select('user_id', { count: 'exact', head: true })
  if (error !== null) {
    console.error('[api/salute] database non raggiungibile:', error.message)
    return NextResponse.json({ ok: false, database: 'non raggiungibile' }, { status: 503, headers: NO_STORE })
  }
  return NextResponse.json(
    { ok: true, database: 'raggiungibile', at: new Date().toISOString() },
    { headers: NO_STORE },
  )
}
