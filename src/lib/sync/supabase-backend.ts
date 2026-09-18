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

import type { Abundance, DiaryEntry, PrivacyLevel, TreeSpecies } from '@/lib/diary/types'
import { ABUNDANCE_LEVELS, PRIVACY_LEVELS, TREE_SPECIES } from '@/lib/diary/types'
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
  position_source: string | null
  tree_species: string[] | null
  duration_minutes: number | null
  searchers: number | null
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

function isPositionSource(value: string | null): value is 'gps' | 'zone' {
  return value === 'gps' || value === 'zone'
}

function toTreeSpecies(values: readonly string[] | null): TreeSpecies[] {
  const known = new Set<string>(TREE_SPECIES)
  return (values ?? []).filter((v): v is TreeSpecies => known.has(v))
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
    positionSource: isPositionSource(row.position_source) ? row.position_source : null,
    trees: toTreeSpecies(row.tree_species),
    durationMinutes: row.duration_minutes,
    searchers: row.searchers,
    mpiAtEntry: row.mpi_at_observation,
    confidenceAtEntry: row.confidence_at_observation,
    algorithmVersionAtEntry: row.algorithm_version_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

/**
 * Colonne aggiunte da `0006_diary_context.sql`, isolate perché sono le uniche che un progetto
 * Supabase aggiornato a metà può non avere — vedi `pushRows` più sotto per cosa succede allora.
 */
const CONTEXT_COLUMNS = ['duration_minutes', 'searchers'] as const

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
    position_source: entry.positionSource,
    tree_species: entry.trees,
    duration_minutes: entry.durationMinutes,
    searchers: entry.searchers,
    mpi_at_observation: entry.mpiAtEntry,
    confidence_at_observation: entry.confidenceAtEntry,
    algorithm_version_text: entry.algorithmVersionAtEntry,
    updated_at: entry.updatedAt,
    deleted_at: entry.deletedAt,
  }
}

/**
 * Un progetto aggiornato a metà non deve perdere *tutto* il diario per due campi facoltativi.
 *
 * Se `0006_diary_context.sql` non è stata applicata, PostgREST rifiuta l'intero upsert perché non
 * conosce `duration_minutes`/`searchers` (codice `PGRST204`): senza questa rete, il risultato
 * sarebbe che la sincronizzazione si ferma del tutto — non che quei due campi restano indietro.
 * Qui si riprova una volta sola senza le colonne mancanti, e da quel momento in poi si smette di
 * inviarle: il resto del diario continua a sincronizzarsi, i due campi restano sul dispositivo
 * finché la migrazione non viene applicata. Degradare in modo dichiarato, non sparire in silenzio.
 */
function isMissingColumnError(error: { code?: string; message?: string }): boolean {
  if (error.code === 'PGRST204') return true
  const message = error.message ?? ''
  return CONTEXT_COLUMNS.some((column) => message.includes(column)) && /column|colonna/i.test(message)
}

function withoutContextColumns(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row }
  for (const column of CONTEXT_COLUMNS) delete copy[column]
  return copy
}

export function createSupabaseSyncBackend(client: SupabaseClient, userId: string): SyncBackend {
  /** Diventa `true` al primo rifiuto per colonna mancante: dopo, non si riprova più a ogni giro. */
  let contextColumnsMissing = false

  return {
    async pull(sinceIso) {
      let query = client.from(TABLE).select('*').eq('user_id', userId)
      if (sinceIso !== null) query = query.gt('updated_at', sinceIso)
      const { data, error } = await query
      if (error !== null) throw new Error(`Lettura fallita: ${error.message}`)
      return (data as Row[] | null)?.map(rowToEntry) ?? []
    },

    async push(entries) {
      const full = entries.map((entry) => entryToRow(entry, userId))
      const rows = contextColumnsMissing ? full.map(withoutContextColumns) : full

      const { error } = await client.from(TABLE).upsert(rows, { onConflict: 'user_id,client_id' })
      if (error === null) return

      if (!contextColumnsMissing && isMissingColumnError(error)) {
        contextColumnsMissing = true
        const { error: retryError } = await client
          .from(TABLE)
          .upsert(full.map(withoutContextColumns), { onConflict: 'user_id,client_id' })
        if (retryError === null) return
        throw new Error(`Scrittura fallita: ${retryError.message}`)
      }

      throw new Error(`Scrittura fallita: ${error.message}`)
    },
  }
}
