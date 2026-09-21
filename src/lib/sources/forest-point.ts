/**
 * Dove sta davvero il bosco di un comune, cioe' dove ha senso calcolare il punteggio.
 *
 * **Il bug che risolve.** Il punto di riferimento di una zona e' il centroide geometrico del
 * comune (`referencePoint` in `istat-national.ts`). Per un comune di fondovalle cade in paese, ma
 * per un comune alpino cade a mezza montagna: Bormio finiva a 2.923 m mentre il paese sta a 1.225,
 * cioe' diverse centinaia di metri sopra il limite degli alberi. Li' l'app leggeva il meteo di una
 * pietraia — neve a settembre, medie termiche fuori da qualunque ottimo — e lo attribuiva a un
 * comune il cui bosco sta mille metri piu' in basso. Su 1.202 zone, 120 avevano il punto sopra i
 * 1.800 m e 38 di quelle meno del 30% di bosco attorno.
 *
 * **Come lo risolve.** I pixel a bosco letti attorno alla zona si accumulano in celle grosse
 * (`CELL_M`), e il punto nuovo e' il baricentro del bosco della cella piu' vicina al baricentro
 * del bosco complessivo. Due passaggi invece di uno, e il motivo e' che il baricentro del bosco,
 * da solo, puo' cadere in mezzo a una radura o nel fondovalle fra due versanti boscati: scegliendo
 * una cella che il bosco ce l'ha davvero si evita di spostare il punto in un prato.
 *
 * **Il confine del comune entra nella scelta, non dopo.** La prima versione sceglieva il punto e
 * poi il chiamante verificava che fosse dentro il comune, tenendo quello vecchio se non lo era.
 * Su 1.202 zone ne bocciava 79, e fra quelle c'era Bormio: un comune lungo e stretto, dove il
 * bosco piu' vicino al baricentro sta nel comune accanto. Cioe' il controllo scartava proprio i
 * casi per cui la correzione esiste. Ora le celle fuori dal comune non contano ne' come bersaglio
 * ne' come candidate, e il punto esce dentro per costruzione.
 */

/** Lato della cella su cui si decide dov'e' il bosco, in metri. */
export const CELL_M = 500

export interface WoodCell {
  /** Pixel a bosco nella cella. */
  readonly wooded: number
  /** Pixel classificati nella cella, bosco o no. */
  readonly total: number
  /** Somma delle coordinate dei pixel a bosco, da cui il loro baricentro. */
  readonly sumX: number
  readonly sumY: number
}

export interface ForestPointOptions {
  /** Quota minima di bosco perche' una cella sia candidata a ospitare il punto. */
  readonly minDensity?: number
  /**
   * Quanto deve essere piena una cella per contare, rispetto alla piu' piena vista.
   *
   * Serve contro i bordi: una cella tagliata dal bordo della tessera puo' avere due pixel, tutti
   * e due a bosco, e sembrare il posto piu' boscoso del comune con una densita' del 100%.
   */
  readonly minFill?: number
  /** Sotto questo spostamento il punto resta dov'e': muoverlo non cambierebbe niente. */
  readonly minMoveM?: number
  /**
   * Vero quando quel punto sta dentro il comune della zona.
   *
   * Senza, il bosco del comune accanto puo' vincere: nelle valli alpine strette succede quasi
   * sempre, ed e' li' che la correzione serve di piu'.
   */
  readonly inside?: (x: number, y: number) => boolean
}

export type ForestPointOutcome = 'gia-nel-bosco' | 'spostato' | 'niente-bosco'

export interface ForestPointResult {
  readonly x: number
  readonly y: number
  readonly movedM: number
  readonly outcome: ForestPointOutcome
  /** Quota di bosco della cella scelta: dice quanto e' solido lo spostamento. */
  readonly density: number
}

/**
 * Chiave di cella per accumulare i pixel. Non ha significato oltre l'uso come chiave.
 *
 * E' un numero e non una stringa perche' questa funzione viene chiamata una volta per pixel: su
 * un disco di 6 km sono un milione e mezzo di chiamate per zona, e costruire una stringa ogni
 * volta vuol dire un miliardo di allocazioni in una corsa nazionale. Il fattore un milione tiene
 * separate le due coordinate senza collisioni: in EPSG:3035 l'Europa sta dentro 14.000 celle per
 * lato, ben sotto quel margine, e il risultato resta un intero esatto in doppia precisione.
 */
export function cellKey(x: number, y: number): number {
  return Math.floor(x / CELL_M) * 1_000_000 + Math.floor(y / CELL_M)
}

export function forestPoint(
  origin: { readonly x: number; readonly y: number },
  cells: ReadonlyMap<number, WoodCell>,
  options: ForestPointOptions = {},
): ForestPointResult {
  const minDensity = options.minDensity ?? 0.5
  const minFill = options.minFill ?? 0.25
  const minMoveM = options.minMoveM ?? 250
  const inside = options.inside

  // Il pieno si misura su tutte le celle, anche quelle fuori: e' la scala con cui si riconosce
  // una scheggia al bordo della tessera, e non dipende da dove passa il confine comunale.
  let fullest = 0
  for (const cell of cells.values()) {
    if (cell.total > fullest) fullest = cell.total
  }

  const usable = [...cells.values()].filter((cell) => {
    if (cell.wooded === 0) return false
    if (inside === undefined) return true
    return inside(cell.sumX / cell.wooded, cell.sumY / cell.wooded)
  })

  let wooded = 0
  let sumX = 0
  let sumY = 0
  for (const cell of usable) {
    wooded += cell.wooded
    sumX += cell.sumX
    sumY += cell.sumY
  }

  if (wooded === 0) {
    return { x: origin.x, y: origin.y, movedM: 0, outcome: 'niente-bosco', density: 0 }
  }

  const centreX = sumX / wooded
  const centreY = sumY / wooded

  const candidates = usable.filter(
    (cell) => cell.total >= fullest * minFill && cell.wooded / cell.total >= minDensity,
  )
  /*
   * Nessuna cella abbastanza boscosa: si ripiega su quella con piu' bosco in assoluto.
   *
   * E' il caso dei comuni d'alta quota, dove il bosco esiste ma non domina nessuna cella. Tenere
   * il punto sulla pietraia sarebbe peggio: meglio il punto piu' boscoso che c'e', dichiarando
   * con `density` quanto vale.
   */
  const pool =
    candidates.length > 0 ? candidates : usable.filter((cell) => cell.total >= fullest * minFill)
  const fallback = pool.length > 0 ? pool : usable

  const best = fallback.reduce((acc, cell) => {
    const ax = acc.sumX / acc.wooded
    const ay = acc.sumY / acc.wooded
    const cx = cell.sumX / cell.wooded
    const cy = cell.sumY / cell.wooded
    const accDist = (ax - centreX) ** 2 + (ay - centreY) ** 2
    const cellDist = (cx - centreX) ** 2 + (cy - centreY) ** 2
    if (cellDist < accDist) return cell
    // A pari distanza vince la cella piu' boscosa: succede con celle simmetriche attorno al
    // baricentro, e senza questo la scelta dipenderebbe dall'ordine di lettura delle tessere.
    return cellDist === accDist && cell.wooded > acc.wooded ? cell : acc
  })

  const x = best.sumX / best.wooded
  const y = best.sumY / best.wooded
  const movedM = Math.hypot(x - origin.x, y - origin.y)
  const density = best.wooded / best.total

  if (movedM < minMoveM) {
    return { x: origin.x, y: origin.y, movedM: 0, outcome: 'gia-nel-bosco', density }
  }
  return { x, y, movedM, outcome: 'spostato', density }
}
