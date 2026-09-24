/**
 * L'ultima zona aperta, per precompilare il diario.
 *
 * Il modulo "Registra un'uscita" proponeva sempre la prima zona dello snapshot (Monte Amiata),
 * anche a chi aveva appena guardato il Mugello: un campo in più da correggere proprio nel momento
 * in cui si vuole scrivere in fretta, e un'occasione per registrare un'uscita sulla zona sbagliata.
 * Resta solo sul dispositivo, come le altre preferenze di questo tipo: non è una posizione, è il
 * codice di una zona del catalogo.
 */

const KEY = 'fungicast:last-zone'

export function rememberLastZone(code: string): void {
  try {
    localStorage.setItem(KEY, code)
  } catch {
    // Storage bloccato: il diario tornerà a proporre la prima zona, nient'altro.
  }
}

/** Il codice salvato, se esiste fra `available`; altrimenti `fallback`. */
export function lastZoneOr(available: readonly string[], fallback: string): string {
  try {
    const code = localStorage.getItem(KEY)
    return code !== null && available.includes(code) ? code : fallback
  } catch {
    return fallback
  }
}

/** Nome e coordinate dell'ultima zona aperta, per offrirne il meteo senza doverla cercare. */
export interface LastZonePlace {
  readonly code: string
  readonly name: string
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number | null
}

const PLACE_KEY = 'fungicast:last-zone-place'

export function rememberLastZonePlace(place: LastZonePlace): void {
  rememberLastZone(place.code)
  try {
    localStorage.setItem(PLACE_KEY, JSON.stringify(place))
  } catch {
    // Come sopra: senza storage il meteo si apre vuoto, com'era prima.
  }
}

export function readLastZonePlace(): LastZonePlace | null {
  try {
    const raw = localStorage.getItem(PLACE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<LastZonePlace>
    if (
      typeof parsed.code !== 'string' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.latitude !== 'number' ||
      typeof parsed.longitude !== 'number'
    ) {
      return null
    }
    return {
      code: parsed.code,
      name: parsed.name,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      elevationM: typeof parsed.elevationM === 'number' ? parsed.elevationM : null,
    }
  } catch {
    return null
  }
}
