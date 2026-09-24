import type { Metadata } from 'next'

import { AccountScreen } from '@/components/account/AccountScreen'
import { resolveRegionSlug } from '@/lib/region/preference'
import { requestedRegion } from '@/lib/region/request'
import { loadSnapshot } from '@/lib/snapshot/load'
import { regionChoices } from '@/lib/snapshot/load-reference'

/*
 * Fuori dall'indice dei motori di ricerca: è una pagina personale, senza niente da trovare per chi
 * non ha già un account. Anche esclusa da `sitemap.ts`, e da `robots.ts` per chi la rispetta.
 */
export const metadata: Metadata = { title: 'Account', robots: { index: false, follow: false } }

/** Legge il cookie della regione, quindi è dinamica: niente `revalidate`. */
export default async function AccountPage() {
  const [snapshot, choices, reference] = await Promise.all([
    loadSnapshot(),
    regionChoices(),
    requestedRegion(),
  ])
  return (
    <AccountScreen
      algorithmVersion={snapshot.algorithmVersion}
      regionSlug={resolveRegionSlug(reference, choices)}
      regionChoices={choices}
    />
  )
}
