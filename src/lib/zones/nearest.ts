/**
 * Le zone ordinate per distanza da una posizione, per il diario.
 *
 * **Perché esiste.** Chi registra un'uscita col GPS a San Casciano non deve scegliere a mano la
 * zona da un elenco alfabetico dove compare anche il Monte Amiata: la posizione dice già dov'era.
 * Il modulo prende la più vicina da sola e mette le altre in ordine di distanza, così la scelta
 * resta possibile ma quella giusta è in cima.
 *
 * La distanza è dal punto di riferimento della zona (il comune), in linea d'aria: abbastanza per
 * dire «sei vicino a Greve», non per dire in quale comune cade il punto esatto.
 */

import { distanceKm } from '@/lib/qc/checks'

export interface Located {
  readonly code: string
  readonly latitude: number
  readonly longitude: number
}

/**
 * Oltre questa distanza la zona più vicina non è «dove sei stato» ma solo «la meno lontana fra
 * quelle che conosciamo»: il modulo la propone lo stesso, ma lo dice.
 */
export const FAR_ZONE_KM = 25

/** Le zone dalla più vicina, ciascuna con la sua distanza in km. */
export function zonesByDistance<T extends Located>(
  zones: readonly T[],
  latitude: number,
  longitude: number,
): Array<{ zone: T; km: number }> {
  return zones
    .map((zone) => ({ zone, km: distanceKm(latitude, longitude, zone.latitude, zone.longitude) }))
    .sort((a, b) => a.km - b.km || (a.zone.code < b.zone.code ? -1 : a.zone.code > b.zone.code ? 1 : 0))
}
