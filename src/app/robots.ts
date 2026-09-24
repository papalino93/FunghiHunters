import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/seo/metadata'

/**
 * Cosa possono leggere i crawler.
 *
 * Tutto tranne le API: `/api` risponde JSON che nessuno deve trovare in un risultato di ricerca,
 * e ogni visita di un crawler lì è una chiamata a Open-Meteo o Nominatim sprecata.
 *
 * `/account` e `/diario` **non** stanno qui, apposta: le tiene fuori dall'indice il loro `noindex`,
 * e un crawler il `noindex` lo vede solo se può scaricare la pagina. Bloccate anche qui, e linkate
 * dalla barra in basso di ogni pagina, finivano fra i risultati come indirizzi nudi («indicizzata,
 * ma bloccata da robots.txt») — l'esatto contrario di ciò che si voleva.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
