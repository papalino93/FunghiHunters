/**
 * Quali zone disegnare come goccia intera e quali come pallino, allo zoom corrente.
 *
 * **Perché esiste.** Con la Toscana completa (226 zone) la mappa a zoom regionale disegnava 226
 * gocce da 48×60 px una sopra l'altra: numeri tagliati a metà («4», «/10»), una zona da 2/100
 * visibile quanto una da 61, e nessun modo di capire a colpo d'occhio dove andare. È il problema
 * che le mappe risolvono da sempre con l'etichettatura a collisione: ogni etichetta occupa il suo
 * spazio sullo schermo, e chi conta di più lo prende per primo.
 *
 * Qui «chi conta di più» è il punteggio: le zone si mettono in fila dalla più alta e ognuna
 * diventa goccia solo se il suo riquadro non tocca quello di una goccia già piazzata. Le altre
 * restano sulla mappa come pallino colorato — toccabile, ma senza coprire niente. Avvicinandosi
 * lo spazio cresce e le gocce aumentano da sole. La zona selezionata è sempre una goccia.
 *
 * Pura e in pixel dello schermo, per i test: la mappa le passa le posizioni proiettate.
 */

export interface ScreenPoint {
  readonly code: string
  /** Pixel dello schermo della coordinata della zona: la punta della goccia. */
  readonly x: number
  readonly y: number
  /** Più alto, prima scelto: il punteggio del giorno mostrato. */
  readonly priority: number
}

export interface PinBox {
  /** Larghezza e altezza del riquadro che una goccia occupa sopra la sua punta. */
  readonly width: number
  readonly height: number
}

interface Rect {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

function pinRect(point: ScreenPoint, box: PinBox): Rect {
  return {
    left: point.x - box.width / 2,
    right: point.x + box.width / 2,
    top: point.y - box.height,
    bottom: point.y,
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

/**
 * I codici delle zone da disegnare come goccia intera.
 *
 * `always` passa per primo e senza controlli (la zona selezionata): le altre gli girano attorno.
 * A parità di punteggio vince il codice più piccolo, così lo stesso zoom dà sempre la stessa
 * mappa e le gocce non saltano da una zona all'altra a ogni ridisegno.
 */
export function pickFullPins(
  points: readonly ScreenPoint[],
  box: PinBox,
  always: ReadonlySet<string> = new Set(),
  /**
   * Sotto questa priorità niente goccia, anche con spazio libero: a zoom regionale una goccia
   * «2/100» in mezzo ai pallini attira l'occhio proprio dove non c'è niente da cercare.
   */
  minPriority = Number.NEGATIVE_INFINITY,
): Set<string> {
  const ordered = [...points].sort(
    (a, b) =>
      Number(always.has(b.code)) - Number(always.has(a.code)) ||
      b.priority - a.priority ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  )
  const placed: Rect[] = []
  const full = new Set<string>()
  for (const point of ordered) {
    const rect = pinRect(point, box)
    if (!always.has(point.code)) {
      if (point.priority < minPriority) continue
      if (placed.some((other) => overlaps(rect, other))) continue
    }
    placed.push(rect)
    full.add(point.code)
  }
  return full
}
