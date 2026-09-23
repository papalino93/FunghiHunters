import type { Metadata } from 'next'
import { cookies } from 'next/headers'

import { AccountScreen } from '@/components/account/AccountScreen'
import { REGION_COOKIE, resolveRegionSlug } from '@/lib/region/preference'
import { loadSnapshot } from '@/lib/snapshot/load'
import { regionChoices } from '@/lib/snapshot/load-reference'

/*
 * Fuori dall'indice dei motori di ricerca: è una pagina personale, senza niente da trovare per chi
 * non ha già un account. Anche esclusa da `sitemap.ts`, e da `robots.ts` per chi la rispetta.
 */
export const metadata: Metadata = { title: 'Account', robots: { index: false, follow: false } }

/** Legge il cookie della regione, quindi è dinamica: niente `revalidate`. */
export default async function AccountPage() {
  const [snapshot, choices, cookieStore] = await Promise.all([
    loadSnapshot(),
    regionChoices(),
    cookies(),
  ])
  return (
    <AccountScreen
      algorithmVersion={snapshot.algorithmVersion}
      regionSlug={resolveRegionSlug(cookieStore.get(REGION_COOKIE)?.value, choices)}
      regionChoices={choices}
    />
  )
}
