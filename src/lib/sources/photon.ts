/**
 * Ricerca di un posto per nome, per mettere un'uscita del diario nel punto giusto: un lago, una
 * località, un sentiero, una chiesa in mezzo al bosco («Lago di San Zanobi»), non solo i comuni.
 *
 * Photon (komoot) cerca nei dati di OpenStreetMap (licenza ODbL), senza chiave, e a differenza di
 * Nominatim ammette la ricerca mentre si scrive. La geocodifica di Open-Meteo, usata dal meteo,
 * conosce solo i centri abitati: un lago o una pieve non li trova.
 *
 * La chiamata parte dal nostro server (`/api/luoghi`), non dal browser: al servizio arriva la
 * parola cercata, non l'indirizzo IP di chi cerca.
 */

import { z } from 'zod'

import { fetchJson } from '@/lib/sources/http'

const SEARCH_URL = 'https://photon.komoot.io/api/'
/** L'Italia (con un margine), per non proporre un "Lago di San Zanobi" in Brasile. */
const ITALY_BBOX = '6.5,35.3,18.6,47.1'

export interface FoundPlace {
  readonly name: string
  /** Dove si trova, per distinguere omonimi: «Scandicci, Firenze». */
  readonly detail: string
  /** Che cosa è, in parole: «lago», «località», «chiesa». Vuoto se non lo sappiamo dire. */
  readonly kind: string
  readonly latitude: number
  readonly longitude: number
}

const featureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]).rest(z.number()) }),
  properties: z.object({
    name: z.string().nullish(),
    osm_key: z.string().nullish(),
    osm_value: z.string().nullish(),
    city: z.string().nullish(),
    town: z.string().nullish(),
    village: z.string().nullish(),
    district: z.string().nullish(),
    county: z.string().nullish(),
    state: z.string().nullish(),
    country: z.string().nullish(),
    countrycode: z.string().nullish(),
    street: z.string().nullish(),
  }),
})
const searchSchema = z.object({ features: z.array(z.unknown()) })

const KIND: Readonly<Record<string, string>> = {
  'natural:water': 'specchio d’acqua',
  'water:reservoir': 'lago',
  'water:lake': 'lago',
  'water:pond': 'laghetto',
  'natural:peak': 'cima',
  'natural:saddle': 'passo',
  'natural:wood': 'bosco',
  'landuse:forest': 'bosco',
  'natural:spring': 'sorgente',
  'waterway:river': 'fiume',
  'waterway:stream': 'torrente',
  'place:hamlet': 'località',
  'place:locality': 'località',
  'place:isolated_dwelling': 'casolare',
  'place:village': 'paese',
  'place:town': 'comune',
  'place:city': 'città',
  'place:suburb': 'frazione',
  'amenity:place_of_worship': 'chiesa',
  'amenity:parking': 'parcheggio',
  'tourism:alpine_hut': 'rifugio',
  'tourism:picnic_site': 'area picnic',
  'highway:path': 'sentiero',
  'highway:track': 'strada forestale',
  'mountain_pass:yes': 'passo',
}

function kindOf(key: string | null | undefined, value: string | null | undefined): string {
  if (key == null || value == null) return ''
  return KIND[`${key}:${value}`] ?? KIND[`${key}:*`] ?? ''
}

/** Pura, per provarla senza rete su una risposta vera. */
export function parsePhotonSearch(payload: unknown): FoundPlace[] {
  const parsed = searchSchema.safeParse(payload)
  if (!parsed.success) return []
  const out: FoundPlace[] = []
  const seen = new Set<string>()
  for (const raw of parsed.data.features) {
    const feature = featureSchema.safeParse(raw)
    if (!feature.success) continue
    const p = feature.data.properties
    if (p.countrycode != null && p.countrycode.toUpperCase() !== 'IT') continue
    const [longitude, latitude] = feature.data.geometry.coordinates
    const place = p.city ?? p.town ?? p.village ?? p.district ?? null
    const name = p.name ?? p.street ?? place
    if (name == null) continue
    const parts = [place !== name ? place : null, p.county !== place ? p.county : null].filter(
      (x): x is string => x != null && x !== '',
    )
    const detail = parts.length > 0 ? parts.join(', ') : (p.state ?? '')
    // Lo stesso posto torna spesso due volte (il lago come area e come punto): uno basta.
    const key = `${name}|${detail}|${latitude.toFixed(2)}|${longitude.toFixed(2)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, detail, kind: kindOf(p.osm_key, p.osm_value), latitude, longitude })
  }
  return out
}

export function photonSearchUrl(query: string, near?: { latitude: number; longitude: number }): string {
  const params = new URLSearchParams({ q: query.trim(), limit: '8', bbox: ITALY_BBOX })
  // Vicino alla zona scelta prima: «San Zanobi» a Scandicci prima di quello di Firenze centro.
  // Un decimale (circa 10 km) anche qui, qualunque cosa arrivi: al servizio basta la zona.
  if (near !== undefined) {
    params.set('lat', near.latitude.toFixed(1))
    params.set('lon', near.longitude.toFixed(1))
  }
  return `${SEARCH_URL}?${params.toString()}`
}

export async function searchOsmPlaces(
  query: string,
  near?: { latitude: number; longitude: number },
): Promise<FoundPlace[]> {
  const payload = await fetchJson(photonSearchUrl(query, near), { timeoutMs: 6_000, attempts: 2 })
  return parsePhotonSearch(payload)
}
