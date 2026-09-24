/**
 * I servizi esterni del sito: verifica su Google Search Console (e Bing) e statistiche di visita.
 *
 * Sono spenti finché non vengono attivati, ed è voluto. Il codice di verifica arriva da Search
 * Console solo quando si crea la proprietà; lo script delle statistiche di Vercel risponde 404
 * finché Web Analytics non è attivato nel pannello del progetto, e caricarlo prima vorrebbe dire
 * un errore in console a ogni visita. Per attivarli basta cambiare le righe qui sotto (o le
 * variabili d'ambiente su Vercel): procedura in `docs/ATTIVAZIONE-GOOGLE-ANALYTICS.md`.
 */

/** Il `content` del meta tag che dà Search Console («Tag HTML»), non il tag intero. */
export const GOOGLE_SITE_VERIFICATION =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? ''

/** Il `content` del meta tag `msvalidate.01` di Bing Webmaster Tools, facoltativo. */
export const BING_SITE_VERIFICATION = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ?? ''

/**
 * Vercel Web Analytics e Speed Insights: niente cookie, niente identificativi salvati sul
 * dispositivo, visite contate in forma aggregata. Accesi solo dopo averli attivati nel pannello.
 */
export const ANALYTICS_ENABLED = process.env.NEXT_PUBLIC_ANALYTICS === '1'

/** I metadati di verifica, nel formato di `Metadata['verification']`; vuoto se non ce ne sono. */
export function verificationMetadata(): { google?: string; other?: Record<string, string> } {
  return {
    ...(GOOGLE_SITE_VERIFICATION === '' ? {} : { google: GOOGLE_SITE_VERIFICATION }),
    ...(BING_SITE_VERIFICATION === '' ? {} : { other: { 'msvalidate.01': BING_SITE_VERIFICATION } }),
  }
}

/**
 * Parametri dell'indirizzo che le statistiche possono vedere. Gli altri (per esempio le
 * coordinate di una ricerca meteo) vengono tolti prima dell'invio: le statistiche servono a
 * sapere quali pagine si usano, non dove si trova chi le usa.
 */
const KEPT_PARAMS = new Set(['regione', 'zona', 'giorno'])

export function sanitizeAnalyticsUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return raw
  }
  for (const key of [...url.searchParams.keys()]) {
    if (!KEPT_PARAMS.has(key)) url.searchParams.delete(key)
  }
  url.hash = ''
  return url.toString()
}
