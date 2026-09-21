/**
 * Proiezione Lambert azimutale equivalente d'Europa (EPSG:3035), in forma chiusa.
 *
 * **Perche' esiste.** Le carte europee del suolo — fra cui la mappa dei generi arborei usata per
 * il bosco delle zone — sono distribuite in EPSG:3035, non in gradi. Per sapere quale pixel
 * corrisponde a un comune bisogna passare dai gradi a quel sistema, e sbagliare la conversione
 * non da' un errore: da' il bosco di un altro posto. E' il tipo di guasto che non si vede finche'
 * qualcuno non nota che una zona dell'Appennino dichiara larice.
 *
 * Si scrive a mano invece di aggiungere una libreria di proiezioni perche' serve **una** formula
 * in **una** direzione, con parametri fissi: proj4 porterebbe dentro decine di sistemi che questo
 * progetto non usa, e la formula qui sotto e' quella pubblicata (Snyder, "Map Projections — A
 * Working Manual", cap. 24), verificabile riga per riga contro il punto ufficiale di falsa
 * origine.
 */

/** Semiasse maggiore di GRS80, in metri: l'ellissoide di ETRS89. */
const A = 6378137
const F = 1 / 298.257222101
const E2 = F * (2 - F)
const E = Math.sqrt(E2)

const TO_RAD = Math.PI / 180

/** Centro di proiezione e falsa origine, come definiti da EPSG:3035. */
const LON0 = 10 * TO_RAD
const LAT0 = 52 * TO_RAD
const X0 = 4_321_000
const Y0 = 3_210_000

/**
 * Funzione autalica: sostituisce il seno della latitudine su una sfera, tenendo conto dello
 * schiacciamento. E' il punto in cui l'ellissoide entra nel conto.
 */
function authalic(phi: number): number {
  const sp = Math.sin(phi)
  return (
    (1 - E2) * (sp / (1 - E2 * sp * sp) - (1 / (2 * E)) * Math.log((1 - E * sp) / (1 + E * sp)))
  )
}

const Q_POLE = authalic(Math.PI / 2)
const Q_LAT0 = authalic(LAT0)
const BETA0 = Math.asin(Q_LAT0 / Q_POLE)
const RQ = A * Math.sqrt(Q_POLE / 2)
const D = (A * (Math.cos(LAT0) / Math.sqrt(1 - E2 * Math.sin(LAT0) ** 2))) / (RQ * Math.cos(BETA0))

export interface LaeaPoint {
  readonly x: number
  readonly y: number
}

/** Da gradi (WGS84/ETRS89, indistinguibili a questa scala) a metri EPSG:3035. */
export function toLaea(lon: number, lat: number): LaeaPoint {
  const phi = lat * TO_RAD
  const lam = lon * TO_RAD
  const beta = Math.asin(authalic(phi) / Q_POLE)
  const dLam = lam - LON0

  const b =
    RQ *
    Math.sqrt(
      2 / (1 + Math.sin(BETA0) * Math.sin(beta) + Math.cos(BETA0) * Math.cos(beta) * Math.cos(dLam)),
    )

  return {
    x: X0 + b * D * Math.cos(beta) * Math.sin(dLam),
    y:
      Y0 +
      (b / D) *
        (Math.cos(BETA0) * Math.sin(beta) - Math.sin(BETA0) * Math.cos(beta) * Math.cos(dLam)),
  }
}

/**
 * Serie per tornare dalla latitudine autalica a quella vera (Snyder, formula 3-18).
 *
 * L'andata usa una formula chiusa, il ritorno no: la relazione non si inverte in forma
 * elementare. La serie converge in fretta sull'ellissoide terrestre — i termini oltre il sesto
 * grado valgono frazioni di millimetro — quindi si fermano qui e il test di andata e ritorno
 * dichiara l'errore che resta.
 */
const B1 = E2 / 3 + (31 * E2 ** 2) / 180 + (517 * E2 ** 3) / 5040
const B2 = (23 * E2 ** 2) / 360 + (251 * E2 ** 3) / 3780
const B3 = (761 * E2 ** 3) / 45360

/** Da metri EPSG:3035 a gradi. E' l'inversa esatta di `toLaea`, non un'approssimazione locale. */
export function fromLaea(x: number, y: number): { lon: number; lat: number } {
  const dx = x - X0
  const dy = y - Y0

  const rho = Math.hypot(dx / D, D * dy)
  if (rho === 0) return { lon: LON0 / TO_RAD, lat: LAT0 / TO_RAD }

  const ce = 2 * Math.asin(rho / (2 * RQ))
  const sinCe = Math.sin(ce)
  const cosCe = Math.cos(ce)

  const beta = Math.asin(cosCe * Math.sin(BETA0) + (D * dy * sinCe * Math.cos(BETA0)) / rho)
  const lam =
    LON0 +
    Math.atan2(
      dx * sinCe,
      D * rho * Math.cos(BETA0) * cosCe - D * D * dy * Math.sin(BETA0) * sinCe,
    )

  const phi =
    beta + B1 * Math.sin(2 * beta) + B2 * Math.sin(4 * beta) + B3 * Math.sin(6 * beta)

  return { lon: lam / TO_RAD, lat: phi / TO_RAD }
}
