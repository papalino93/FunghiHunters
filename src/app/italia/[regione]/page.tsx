import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { TodayScreen } from '@/components/today/TodayScreen'
import { pageMetadata } from '@/lib/seo/metadata'
import { loadItaliaIndex, loadRegion } from '@/lib/snapshot/load-italia'
import { toListSnapshot } from '@/lib/snapshot/list-view'

/**
 * Le zone di una regione.
 *
 * Secondo livello del menu, e volutamente **la stessa schermata della Toscana**: il file di una
 * regione ha la stessa forma dello snapshot toscano, quindi `TodayScreen` funziona tale e quale,
 * con gli stessi filtri, la stessa scheda di dettaglio e le stesse spiegazioni. Una seconda
 * interfaccia parallela avrebbe voluto dire due posti dove correggere ogni cosa, e due esperienze
 * diverse per la stessa domanda.
 */
export const revalidate = 3600

export async function generateStaticParams(): Promise<Array<{ regione: string }>> {
  const index = await loadItaliaIndex()
  return index.regions.map((region) => ({ regione: region.slug }))
}

/*
 * Le due regioni che non reggono "in": si dice "nelle Marche" e "nel Lazio". Per le altre diciotto
 * "in" è corretto, quindi basta un'eccezione per ciascuna invece di una tabella di venti voci.
 */
const PREPOSITION: Readonly<Record<string, string>> = { marche: 'nelle', lazio: 'nel' }

/**
 * Titolo e descrizione per regione.
 *
 * Prima tutte le venti pagine si chiamavano "FungiCast": nei risultati di ricerca e nelle schede
 * del browser erano indistinguibili. Il titolo usa solo la prima metà dei nomi bilingui
 * ("Trentino-Alto Adige", non "Trentino-Alto Adige/Südtirol"): è quella che si cerca, e un titolo
 * lungo viene comunque troncato. Il " · FungiCast" lo aggiunge il template del layout.
 */
export async function generateMetadata({ params }: PageProps<'/italia/[regione]'>): Promise<Metadata> {
  const { regione } = await params
  const index = await loadItaliaIndex()
  const region = index.regions.find((r) => r.slug === regione)
  if (region === undefined) return { title: 'Regione non trovata', robots: { index: false } }

  const shortName = region.name.split('/')[0] ?? region.name
  const zones = region.zoneCount === 1 ? '1 zona' : `${String(region.zoneCount)} zone`
  return pageMetadata({
    title: `Porcini ${PREPOSITION[region.slug] ?? 'in'} ${shortName} oggi`,
    description:
      `${region.name}: ${zones} con la compatibilità delle condizioni di oggi e dei prossimi ` +
      'giorni con la fruttificazione del porcino. Non indica la presenza di funghi.',
    path: `/italia/${region.slug}`,
    imageBase: `/italia/${region.slug}`,
  })
}

export default async function Page({ params }: { params: Promise<{ regione: string }> }) {
  const { regione } = await params
  const snapshot = await loadRegion(regione)
  if (snapshot === null) notFound()

  const index = await loadItaliaIndex()
  const name = index.regions.find((r) => r.slug === regione)?.name ?? regione

  return (
    <div>
      <div className="mx-auto w-full max-w-2xl px-4 pt-4">
        <Link
          href="/italia"
          className="inline-flex min-h-11 items-center text-sm text-ink-dim transition-colors
                     hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ← Tutte le regioni
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink">{name}</h1>
      </div>
      {/*
        * `catalogue: true`: queste sono le zone del catalogo nazionale, e i collegamenti verso la
        * mappa devono dirlo. Senza, la mappa aprirebbe la regione di riferimento dell'utente —
        * cioe' il difetto per cui da una zona trentina si finiva a guardare la Toscana.
        */}
      {/* `heading={false}`: il titolo della pagina è già l'`<h1>` qui sopra, ne basta uno. */}
      <TodayScreen
        snapshot={toListSnapshot(snapshot)}
        region={{ slug: regione, name, catalogue: true }}
        heading={false}
      />
    </div>
  )
}
