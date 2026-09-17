import { TodayScreen } from '@/components/today/TodayScreen'
import { loadSnapshot } from '@/lib/snapshot/load'

/**
 * La home è la schermata della decisione, non la mappa.
 *
 * La mappa è uno strumento di esplorazione, e va benissimo — ma aprendo l'app la domanda è
 * "dove vado", non "fammi vedere la Toscana". Chi vuole la mappa la trova nella barra in basso.
 */
export const revalidate = 3600

export default async function Page() {
  return <TodayScreen snapshot={await loadSnapshot()} />
}
