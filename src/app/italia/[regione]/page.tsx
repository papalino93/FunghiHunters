import Link from 'next/link'
import { notFound } from 'next/navigation'

import { TodayScreen } from '@/components/today/TodayScreen'
import { loadItaliaIndex, loadRegion } from '@/lib/snapshot/load-italia'

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
      <TodayScreen
        snapshot={snapshot}
        region={{ slug: regione, name, catalogue: true }}
      />
    </div>
  )
}
