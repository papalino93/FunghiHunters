/**
 * Geocodifica inversa (coordinate -> nome del posto), solo per "Usa la mia posizione" in Meteo.
 *
 * Open-Meteo non offre un endpoint inverso (solo ricerca per nome, vedi `open-meteo-place.ts`):
 * serve una fonte diversa. Nominatim (OpenStreetMap, licenza ODbL) è gratuito, senza chiave, e
 * la sua politica d'uso vieta la geocodifica di massa — non il caso qui: un tocco dell'utente,
 * una richiesta, mai in ciclo. `attempts: 1` apposta: se non risponde in tempo, meglio restare
 * con le coordinate già mostrate che far aspettare la previsione per un dettaglio accessorio.
 */

import { z } from 'zod'

import { fetchJson } from '@/lib/sources/http'

const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'

export interface ReversedPlace {
  /** Il riferimento più preciso disponibile: quartiere/frazione/paese, non le coordinate. */
  readonly name: string
  /** Il centro abitato più ampio, se distinto da `name` (es. "Scandicci" per "Capannuccia"). */
  readonly admin1: string | null
}

const reverseSchema = z.object({
  name: z.string().nullish(),
  address: z
    .object({
      suburb: z.string().nullish(),
      neighbourhood: z.string().nullish(),
      quarter: z.string().nullish(),
      hamlet: z.string().nullish(),
      village: z.string().nullish(),
      town: z.string().nullish(),
      city: z.string().nullish(),
      municipality: z.string().nullish(),
      county: z.string().nullish(),
    })
    .optional(),
})

/**
 * Pura: separata da `reverseGeocode` per essere testabile senza rete, su una fixture — stesso
 * principio di `parsePlaceForecast` in `open-meteo-place.ts`.
 *
 * Ordine di priorità dal più preciso al più ampio: un quartiere/frazione dice di più di un comune
 * intero, ma serve comunque il comune (`admin1`, un livello sotto) quando i due non coincidono —
 * "Capannuccia" da solo non basta a chi non conosce la zona, "Capannuccia, Scandicci" sì.
 */
export function parseReverseGeocode(payload: unknown): ReversedPlace | null {
  const parsed = reverseSchema.parse(payload)
  const address = parsed.address ?? {}

  const locality =
    address.suburb ?? address.neighbourhood ?? address.quarter ?? address.hamlet ?? address.village ?? null
  const city = address.town ?? address.city ?? address.municipality ?? null

  const name = locality ?? city ?? address.county ?? parsed.name ?? null
  if (name === null) return null

  const admin1 = city !== null && city !== name ? city : null
  return { name, admin1 }
}

/**
 * Il posto più preciso e leggibile per queste coordinate, o `null` se Nominatim non ha nulla
 * (mare aperto, alta quota fuori da ogni confine noto) o non risponde in tempo: mai un errore da
 * mostrare, perché le coordinate restano comunque visibili come riscontro.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<ReversedPlace | null> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    zoom: '14',
    'accept-language': 'it',
  })

  try {
    const payload = await fetchJson(`${REVERSE_URL}?${params.toString()}`, {
      timeoutMs: 5_000,
      attempts: 1,
    })
    return parseReverseGeocode(payload)
  } catch {
    return null
  }
}
