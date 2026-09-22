import { cookies } from 'next/headers'

import { AccountScreen } from '@/components/account/AccountScreen'
import { REGION_COOKIE, resolveRegionSlug } from '@/lib/region/preference'
import { loadSnapshot } from '@/lib/snapshot/load'
import { regionChoices } from '@/lib/snapshot/load-reference'

export const metadata = { title: 'Account · FungiCast' }

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
