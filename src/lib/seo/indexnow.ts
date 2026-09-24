/**
 * IndexNow: avvisare Bing (e gli altri motori che aderiscono, fra cui Yandex e Seznam) che le
 * pagine sono cambiate, invece di aspettare che ripassino da sole. È anche la strada più corta
 * verso le ricerche che usano l'indice di Bing, come Copilot e ChatGPT. Google non aderisce:
 * per lui c'è la sitemap in Search Console.
 *
 * La chiave non è un segreto: il protocollo la vuole pubblica, in un file alla radice del sito
 * (`public/<chiave>.txt`), per dimostrare che chi avvisa controlla davvero il dominio.
 */

export const INDEXNOW_KEY = '25c82038a53756f2161fd6dd8722ecca'

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

export interface IndexNowPayload {
  readonly host: string
  readonly key: string
  readonly keyLocation: string
  readonly urlList: readonly string[]
}

/** Gli indirizzi `<loc>` di una sitemap, solo quelli del sito stesso. */
export function sitemapUrls(xml: string, siteUrl: string): string[] {
  const host = new URL(siteUrl).host
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1] ?? '')
  return [...new Set(urls)].filter((u) => {
    try {
      return new URL(u).host === host
    } catch {
      return false
    }
  })
}

export function indexNowPayload(siteUrl: string, urls: readonly string[]): IndexNowPayload {
  const base = new URL(siteUrl)
  return {
    host: base.host,
    key: INDEXNOW_KEY,
    keyLocation: new URL(`/${INDEXNOW_KEY}.txt`, base).toString(),
    // Il protocollo accetta fino a 10.000 indirizzi per richiesta: la sitemap ne ha qualche decina.
    urlList: urls.slice(0, 10_000),
  }
}
