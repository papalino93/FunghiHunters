/**
 * Punti salvati: dove ho lasciato l'auto, l'accesso al sentiero, un bivio, un punto di partenza.
 *
 * Diverso dal diario apposta: qui non c'è un esito da calibrare, solo un posto e un'ora. Niente
 * riservatezza a più livelli (`PrivacyLevel`) perché un punto salvato serve solo a chi l'ha
 * salvato, sul suo stesso dispositivo — non è mai condiviso né sincronizzato, con nessuno, mai.
 *
 * **Associazione a un'uscita, facoltativa.** `entryId` lega un punto a una voce del diario quando
 * ha senso ("il bivio di questa camminata"), `null` quando è un punto fisso riusabile ("casa",
 * "il parcheggio dove vado sempre") — sono i punti di partenza preferiti, vedi
 * `src/components/today/LocationPrompt.tsx`. Un punto non è mai mostrato in entrambe le liste:
 * o ha un `entryId`, o non ce l'ha, mai i due insieme.
 */

export const WAYPOINT_KINDS = ['car', 'access', 'reference', 'departure'] as const
export type WaypointKind = (typeof WAYPOINT_KINDS)[number]

export interface Waypoint {
  readonly id: string
  /** Uscita a cui appartiene, `null` se è un punto fisso (es. un punto di partenza preferito). */
  readonly entryId: string | null
  readonly kind: WaypointKind
  readonly label: string
  readonly latitude: number
  readonly longitude: number
  readonly createdAt: string
}

export interface WaypointDraft {
  readonly entryId?: string | null
  readonly kind: WaypointKind
  readonly label: string
  readonly latitude: number
  readonly longitude: number
}

/**
 * Com'è fatto davvero un punto letto da IndexedDB: può mancare `entryId` (punti salvati prima di
 * questo campo) e `kind` può essere `'point'`, il valore generico usato prima che i punti
 * avessero quattro categorie.
 */
export type StoredWaypoint = Omit<Partial<Waypoint>, 'kind'> & {
  readonly id: string
  readonly kind: string
}

/**
 * Riporta un punto salvato alla forma corrente.
 *
 * `'point'` (il valore generico di prima) diventa `'reference'`, la categoria più vicina nel
 * significato — "un posto a cui tornare", non un'auto né un accesso né una base di partenza.
 * Un punto senza `entryId` (salvato prima che esistesse questo campo) diventa un punto fisso:
 * è il comportamento che aveva già, dato che prima non poteva appartenere a nessuna uscita.
 */
export function normaliseWaypoint(raw: StoredWaypoint): Waypoint {
  const kind: WaypointKind = (WAYPOINT_KINDS as readonly string[]).includes(raw.kind)
    ? (raw.kind as WaypointKind)
    : 'reference'
  return {
    id: raw.id,
    entryId: raw.entryId ?? null,
    kind,
    label: raw.label ?? 'Punto',
    latitude: raw.latitude ?? 0,
    longitude: raw.longitude ?? 0,
    createdAt: raw.createdAt ?? new Date(0).toISOString(),
  }
}

/** Punti fissi: non appartengono a nessuna uscita. Include i punti di partenza preferiti. */
export function unassociatedWaypoints(points: readonly Waypoint[]): Waypoint[] {
  return points.filter((p) => p.entryId === null)
}

/** Punti salvati per una specifica uscita del diario. */
export function waypointsForEntry(points: readonly Waypoint[], entryId: string): Waypoint[] {
  return points.filter((p) => p.entryId === entryId)
}

/** Punti di partenza preferiti: punti fissi di categoria `departure` — vedi `LocationPrompt`. */
export function departurePoints(points: readonly Waypoint[]): Waypoint[] {
  return unassociatedWaypoints(points).filter((p) => p.kind === 'departure')
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

/**
 * Link universale per navigazione: apre l'app mappe di sistema su telefono, Google Maps su
 * desktop. **Chi lo tocca condivide quella coordinata con l'app che si apre** — è l'unico punto
 * di tutta questa funzione in cui una posizione lascia il dispositivo, ed è un gesto esplicito
 * dell'utente, mai automatico.
 */
export function directionsUrl(to: { latitude: number; longitude: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.latitude},${to.longitude}`
}
