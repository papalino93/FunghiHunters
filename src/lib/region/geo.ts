/**
 * La regione di partenza di chi arriva per la prima volta, dall'indirizzo IP.
 *
 * Prima chiunque apriva il sito senza aver scelto una regione finiva sulla Toscana, anche dal
 * Trentino: la prima schermata parlava di un posto lontano centinaia di chilometri. Vercel manda
 * con ogni richiesta il codice ISO 3166-2 della regione di primo livello dell'IP
 * (`x-vercel-ip-country-region`, per l'Italia il codice numerico della regione): qui diventa la
 * regione dell'app. Nessuna posizione precisa, niente salvato: è solo il punto di partenza, e la
 * regione scelta a mano (il cookie) vince sempre. Fuori dall'Italia, o senza il dato, `null`.
 */

import type { RegionChoice } from '@/lib/region/preference'

/** Codici ISO 3166-2:IT delle regioni → slug dell'indice nazionale. */
const ISO_TO_SLUG: Readonly<Record<string, string>> = {
  '21': 'piemonte',
  '23': 'valle-d-aosta-vallee-d-aoste',
  '25': 'lombardia',
  '32': 'trentino-alto-adige-sudtirol',
  '34': 'veneto',
  '36': 'friuli-venezia-giulia',
  '42': 'liguria',
  '45': 'emilia-romagna',
  '52': 'toscana',
  '55': 'umbria',
  '57': 'marche',
  '62': 'lazio',
  '65': 'abruzzo',
  '67': 'molise',
  '72': 'campania',
  '75': 'puglia',
  '77': 'basilicata',
  '78': 'calabria',
  '82': 'sicilia',
  '88': 'sardegna',
}

export function regionFromIp(
  country: string | null | undefined,
  region: string | null | undefined,
  known: readonly RegionChoice[],
): string | null {
  if (country?.toUpperCase() !== 'IT' || region === null || region === undefined) return null
  const slug = ISO_TO_SLUG[region.toUpperCase()]
  return slug !== undefined && known.some((r) => r.slug === slug) ? slug : null
}
