import { Suspense } from 'react'
import { cookies } from 'next/headers'

import { AppShell } from '@/components/AppShell'
import { REGION_COOKIE } from '@/lib/region/preference'
import { loadMapRegion } from '@/lib/snapshot/load-reference'

export const metadata = { title: 'Mappa · FungiCast' }

/**
 * La mappa di una regione.
 *
 * `?regione=` esplicito vince sul cookie: è il collegamento che arriva da una zona del catalogo,
 * e deve aprire proprio quella regione. Senza parametro vale la regione di riferimento. Vedi
 * `loadMapRegion` per perché le due strade non sono la stessa cosa in Toscana.
 *
 * Come la home, legge un cookie e quindi non è più prerenderizzabile: niente `revalidate`.
 */
export default async function MappaPage({
  searchParams,
}: {
  searchParams: Promise<{ readonly regione?: string }>
}) {
  const [{ regione }, cookieStore] = await Promise.all([searchParams, cookies()])
  const region = await loadMapRegion(regione, cookieStore.get(REGION_COOKIE)?.value)

  // `useSearchParams` sospende durante il prerender: il confine lo rende esplicito invece di
  // far diventare dinamica l'intera pagina.
  return (
    <Suspense fallback={<div className="h-full w-full bg-surface-0" />}>
      <AppShell
        snapshot={region.snapshot}
        regionName={region.name}
        regionSlug={region.slug}
        regionChoices={region.choices}
      />
    </Suspense>
  )
}
