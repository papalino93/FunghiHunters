/**
 * La regione di riferimento: quale pezzo d'Italia apre l'app.
 *
 * Il catalogo nazionale ha 1.202 zone in venti regioni, ma la domanda "dove vado" è sempre locale:
 * chi sta in Trentino non ha nessun uso per le zone della Calabria. Invece di chiedere la regione
 * a ogni apertura, o di indovinarla dalla posizione (che richiede un permesso, e che in viaggio
 * sbaglia), la si sceglie una volta e si ricorda.
 *
 * Sta in un **cookie** e non in `localStorage` per una ragione precisa: il server deve poterla
 * leggere mentre costruisce la pagina. Con `localStorage` la pagina arriverebbe con la regione
 * sbagliata e cambierebbe sotto gli occhi un attimo dopo, che è esattamente l'effetto che questa
 * funzione esiste per evitare. Non è un dato sensibile e non serve al server per nient'altro,
 * quindi niente `httpOnly`: lo scrive il browser, lo legge il server.
 *
 * Questo modulo è puro apposta — nessun `next/headers`, nessun `document` — così vale identico
 * sul server e nel browser, ed è verificabile senza nessuno dei due.
 */

export const REGION_COOKIE = 'fungicast.regione'

/**
 * La Toscana è il riferimento predefinito, e non per affetto: è l'unica regione con le sette zone
 * di taratura alimentate dalle stazioni SIR, cioè con misure reali e non solo modello. Chi apre
 * l'app senza aver scelto niente deve vedere quello che l'app ha sempre mostrato.
 */
export const DEFAULT_REGION_SLUG = 'toscana'

/** Un anno: la regione di casa non cambia, e riproporre la domanda ogni mese sarebbe fastidio. */
export const REGION_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365

export interface RegionChoice {
  readonly slug: string
  readonly name: string
}

/**
 * Forma ammessa di uno slug di regione.
 *
 * Il valore arriva da un cookie, cioè da qualcosa che l'utente può scrivere a mano: finisce in un
 * `join()` verso il filesystem, quindi il controllo di forma è una difesa, non un formalismo.
 * `loadRegion` ha la stessa guardia — due volte, perché nessuna delle due deve dipendere
 * dall'altra per essere corretta.
 */
export function isRegionSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{2,60}$/.test(value)
}

/**
 * Lo slug da usare davvero: quello chiesto se è una regione che esiste, altrimenti il predefinito.
 *
 * Ricadere invece di fallire è deliberato. Una regione può sparire dall'elenco fra un deploy e
 * l'altro (catalogo rigenerato, slug corretto), e un cookie vecchio non deve lasciare l'utente
 * davanti a una pagina vuota o a un 404: deve semplicemente riportarlo a casa.
 */
export function resolveRegionSlug(
  candidate: string | null | undefined,
  known: readonly RegionChoice[],
): string {
  if (!isRegionSlug(candidate)) return DEFAULT_REGION_SLUG
  return known.some((r) => r.slug === candidate) ? candidate : DEFAULT_REGION_SLUG
}

/** Il valore da assegnare a `document.cookie` per ricordare la scelta. */
export function regionCookieAssignment(slug: string): string {
  const safe = isRegionSlug(slug) ? slug : DEFAULT_REGION_SLUG
  return `${REGION_COOKIE}=${safe}; path=/; max-age=${String(REGION_COOKIE_MAX_AGE_S)}; samesite=lax`
}

/**
 * Lo slug scritto in un header `Cookie`, se c'è.
 *
 * Serve dove il cookie si legge da una stringa grezza invece che da un'API che lo ha già
 * spacchettato — e rende questa lettura verificabile senza montare né un server né un browser.
 */
export function regionFromCookieHeader(header: string | null | undefined): string | null {
  if (typeof header !== 'string') return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== REGION_COOKIE) continue
    const value = part.slice(eq + 1).trim()
    return isRegionSlug(value) ? value : null
  }
  return null
}
