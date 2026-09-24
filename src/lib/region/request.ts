import { cookies, headers } from 'next/headers'

import { regionFromIp } from '@/lib/region/geo'
import { REGION_COOKIE } from '@/lib/region/preference'
import { regionChoices } from '@/lib/snapshot/load-reference'

/**
 * La regione da mostrare a questa richiesta: quella scelta (il cookie) e, se non c'è, quella
 * dell'indirizzo IP (`lib/region/geo.ts`). Il risultato passa comunque da `resolveRegionSlug`,
 * che lo riduce a una regione esistente o alla Toscana.
 */
export async function requestedRegion(): Promise<string | undefined> {
  const chosen = (await cookies()).get(REGION_COOKIE)?.value
  if (chosen !== undefined && chosen !== '') return chosen
  const h = await headers()
  const fromIp = regionFromIp(
    h.get('x-vercel-ip-country'),
    h.get('x-vercel-ip-country-region'),
    await regionChoices(),
  )
  return fromIp ?? undefined
}
