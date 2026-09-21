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
