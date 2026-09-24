import { Suspense } from 'react'

import { AppShell } from '@/components/AppShell'
import { requestedRegion } from '@/lib/region/request'
import { pageMetadata } from '@/lib/seo/metadata'
import { loadMapRegion } from '@/lib/snapshot/load-reference'

export const metadata = pageMetadata({
  title: 'Mappa dei porcini oggi',
  description:
    'Le zone di porcino sulla mappa, con il punteggio di oggi e dei prossimi giorni: pioggia, ' +
    'temperatura, stagione e bosco, zona per zona.',
  path: '/mappa',
})

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
  const [{ regione }, reference] = await Promise.all([searchParams, requestedRegion()])
  const region = await loadMapRegion(regione, reference)

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
