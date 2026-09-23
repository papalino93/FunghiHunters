import { cookies } from 'next/headers'

import { TodayScreen } from '@/components/today/TodayScreen'
import { REGION_COOKIE } from '@/lib/region/preference'
import { pageMetadata } from '@/lib/seo/metadata'
import { loadReferenceRegion } from '@/lib/snapshot/load-reference'
import { toListSnapshot } from '@/lib/snapshot/list-view'

// Canonical e `og:url` anche per la home, che non ha un titolo proprio: si chiama FungiCast e basta.
export const metadata = pageMetadata({ path: '/' })

/**
 * La home è la schermata della decisione, non la mappa.
 *
 * La mappa è uno strumento di esplorazione, e va benissimo — ma aprendo l'app la domanda è
 * "dove vado", non "fammi vedere la Toscana". Chi vuole la mappa la trova nella barra in basso.
 *
 * Quale regione si apre lo decide la preferenza dell'utente (`lib/region/preference.ts`), letta
 * dal cookie. Leggere un cookie rende la pagina dinamica, quindi niente `revalidate`: il costo è
 * una lettura di file per visita, e il guadagno è che chi sta in Trentino non apre più la
 * Toscana. Senza cookie si ricade sulla Toscana e sulle sue sette zone di taratura, cioè
 * esattamente ciò che questa pagina ha sempre mostrato.
 */
export default async function Page() {
  const cookieStore = await cookies()
  const region = await loadReferenceRegion(cookieStore.get(REGION_COOKIE)?.value)

  return (
    <TodayScreen
      snapshot={toListSnapshot(region.snapshot)}
      region={{
        slug: region.slug,
        name: region.name,
        catalogue: !region.isTuscanyCalibration,
        choices: region.choices,
      }}
    />
  )
}
