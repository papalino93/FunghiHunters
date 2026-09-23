import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/seo/metadata'

/**
 * Cosa possono leggere i crawler.
 *
 * Tutto tranne le pagine personali e le API: `/account` e `/diario` sono vuote per chi non è
 * l'utente (e hanno comunque `noindex` nei metadati, per i crawler che arrivano da un link),
 * `/api` risponde JSON che nessuno deve trovare in un risultato di ricerca — e ogni visita di un
 * crawler lì è una chiamata a Open-Meteo o Nominatim sprecata.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/account', '/diario', '/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
