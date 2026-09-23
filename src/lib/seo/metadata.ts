/**
 * Metadati condivisi fra le pagine: indirizzo del sito, descrizione, anteprime social.
 *
 * Stanno qui e non nel layout perché Next fonde i metadati dei segmenti in modo **superficiale**:
 * una pagina che dichiara il proprio `openGraph` sostituisce per intero quello del layout, e con
 * lui `siteName`, `locale` e `type`. Senza un punto unico da cui ripartire, ogni pagina dovrebbe
 * ricordarsi di ricopiarli — e la prima che se ne dimentica condivide un'anteprima monca.
 */

import type { Metadata } from 'next'

/**
 * L'indirizzo pubblico, da cui si risolvono canonical, `og:url`, `og:image` e sitemap.
 *
 * Su Vercel `VERCEL_PROJECT_PRODUCTION_URL` è già il dominio giusto; `NEXT_PUBLIC_SITE_URL` resta
 * il modo per fissarlo a mano su un altro host. Fuori da entrambi si ricade sulla produzione e non
 * su `localhost`: un canonical o una sitemap che puntano a `localhost` sono peggio di nessuno,
 * mentre una build locale che rimanda al sito vero non fa danni.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL !== undefined &&
  process.env.VERCEL_PROJECT_PRODUCTION_URL !== ''
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://funghihunters.vercel.app')

export const SITE_NAME = 'FungiCast'

/**
 * Lo aggiunge il `title.template` del layout al `<title>`; qui serve per `og:title` e
 * `twitter:title`, che quel template non tocca.
 */
export const TITLE_SUFFIX = ' · FungiCast'

export const DEFAULT_DESCRIPTION =
  'Compatibilità delle condizioni ambientali con la possibile fruttificazione del porcino ' +
  'in Italia. Non indica la presenza di funghi.'

/** I campi di `openGraph` che ogni pagina deve conservare anche quando riscrive il resto. */
export const BASE_OPEN_GRAPH = {
  siteName: SITE_NAME,
  locale: 'it_IT',
  type: 'website',
} as const

/*
 * Le anteprime generate da `app/opengraph-image.tsx` e `app/twitter-image.tsx`.
 *
 * Next le collega da solo solo finché una pagina non dichiara il proprio `openGraph`/`twitter`:
 * da lì in poi la fusione superficiale le perde, e il link condiviso arriva senza immagine
 * (verificato sull'HTML di `/italia` e `/meteo`). Quindi si ridichiarano qui, con lo stesso
 * indirizzo che quei file servono.
 */
const OG_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, type: 'image/png' } as const
const TWITTER_IMAGE = { url: '/twitter-image', width: 1200, height: 630, type: 'image/png' } as const

interface PageMetadataInput {
  /**
   * Il titolo della pagina, senza " · FungiCast": lo aggiunge il template del layout.
   * `undefined` per la home, che si chiama semplicemente FungiCast.
   */
  readonly title?: string
  readonly description?: string
  /** Percorso relativo (`/italia/piemonte`): `metadataBase` lo rende assoluto. */
  readonly path: string
}

/**
 * Titolo, descrizione, canonical e anteprima social di una pagina, coerenti fra loro.
 *
 * Il canonical è per pagina e non nel layout di proposito: dichiarato nel layout verrebbe
 * ereditato da ogni pagina che non lo ridefinisce, e direbbe a un motore di ricerca che `/meteo`
 * è un doppione della home.
 */
export function pageMetadata({ title, description, path }: PageMetadataInput): Metadata {
  const fullTitle = title === undefined ? SITE_NAME : `${title}${TITLE_SUFFIX}`
  const desc = description ?? DEFAULT_DESCRIPTION
  return {
    title: title === undefined ? { absolute: SITE_NAME } : title,
    description: desc,
    alternates: { canonical: path },
    openGraph: {
      ...BASE_OPEN_GRAPH,
      title: fullTitle,
      description: desc,
      url: path,
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: desc,
      images: [TWITTER_IMAGE],
    },
  }
}
