/**
 * Punti salvati: dove ho lasciato l'auto, o un punto a cui tornare se mi perdo.
 *
 * Diverso dal diario apposta: qui non c'è un esito da calibrare, solo un posto e un'ora. Niente
 * riservatezza a più livelli (`PrivacyLevel`) perché un punto salvato serve solo a chi l'ha
 * salvato, sul suo stesso dispositivo — non è mai condiviso né sincronizzato.
 */

export const WAYPOINT_KINDS = ['car', 'point'] as const
export type WaypointKind = (typeof WAYPOINT_KINDS)[number]

export interface Waypoint {
  readonly id: string
  readonly kind: WaypointKind
  readonly label: string
  readonly latitude: number
  readonly longitude: number
  readonly createdAt: string
}

export interface WaypointDraft {
  readonly kind: WaypointKind
  readonly label: string
  readonly latitude: number
  readonly longitude: number
}

const EARTH_RADIUS_M = 6_371_000

/** Distanza in linea d'aria, in metri. Stessa formula usata altrove nel progetto per le zone. */
export function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRad = (d: number): number => (d * Math.PI) / 180
  const dLat = toRad(to.latitude - from.latitude)
  const dLon = toRad(to.longitude - from.longitude)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

/**
 * Rotta bussola (0-360, 0 = nord) da `from` a `to`.
 * Serve a dire "verso quel lato", non a sostituire una bussola vera: la precisione del GPS a piedi
 * nel bosco è dell'ordine di qualche metro, non abbastanza per una freccia affidabile da sola.
 */
export function bearingDegrees(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRad = (d: number): number => (d * Math.PI) / 180
  const y = Math.sin(toRad(to.longitude - from.longitude)) * Math.cos(toRad(to.latitude))
  const x =
    Math.cos(toRad(from.latitude)) * Math.sin(toRad(to.latitude)) -
    Math.sin(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.cos(toRad(to.longitude - from.longitude))
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

const COMPASS_POINTS = [
  'nord', 'nord-nord-est', 'nord-est', 'est-nord-est',
  'est', 'est-sud-est', 'sud-est', 'sud-sud-est',
  'sud', 'sud-sud-ovest', 'sud-ovest', 'ovest-sud-ovest',
  'ovest', 'ovest-nord-ovest', 'nord-ovest', 'nord-nord-ovest',
] as const

/** Punto cardinale più vicino a una rotta bussola, in parole — non tutti leggono i gradi al volo. */
export function compassLabel(degrees: number): string {
  const index = Math.round(degrees / 22.5) % 16
  return COMPASS_POINTS[index] ?? 'nord'
}

/** Link universale per navigazione: apre l'app mappe di sistema su telefono, Google Maps su desktop. */
export function directionsUrl(to: { latitude: number; longitude: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.latitude},${to.longitude}`
}
