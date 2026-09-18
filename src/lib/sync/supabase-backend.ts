/**
 * Adapter fra `user_observations` (Supabase/Postgres, vedi `db/migrations/0001_init.sql` e
 * `0002_sync.sql`) e `SyncBackend`.
 *
 * Non ha test automatici: richiederebbe un progetto Supabase vero o un mock del client Postgres
 * al livello sbagliato per essere utile. La logica che vale la pena testare — il merge, il
 * conflitto, i tombstone — sta in `engine.ts` ed è testata lì contro un `SyncBackend` finto.
 * Questo file va verificato manualmente una volta collegato un progetto reale (vedi
 * `docs/SYNC.md`).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Abundance, DiaryEntry, PrivacyLevel } from '@/lib/diary/types'
import { ABUNDANCE_LEVELS, PRIVACY_LEVELS } from '@/lib/diary/types'
import type { SyncBackend } from '@/lib/sync/types'

const TABLE = 'user_observations'

interface Row {
  client_id: string
  observed_at: string
  zone_code: string | null
  zone_name: string | null
  abundance: string | null
  elevation_m: number | null
  notes: string | null
  geom_exact: string | null
  geom_public: string | null
  privacy_level_app: string | null
  mpi_at_observation: number | null
  confidence_at_observation: number | null
  algorithm_version_text: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function parsePoint(wkt: string | null): { lat: number; lon: number } | null {
  // Formato EWKT che scriviamo noi stessi: 'SRID=4326;POINT(lon lat)'. Non un parser generico.
  const match = /POINT\(([-0-9.]+) ([-0-9.]+)\)/.exec(wkt ?? '')
  if (match?.[1] === undefined || match[2] === undefined) return null
  return { lon: Number(match[1]), lat: Number(match[2]) }
}

function toPoint(lat: number, lon: number): string {
  return `SRID=4326;POINT(${lon} ${lat})`
}

function isAbundance(value: string | null): value is Abundance {
  return value !== null && (ABUNDANCE_LEVELS as readonly string[]).includes(value)
}

function isPrivacyLevel(value: string | null): value is PrivacyLevel {
  return value !== null && (PRIVACY_LEVELS as readonly string[]).includes(value)
}

function rowToEntry(row: Row): DiaryEntry {
  // Preferiamo le coordinate esatte se il client le ha sincronizzate (privacy 'exact'), altrimenti
  // quelle pubbliche già sfocate: è la stessa precedenza con cui sono state scritte.
  const point = parsePoint(row.geom_exact) ?? parsePoint(row.geom_public)
  return {
    id: row.client_id,
    date: row.observed_at,
    zoneCode: row.zone_code ?? '',
    zoneName: row.zone_name ?? row.zone_code ?? '',
    abundance: isAbundance(row.abundance) ? row.abundance : 'none',
    elevationM: row.elevation_m,
    notes: row.notes ?? '',
    latitude: point?.lat ?? null,
    longitude: point?.lon ?? null,
    privacy: isPrivacyLevel(row.privacy_level_app) ? row.privacy_level_app : 'area',
    mpiAtEntry: row.mpi_at_observation,
    confidenceAtEntry: row.confidence_at_observation,
    algorithmVersionAtEntry: row.algorithm_version_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

function entryToRow(entry: DiaryEntry, userId: string): Record<string, unknown> {
  const hasCoords = entry.latitude !== null && entry.longitude !== null
  return {
    user_id: userId,
    client_id: entry.id,
    observed_at: entry.date,
    zone_code: entry.zoneCode,
    zone_name: entry.zoneName,
    abundance: entry.abundance,
    elevation_m: entry.elevationM,
    notes: entry.notes,
    // Le coordinate esatte finiscono in `geom_exact` solo se l'utente ha scelto quel livello di
    // riservatezza: è il consenso separato richiesto per salvare una posizione precisa nel cloud.
    geom_exact: hasCoords && entry.privacy === 'exact' ? toPoint(entry.latitude!, entry.longitude!) : null,
    geom_public: hasCoords ? toPoint(entry.latitude!, entry.longitude!) : null,
    privacy_level_app: entry.privacy,
    mpi_at_observation: entry.mpiAtEntry,
    confidence_at_observation: entry.confidenceAtEntry,
    algorithm_version_text: entry.algorithmVersionAtEntry,
    updated_at: entry.updatedAt,
    deleted_at: entry.deletedAt,
  }
}

export function createSupabaseSyncBackend(client: SupabaseClient, userId: string): SyncBackend {
  return {
    async pull(sinceIso) {
      let query = client.from(TABLE).select('*').eq('user_id', userId)
      if (sinceIso !== null) query = query.gt('updated_at', sinceIso)
      const { data, error } = await query
      if (error !== null) throw new Error(`Lettura fallita: ${error.message}`)
      return (data as Row[] | null)?.map(rowToEntry) ?? []
    },

    async push(entries) {
      const rows = entries.map((entry) => entryToRow(entry, userId))
      const { error } = await client.from(TABLE).upsert(rows, { onConflict: 'user_id,client_id' })
      if (error !== null) throw new Error(`Scrittura fallita: ${error.message}`)
    },
  }
}
