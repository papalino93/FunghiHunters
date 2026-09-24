/**
 * Avvisa IndexNow che le pagine della sitemap sono cambiate. Lo lancia lo snapshot giornaliero
 * dopo aver pubblicato i dati nuovi; a mano: `npx tsx scripts/indexnow.ts`.
 *
 * Non fa mai fallire chi lo chiama per un motivo esterno: IndexNow è una cortesia verso i motori
 * di ricerca, non una parte del calcolo.
 */

import { INDEXNOW_ENDPOINT, indexNowPayload, sitemapUrls } from '../src/lib/seo/indexnow'
import { SITE_URL } from '../src/lib/seo/metadata'

async function main(): Promise<void> {
  const sitemap = await fetch(`${SITE_URL}/sitemap.xml`)
  if (!sitemap.ok) {
    console.warn(`Sitemap non leggibile (HTTP ${String(sitemap.status)}): niente da avvisare.`)
    return
  }
  const urls = sitemapUrls(await sitemap.text(), SITE_URL)
  if (urls.length === 0) {
    console.warn('Sitemap vuota: niente da avvisare.')
    return
  }
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(indexNowPayload(SITE_URL, urls)),
  })
  // 200 e 202 vanno bene entrambi: 202 vuol dire che la chiave è ancora in verifica.
  const note = response.ok ? 'ricevuto' : 'rifiutato'
  console.log(`IndexNow: ${String(urls.length)} indirizzi, HTTP ${String(response.status)} (${note}).`)
}

main().catch((error: unknown) => {
  console.warn('IndexNow non raggiunto:', error)
})
