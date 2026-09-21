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
 * **Quello che questa funzione non puo' garantire** e' che il punto resti dentro il comune: qui
 * arrivano pixel, non confini. Lo verifica il chiamante con il poligono ISTAT, e se il punto nuovo
 * cade fuori tiene quello vecchio. Vedi `scripts/ingest-forest-italia.ts`.
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

/** Chiave di cella per accumulare i pixel. Non ha significato oltre l'uso come chiave. */
export function cellKey(x: number, y: number): string {
  return `${Math.floor(x / CELL_M)},${Math.floor(y / CELL_M)}`
}

export function forestPoint(
  origin: { readonly x: number; readonly y: number },
  cells: ReadonlyMap<string, WoodCell>,
  options: ForestPointOptions = {},
): ForestPointResult {
  const minDensity = options.minDensity ?? 0.5
  const minFill = options.minFill ?? 0.25
  const minMoveM = options.minMoveM ?? 250

  let wooded = 0
  let sumX = 0
  let sumY = 0
  let fullest = 0
  for (const cell of cells.values()) {
    wooded += cell.wooded
    sumX += cell.sumX
    sumY += cell.sumY
    if (cell.total > fullest) fullest = cell.total
  }

  if (wooded === 0) {
    return { x: origin.x, y: origin.y, movedM: 0, outcome: 'niente-bosco', density: 0 }
  }

  const centreX = sumX / wooded
  const centreY = sumY / wooded

  const candidates = [...cells.values()].filter(
    (cell) => cell.wooded > 0 && cell.total >= fullest * minFill && cell.wooded / cell.total >= minDensity,
  )
  /*
   * Nessuna cella abbastanza boscosa: si ripiega su quella con piu' bosco in assoluto.
   *
   * E' il caso dei comuni d'alta quota, dove il bosco esiste ma non domina nessuna cella. Tenere
   * il punto sulla pietraia sarebbe peggio: meglio il punto piu' boscoso che c'e', dichiarando
   * con `density` quanto vale.
   */
  const pool =
    candidates.length > 0
      ? candidates
      : [...cells.values()].filter((cell) => cell.wooded > 0 && cell.total >= fullest * minFill)
  const fallback = pool.length > 0 ? pool : [...cells.values()].filter((cell) => cell.wooded > 0)

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
