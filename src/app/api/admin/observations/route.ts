/**
 * Dati del pannello amministratore: tutte le uscite, di tutti.
 *
 * E' l'unica rotta del progetto che legge dati di utenti diversi da chi chiama, e per questo e'
 * anche l'unica con tre difese in fila:
 *
 * 1. `requireAdmin` verifica il token con Supabase, poi cerca l'utente in `app_admins`.
 * 2. Qualunque esito negativo risponde **404**, identico a una rotta inesistente: chi non e'
 *    l'amministratore non scopre nemmeno che questo indirizzo esiste.
 * 3. Ogni lettura scrive prima una riga in `admin_access_log`, e se non ci riesce non restituisce
 *    niente. Non e' un dettaglio burocratico: e' cio' che rende vera la frase dell'informativa,
 *    cioe' che ogni accesso del titolare lascia traccia.
 *
 * `force-dynamic` perche' la risposta dipende dall'header `Authorization`: una versione di questa
 * pagina messa in cache sarebbe una copia dei dati di tutti servita a chi capita.
 */

import { NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/admin/guard'
import { NO_STORE, adminNotFound } from '@/lib/admin/responses'
import { computeStats, type StatRow } from '@/lib/admin/stats'
import { getAdminClient } from '@/lib/supabase/admin'
import { isAbundance } from '@/lib/diary/types'

export const dynamic = 'force-dynamic'


/** Massimo di righe per richiesta: un diario che cresce non deve far esplodere la pagina. */
const MAX_ROWS = 2000

interface ObservationRow {
  user_id: string
  client_id: string
  observed_at: string
  zone_code: string | null
  zone_name: string | null
  abundance: string | null
  elevation_m: number | null
  notes: string | null
  duration_minutes: number | null | undefined
  searchers: number | null | undefined
  mpi_at_observation: number | null
  confidence_at_observation: number | null
  algorithm_version_text: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export async function GET(request: Request): Promise<NextResponse> {
  const check = await requireAdmin(request)
  if (!check.ok) return adminNotFound()

  const admin = getAdminClient()
  if (admin === null) return adminNotFound()

  const { data, error } = await admin
    .from('user_observations')
    .select('*')
    .is('deleted_at', null)
    .order('observed_at', { ascending: false })
    .limit(MAX_ROWS)

  if (error !== null) {
    return NextResponse.json(
      { error: `Lettura fallita: ${error.message}` },
      { status: 500, headers: NO_STORE },
    )
  }

  const rows = (data ?? []) as ObservationRow[]

  /*
   * Niente registro, niente dati.
   *
   * L'informativa (`/privacy`) dice che ogni lettura del titolare resta registrata. Quella frase è
   * vera solo se il registro è una condizione della lettura, non un suo effetto collaterale: se
   * la scrittura fallisce e i dati partono lo stesso, basta una migrazione dimenticata — `0009`
   * non applicata — perché l'informativa diventi falsa senza che nessuno se ne accorga. Qui un
   * registro che non si scrive ferma la risposta, con un messaggio che dice come rimediare.
   *
   * Il registro si scrive *prima* di restituire: scritto dopo, non coprirebbe il caso in cui la
   * risposta parte e il processo muore a metà.
   */
  const { error: logError } = await admin.from('admin_access_log').insert({
    admin_user_id: check.adminUserId,
    action: 'observations.list',
    rows_returned: rows.length,
    user_agent: request.headers.get('user-agent'),
    // Vercel mette l'ip reale qui: `request.ip` non esiste nelle route handler.
    ip_address: request.headers.get('x-forwarded-for'),
  })
  if (logError !== null) {
    console.error('[admin] registro accessi non scritto, lettura negata:', logError.message)
    return NextResponse.json(
      {
        error:
          'Registro degli accessi non disponibile: la lettura è stata negata. ' +
          'Esegui db/migrations/0009_admin_access_log.sql nell\'SQL Editor di Supabase.',
      },
      { status: 503, headers: NO_STORE },
    )
  }

  const statRows: StatRow[] = rows.map((r) => ({
    userId: r.user_id,
    date: r.observed_at,
    zoneCode: r.zone_code ?? '',
    // Stessa guardia del diario: un valore fuori elenco diventa `NaN` in tutta la calibrazione.
    abundance: isAbundance(r.abundance) ? r.abundance : 'none',
    mpiAtEntry: r.mpi_at_observation,
  }))

  return NextResponse.json({
    stats: computeStats(statRows),
    truncated: rows.length === MAX_ROWS,
    observations: rows.map((r) => ({
      userId: r.user_id,
      id: r.client_id,
      date: r.observed_at,
      zoneCode: r.zone_code,
      zoneName: r.zone_name,
      abundance: r.abundance,
      elevationM: r.elevation_m,
      notes: r.notes,
      durationMinutes: r.duration_minutes ?? null,
      searchers: r.searchers ?? null,
      mpiAtEntry: r.mpi_at_observation,
      confidenceAtEntry: r.confidence_at_observation,
      algorithmVersion: r.algorithm_version_text,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  }, { headers: NO_STORE })
}
