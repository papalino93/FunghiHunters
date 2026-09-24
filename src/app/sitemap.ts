import type { MetadataRoute } from 'next'

import { PICKING_RULES } from '@/lib/rules'
import { SITE_URL } from '@/lib/seo/metadata'
import { loadItaliaIndex } from '@/lib/snapshot/load-italia'

/**
 * Le pagine pubbliche, per i motori di ricerca.
 *
 * Le regioni vengono dall'indice nazionale e non da un elenco scritto qui: sono le stesse per cui
 * `italia/[regione]` genera le pagine, quindi una regione aggiunta o rinominata nel catalogo
 * entra nella sitemap senza toccare questo file. Fuori `/account`, `/diario` e `/api`: vedi
 * `robots.ts`.
 *
 * `lastModified` è la data del calcolo, non quella della build: è quando i punteggi — cioè il
 * contenuto di queste pagine — sono cambiati davvero. Ricalcolata ogni ora come le pagine.
 */
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const index = await loadItaliaIndex()
  const generated = new Date(index.generatedAt)
  // Indice mancante (data zero) o illeggibile: meglio nessuna data che una del 1970.
  const lastModified = Number.isNaN(generated.getTime()) || generated.getTime() === 0 ? undefined : generated

  const daily = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path}`,
    ...(lastModified === undefined ? {} : { lastModified }),
    changeFrequency: 'daily',
    priority,
  })

  return [
    daily('/', 1),
    daily('/mappa', 0.8),
    daily('/italia', 0.8),
    ...index.regions.map((region) => daily(`/italia/${region.slug}`, 0.7)),
    // Meteo e guida non dipendono dal calcolo del giorno: niente data, che sarebbe inventata.
    { url: `${SITE_URL}/meteo`, changeFrequency: 'daily', priority: 0.5 },
    { url: `${SITE_URL}/guida`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/metodo`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/regole`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/chi-siamo`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    ...PICKING_RULES.map((r) => ({
      url: `${SITE_URL}/regole/${r.slug}`,
      lastModified: new Date(`${r.verifiedOn}T12:00:00Z`),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ]
}
