/**
 * «Sono l'amministratore?» — la sola cosa che la pagina Account deve sapere per mostrare il
 * collegamento al pannello.
 *
 * Il browser non può chiederlo da sé: `app_admins` gli è irraggiungibile di proposito (RLS senza
 * policy, nessun grant). Questa rotta risponde con la stessa guardia del pannello: 200 al titolare,
 * e a chiunque altro lo stesso 404 di una rotta inesistente — chi non è amministratore non scopre
 * nemmeno che esiste un pannello.
 *
 * Non scrive nel registro degli accessi: non legge i dati di nessun utente, dice solo se chi
 * chiede è in `app_admins`. Il registro è per le letture del diario, e resta tale.
 */

import { NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/admin/guard'
import { NO_STORE, adminNotFound } from '@/lib/admin/responses'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<NextResponse> {
  const check = await requireAdmin(request)
  if (!check.ok) return adminNotFound()
  return NextResponse.json({ admin: true }, { headers: NO_STORE })
}
