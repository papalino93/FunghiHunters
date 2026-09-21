/**
 * Le otto classi della mappa europea dei generi arborei, e come diventano il bosco di una zona.
 *
 * **Cosa e' la fonte.** ForestPaths, "European tree genus map": 10 m, anno 2020, da Sentinel-1 e
 * Sentinel-2, CC BY 4.0, DOI 10.5281/zenodo.13341104. La legenda e' stata letta dal record vero,
 * non dedotta: vedi `scripts/probe-forest-source.ts` e la corsa che l'ha stampata.
 *
 * **Cosa distingue e cosa no.** Classifica il *genere*, non la tipologia forestale. Faggio e
 * querce escono nominati, e sono i due boschi da porcino piu' diffusi in Italia. Il castagno
 * invece finisce dentro "altre latifoglie" e l'abete bianco dentro "altre conifere": sono due
 * habitat che in Italia contano, e la mappa non permette di nominarli. Qui si tengono come classi
 * generiche dichiarate, perche' spacciare una conifera qualsiasi per abetina vorrebbe dire
 * scrivere nel dato una cosa che la fonte non dice.
 *
 * **Stato della fonte.** E' dichiarata "early access": non ancora validata del tutto, con possibili
 * incoerenze regionali. Va detto dove il dato si mostra, non nascosto.
 */

export interface ForestClass {
  /** Valore del pixel nella mappa. */
  readonly code: number
  /**
   * Nome che l'app usa per il tipo di bosco, `null` per il non bosco. E' anche quello che
   * l'utente legge nel filtro e nella scheda, percio' "altre conifere" e non una sigla.
   */
  readonly slug: string | null
  /** Come si legge in italiano. */
  readonly label: string
}

export const FOREST_CLASSES: readonly ForestClass[] = [
  { code: 0, slug: 'lariceto', label: 'larice' },
  { code: 1, slug: 'pecceta', label: 'abete rosso' },
  { code: 2, slug: 'pineta', label: 'pino' },
  { code: 3, slug: 'faggeta', label: 'faggio' },
  { code: 4, slug: 'querceto', label: 'querce' },
  { code: 5, slug: 'altre conifere', label: 'altre conifere' },
  { code: 6, slug: 'altre latifoglie', label: 'altre latifoglie' },
  { code: 7, slug: null, label: 'non bosco' },
]

/**
 * Le classi che tengono insieme generi diversi, e che quindi non dicono davvero che bosco sia.
 *
 * "Altre latifoglie" contiene il castagno, che per il porcino e' fra i boschi migliori, ma anche
 * il pioppo e l'ontano, che non lo ospitano; "altre conifere" e' quasi sempre abete bianco — il
 * bosco della fonte dell'Amiata — ma puo' essere anche cipresso o cedro. Il modello non abbassa
 * il punteggio per questo: abbassa la confidence. Vedi `src/lib/model/forest.ts`.
 */
export const AMBIGUOUS_SLUGS: ReadonlySet<string> = new Set(['altre latifoglie', 'altre conifere'])

const BY_CODE = new Map(FOREST_CLASSES.map((c) => [c.code, c]))

/**
 * Quota minima sul bosco perche' un tipo venga nominato.
 *
 * Sotto questa soglia e' una frangia: nominarla farebbe promettere al filtro "cercami le faggete"
 * una faggeta che sul posto non si trova.
 */
export const MIN_SHARE = 0.15

/** Oltre tre nomi l'etichetta smette di orientare e diventa un elenco. */
export const MAX_TYPES = 3

export interface ForestComposition {
  /** Quota di pixel a bosco sul totale dei pixel classificati. */
  readonly forestFraction: number
  /** Per ogni tipo presente, la sua quota **sul bosco**, non sull'area totale. */
  readonly shares: Readonly<Record<string, number>>
  /** I tipi dominanti, dal piu' esteso: e' quello che finisce in `zone.forest`. */
  readonly forest: readonly string[]
  /** Pixel classificati davvero letti, per sapere se il campione regge. */
  readonly sampledPixels: number
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Da un istogramma di pixel alla composizione di una zona.
 *
 * `null` quando non c'e' nessun pixel classificato: e' il caso di una zona fuori dalla copertura
 * della mappa, e va tenuto distinto da "qui non c'e' bosco", che invece e' un'informazione.
 */
export function composeForest(histogram: ReadonlyMap<number, number>): ForestComposition | null {
  let classified = 0
  let wooded = 0
  const byslug = new Map<string, number>()

  for (const [code, count] of histogram) {
    const klass = BY_CODE.get(code)
    // Valori fuori legenda sono il "senza dato" del raster: non sono ne' bosco ne' non bosco.
    if (klass === undefined || count <= 0) continue
    classified += count
    if (klass.slug === null) continue
    wooded += count
    byslug.set(klass.slug, (byslug.get(klass.slug) ?? 0) + count)
  }

  if (classified === 0) return null

  const shares: Record<string, number> = {}
  for (const [slug, count] of byslug) shares[slug] = round(count / wooded)

  const forest =
    wooded === 0
      ? []
      : [...byslug.entries()]
          .filter(([, count]) => count / wooded >= MIN_SHARE)
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_TYPES)
          .map(([slug]) => slug)

  return {
    forestFraction: round(wooded / classified),
    shares,
    forest,
    sampledPixels: classified,
  }
}
