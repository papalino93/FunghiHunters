import { TodayScreen } from '@/components/today/TodayScreen'
import { requestedRegion } from '@/lib/region/request'
import { pageMetadata } from '@/lib/seo/metadata'
import { loadReferenceRegion } from '@/lib/snapshot/load-reference'
import { toListSnapshot } from '@/lib/snapshot/list-view'

// Canonical e `og:url` anche per la home, che non ha un titolo proprio: si chiama FungiCast e basta.
const base = pageMetadata({
  // Le parole con cui si cerca («porcini oggi», «dove cercare»), non solo il nome dell'app: con
  // il solo «FungiCast» la home non rispondeva a nessuna ricerca di chi non la conosce già.
  title: 'Porcini oggi: dove e quando cercarli',
  description:
    'Ogni giorno, zona per zona in tutta Italia: quanto pioggia, acqua nel terreno, temperatura e ' +
    'bosco favoriscono il porcino. Con il metodo pubblico e le fonti. Non indica la presenza di funghi.',
  path: '/',
})

// La home sta nello stesso segmento del layout, e lì il `title.template` non si applica: il nome
// dell'app va aggiunto a mano, come fa il template per tutte le altre pagine.
export const metadata = { ...base, title: { absolute: 'Porcini oggi: dove e quando cercarli · FungiCast' } }

/**
 * La home è la schermata della decisione, non la mappa.
 *
 * La mappa è uno strumento di esplorazione, e va benissimo — ma aprendo l'app la domanda è
 * "dove vado", non "fammi vedere la Toscana". Chi vuole la mappa la trova nella barra in basso.
 *
 * Quale regione si apre lo decide la preferenza dell'utente (`lib/region/preference.ts`), letta
 * dal cookie. Leggere un cookie rende la pagina dinamica, quindi niente `revalidate`: il costo è
 * una lettura di file per visita, e il guadagno è che chi sta in Trentino non apre più la
 * Toscana. Senza cookie vale la regione dell'indirizzo IP (`lib/region/request.ts`), e senza
 * nemmeno quella la Toscana con le sue sette zone di taratura.
 */
export default async function Page() {
  const region = await loadReferenceRegion(await requestedRegion())

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
