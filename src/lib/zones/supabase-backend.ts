/**
 * Adapter fra `user_followed_zones` (Supabase/Postgres, vedi `db/migrations/0007_followed_zones.sql`)
 * e `SyncBackend<FollowedZone>`.
 *
 * Stesso avvertimento del backend del diario (`src/lib/sync/supabase-backend.ts`): non ha test
 * automatici contro un progetto reale, solo contro il `SyncBackend` finto usato da `runSync()`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import type { FollowedZone } from '@/lib/zones/types'
import type { SyncBackend } from '@/lib/sync/types'

const TABLE = 'user_followed_zones'

interface Row {
  client_id: string
  zone_code: string
  zone_name: string
  region_slug: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function rowToZone(row: Row): FollowedZone {
  return {
    id: row.client_id,
    zoneCode: row.zone_code,
    zoneName: row.zone_name,
    regionSlug: row.region_slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

function zoneToRow(zone: FollowedZone, userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    client_id: zone.id,
    zone_code: zone.zoneCode,
    zone_name: zone.zoneName,
    region_slug: zone.regionSlug,
    created_at: zone.createdAt,
    updated_at: zone.updatedAt,
    deleted_at: zone.deletedAt,
  }
}

export function createFollowedZonesSyncBackend(
  client: SupabaseClient,
  userId: string,
): SyncBackend<FollowedZone> {
  return {
    async pull(sinceIso) {
      let query = client.from(TABLE).select('*').eq('user_id', userId)
      if (sinceIso !== null) query = query.gt('updated_at', sinceIso)
      const { data, error } = await query
      if (error !== null) throw new Error(`Lettura fallita: ${error.message}`)
      return (data as Row[] | null)?.map(rowToZone) ?? []
    },

    async push(entries) {
      const rows = entries.map((zone) => zoneToRow(zone, userId))
      const { error } = await client.from(TABLE).upsert(rows, { onConflict: 'user_id,client_id' })
      if (error !== null) throw new Error(`Scrittura fallita: ${error.message}`)
    },
  }
}
