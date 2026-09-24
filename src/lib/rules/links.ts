/**
 * Quali pagine di norme esistono per una regione dell'app.
 *
 * Tenuto a parte da `regole.json` di proposito: lo legge «Prima di partire», che gira nel
 * browser, e importare i dati interi vorrebbe dire spedire a ogni visita decine di KB di testi di
 * legge per costruire un collegamento. Un test controlla che le due liste coincidano.
 */
export interface RulesLink {
  readonly slug: string
  readonly name: string
}

const PROVINCES: Readonly<Record<string, readonly RulesLink[]>> = {
  'trentino-alto-adige-sudtirol': [
    { slug: 'provincia-di-trento', name: 'Provincia di Trento' },
    { slug: 'provincia-di-bolzano', name: 'Provincia di Bolzano' },
  ],
  'valle-d-aosta-vallee-d-aoste': [{ slug: 'valle-d-aosta', name: "Valle d'Aosta" }],
}

/** Per tutte le altre regioni la pagina ha lo stesso slug della regione. */
export function rulesLinksFor(regionSlug: string, regionName: string): readonly RulesLink[] {
  return PROVINCES[regionSlug] ?? [{ slug: regionSlug, name: regionName }]
}
