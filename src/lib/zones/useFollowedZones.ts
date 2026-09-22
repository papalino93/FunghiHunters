'use client'

/**
 * Le zone che seguo, pronte per un componente React: repository, lista viva, e un `toggle` che
 * segue/non segue e prova a sincronizzare subito se c'è un account — stessa sequenza di
 * `persistAndReload` in `DiaryScreen.tsx` (ricarica locale, poi sincronizza se collegato, poi
 * ricarica di nuovo per mostrare l'esito).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useAuth } from '@/lib/auth/context'
import { useIsHydrated } from '@/lib/ui/useIsHydrated'
import { createFollowedZoneRepository, type FollowedZoneRepository } from '@/lib/zones/store'
import type { FollowedZone, FollowedZoneDraft } from '@/lib/zones/types'
import { useFollowedZonesSync, type FollowedZonesSyncState } from '@/lib/zones/useFollowedZonesSync'

export interface FollowedZonesState {
  /** `null` finché non è stata fatta la prima lettura (idratazione, apertura dell'archivio). */
  readonly zones: readonly FollowedZone[] | null
  readonly codes: ReadonlySet<string>
  isFollowed(zoneCode: string): boolean
  toggle(zone: FollowedZoneDraft): Promise<void>
  readonly sync: FollowedZonesSyncState
}

export function useFollowedZones(): FollowedZonesState {
  const hydrated = useIsHydrated()
  const auth = useAuth()
  const created = useMemo(
    () => (hydrated ? createFollowedZoneRepository() : null),
    [hydrated],
  )
  const repo: FollowedZoneRepository | null = created?.repo ?? null
  const sync = useFollowedZonesSync(repo)
  const [zones, setZones] = useState<FollowedZone[] | null>(null)

  const reload = useCallback(async () => {
    if (repo === null) return
    setZones(await repo.list())
  }, [repo])

  useEffect(() => {
    if (repo === null) return
    let cancelled = false
    void repo
      .list()
      .then((all) => { if (!cancelled) setZones(all) })
      .catch(() => { if (!cancelled) setZones([]) })
    return () => { cancelled = true }
  }, [repo])

  const toggle = useCallback(
    async (zone: FollowedZoneDraft): Promise<void> => {
      if (repo === null) return
      const already = await repo.isFollowed(zone.zoneCode)
      if (already) await repo.unfollow(zone.zoneCode)
      else await repo.follow(zone)
      await reload()
      if (auth.status === 'signed-in') {
        await sync.sync()
        await reload()
      }
    },
    [repo, reload, auth.status, sync],
  )

  const codes = useMemo(() => new Set((zones ?? []).map((z) => z.zoneCode)), [zones])

  return {
    zones,
    codes,
    isFollowed: (zoneCode: string) => codes.has(zoneCode),
    toggle,
    sync,
  }
}
