import { cookies } from 'next/headers'

import { DiaryScreen } from '@/components/diary/DiaryScreen'
import { REGION_COOKIE } from '@/lib/region/preference'
import { loadReferenceRegion } from '@/lib/snapshot/load-reference'
import { toListSnapshot } from '@/lib/snapshot/list-view'

export const metadata = { title: 'Diario uscite · FungiCast' }

/**
 * Il diario segue la regione di riferimento come la home.
 *
 * Non è un capriccio di coerenza: le zone dello snapshot sono l'elenco fra cui si sceglie dove si
 * è stati. Finché era fisso sulla Toscana, chi sta altrove non aveva *nessuna* zona da indicare,
 * e quindi non poteva registrare un'uscita — cioè il modello non poteva imparare niente fuori
 * dalla Toscana. Per chi sta in Toscana non cambia nulla: è la regione predefinita.
 */
export default async function DiarioPage() {
  const cookieStore = await cookies()
  const region = await loadReferenceRegion(cookieStore.get(REGION_COOKIE)?.value)
  return <DiaryScreen snapshot={toListSnapshot(region.snapshot)} />
}
