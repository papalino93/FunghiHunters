/**
 * Il riquadro da inquadrare sulla mappa.
 *
 * Era una costante fissa sulla Toscana dentro `MapView`, ed era la metà visibile del difetto per
 * cui aprire la mappa da una zona trentina mostrava la Toscana: anche con i segnaposti giusti, la
 * telecamera guardava altrove. Il riquadro lo dicono le zone.
 *
 * Vive qui e non nel componente perché il componente importa MapLibre, che tocca `window`
 * all'import: separato, questo calcolo si verifica senza un browser.
 */

/**
 * Angolo sud-ovest e angolo nord-est.
 *
 * Tuple mutabile e non `readonly`: è la forma che MapLibre accetta (`LngLatBoundsLike`), e
 * renderla immutabile qui significherebbe copiarla a ogni chiamata solo per compiacere i tipi.
 * Nessuno la modifica — `boundsOfZones` ne costruisce sempre una nuova.
 */
export type Bounds = [[number, number], [number, number]]

/** Ripiego di quando non c'è nessuna zona da inquadrare. */
export function tuscanyBounds(): Bounds {
  return [
    [9.6, 42.2],
    [12.5, 44.6],
  ]
}

/** Margine attorno alle zone, in gradi: senza, i segnaposti di bordo finiscono sul ciglio. */
const PADDING_DEG = 0.25

export interface MappablePoint {
  readonly latitude: number
  readonly longitude: number
}

/**
 * Il riquadro che contiene tutte le zone passate, con un margine.
 *
 * Il margine serve anche al caso di una zona sola: due angoli coincidenti non sono un riquadro, e
 * `fitBounds` su un punto porterebbe lo zoom al massimo consentito, cioè a un dettaglio stradale
 * da cui non si capisce più dove si è.
 *
 * Le coordinate non finite si saltano invece di propagarsi: un `NaN` in un angolo rende il
 * riquadro intero inservibile e la mappa resta grigia, che è il modo peggiore di segnalare un
 * dato sporco.
 */
export function boundsOfZones(zones: readonly MappablePoint[]): Bounds {
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity

  for (const zone of zones) {
    if (!Number.isFinite(zone.longitude) || !Number.isFinite(zone.latitude)) continue
    minLon = Math.min(minLon, zone.longitude)
    maxLon = Math.max(maxLon, zone.longitude)
    minLat = Math.min(minLat, zone.latitude)
    maxLat = Math.max(maxLat, zone.latitude)
  }

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return tuscanyBounds()

  return [
    [minLon - PADDING_DEG, minLat - PADDING_DEG],
    [maxLon + PADDING_DEG, maxLat + PADDING_DEG],
  ]
}
