/**
 * Confini amministrativi ISTAT (comuni toscani), via il mirror GeoJSON `guglielmo/geojson-italy`.
 *
 * **Perché questa fonte e non un'altra.** Le altre candidate valutate (UCS, DTM, aree protette —
 * vedi `docs/CATALOGO-FONTI.md`) stanno tutte su domini che questa sessione non raggiunge:
 * `curl` a `dati.toscana.it` e a `www502.regione.toscana.it` viene rifiutato dal gateway di rete
 * con 403 di policy. `raw.githubusercontent.com` invece è raggiungibile, e questo repository
 * pubblica i confini ISTAT (comuni, province, regioni) in GeoJSON, CC-BY, derivati da ISTAT e
 * aggiornati a ogni variazione amministrativa — verificato scaricando davvero il file e facendo
 * girare la risoluzione punto-in-poligono sulle sette zone (vedi `scripts/ingest-admin-boundaries.ts`
 * e il suo output committato, `public/data/admin-boundaries.json`).
 *
 * **A cosa serve davvero.** Non al punteggio: serve a sapere con certezza in quale comune e
 * provincia cade il centro di una zona (o, in futuro, una cella), invece di un campo scritto a
 * mano. Ha già trovato un errore reale: `zones.ts` dichiarava "SI" (Siena) per le Colline
 * Metallifere, ma le coordinate della zona cadono a Montieri, che è in provincia di Grosseto —
 * vedi la correzione in `zones.ts` con la stessa data.
 */

import { fetchJson } from '@/lib/sources/http'

export const BOUNDARIES_URL =
  'https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_R_9_municipalities.geojson'

/** Licenza dichiarata dal repository sorgente: CC-BY, dati derivati da ISTAT. */
export const BOUNDARIES_LICENSE = 'CC-BY (ISTAT, via guglielmo/geojson-italy)'

export interface MunicipalityProperties {
  readonly name: string
  readonly prov_name: string
  readonly prov_acr: string
  /** Nome della regione, presente in ogni feature del mirror: vedi `istat-national.ts`. */
  readonly reg_name: string
  readonly com_istat_code: string
}

type Ring = ReadonlyArray<readonly [number, number]>

export interface MunicipalityGeometry {
  readonly type: 'Polygon' | 'MultiPolygon'
  /** Polygon: anelli diretti. MultiPolygon: un array di poligoni, ciascuno con i suoi anelli. */
  readonly coordinates: readonly Ring[] | readonly (readonly Ring[])[]
}

export interface MunicipalityFeature {
  readonly type: 'Feature'
  readonly properties: MunicipalityProperties
  readonly geometry: MunicipalityGeometry
}

export interface MunicipalityCollection {
  readonly type: 'FeatureCollection'
  readonly features: readonly MunicipalityFeature[]
}

/** Scarica e valida la struttura minima del GeoJSON. Non un parser generico: solo i campi usati. */
export async function fetchBoundaries(): Promise<MunicipalityCollection> {
  const data = await fetchJson<unknown>(BOUNDARIES_URL, { timeoutMs: 30_000 })
  return parseBoundaries(data)
}

export function parseBoundaries(data: unknown): MunicipalityCollection {
  if (
    typeof data !== 'object' ||
    data === null ||
    (data as { type?: unknown }).type !== 'FeatureCollection' ||
    !Array.isArray((data as { features?: unknown }).features)
  ) {
    throw new Error('Risposta non riconosciuta: non è una FeatureCollection GeoJSON.')
  }
  return data as MunicipalityCollection
}

/**
 * Ray casting su un anello. Standard, nessuna libreria: il problema è piccolo (273 comuni, sette
 * query) e non vale una dipendenza per un algoritmo di trenta righe.
 */
function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a === undefined || b === undefined) continue
    const [xi, yi] = a
    const [xj, yj] = b
    const crosses = yi > lat !== yj > lat
    if (crosses && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Un poligono e' dentro se e' dentro l'anello esterno e fuori da tutti i buchi. */
function pointInPolygonRings(lon: number, lat: number, rings: readonly Ring[]): boolean {
  const outer = rings[0]
  if (outer === undefined || !pointInRing(lon, lat, outer)) return false
  return !rings.slice(1).some((hole) => pointInRing(lon, lat, hole))
}

export function pointInGeometry(lon: number, lat: number, geometry: MunicipalityGeometry): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygonRings(lon, lat, geometry.coordinates as readonly Ring[])
  }
  return (geometry.coordinates as readonly (readonly Ring[])[]).some((rings) =>
    pointInPolygonRings(lon, lat, rings),
  )
}

/** Centroide approssimato dell'anello esterno: non l'area vera, basta a scegliere il più vicino. */
export function ringCentroid(ring: Ring): { lon: number; lat: number } {
  let lonSum = 0
  let latSum = 0
  for (const [lon, lat] of ring) {
    lonSum += lon
    latSum += lat
  }
  return { lon: lonSum / ring.length, lat: latSum / ring.length }
}

function nearestCentroid(lon: number, lat: number, geometry: MunicipalityGeometry): number {
  const outerRings: Ring[] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates[0] as Ring]
      : (geometry.coordinates as readonly (readonly Ring[])[]).map((rings) => rings[0] as Ring)
  let best = Infinity
  for (const ring of outerRings) {
    const c = ringCentroid(ring)
    const d = Math.hypot(c.lon - lon, c.lat - lat)
    if (d < best) best = d
  }
  return best
}

const EARTH_RADIUS_KM = 6371

function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const toRad = (d: number): number => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

export interface NearbyMunicipality {
  readonly municipality: string
  readonly province: string
  readonly provinceAcronym: string
  readonly istatCode: string
  readonly distanceKm: number
}

/**
 * Comuni reali il cui centroide (dell'anello esterno più vicino, per i MultiPolygon) cade entro
 * `radiusKm` dal punto dato, in ordine di distanza.
 *
 * Non è il confine della "zona" — le sette zone di taratura sono punti, non poligoni (vedi
 * `zones.ts`) — ma toponimi reali e verificabili attorno a quel punto, utili per orientarsi senza
 * inventare una precisione che il modello non ha. La distanza è in linea d'aria, calcolata col
 * centroide del comune: un'approssimazione dichiarata, non il confine amministrativo vero.
 */
export function nearbyMunicipalities(
  lon: number,
  lat: number,
  collection: MunicipalityCollection,
  radiusKm: number,
): NearbyMunicipality[] {
  const out: NearbyMunicipality[] = []
  for (const feature of collection.features) {
    const outerRings: Ring[] =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates[0] as Ring]
        : (feature.geometry.coordinates as readonly (readonly Ring[])[]).map((r) => r[0] as Ring)

    let best = Infinity
    for (const ring of outerRings) {
      const centroid = ringCentroid(ring)
      const distance = haversineKm(lon, lat, centroid.lon, centroid.lat)
      if (distance < best) best = distance
    }

    if (best <= radiusKm) {
      out.push({
        municipality: feature.properties.name,
        province: feature.properties.prov_name,
        provinceAcronym: feature.properties.prov_acr,
        istatCode: feature.properties.com_istat_code,
        distanceKm: best,
      })
    }
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm)
}

export type MatchType = 'exact' | 'nearest-fallback'

export interface MunicipalityMatch {
  readonly municipality: string
  readonly province: string
  readonly provinceAcronym: string
  readonly istatCode: string
  readonly matchType: MatchType
}

/**
 * Trova il comune che contiene il punto. Se nessun poligono lo contiene — può succedere su un
 * confine, per l'arrotondamento delle coordinate del punto o per una semplificazione geometrica
 * — ripiega sul comune il cui anello esterno ha il centroide più vicino, marcato come tale invece
 * di restituire un risultato indistinguibile da una corrispondenza esatta. Non e' un errore da
 * nascondere: e' il tipo di degrado esplicito richiesto altrove in questo progetto.
 */
export function findMunicipality(
  lon: number,
  lat: number,
  collection: MunicipalityCollection,
): MunicipalityMatch | null {
  if (collection.features.length === 0) return null

  for (const feature of collection.features) {
    if (pointInGeometry(lon, lat, feature.geometry)) {
      return {
        municipality: feature.properties.name,
        province: feature.properties.prov_name,
        provinceAcronym: feature.properties.prov_acr,
        istatCode: feature.properties.com_istat_code,
        matchType: 'exact',
      }
    }
  }

  let bestFeature: MunicipalityFeature | null = null
  let bestDistance = Infinity
  for (const feature of collection.features) {
    const d = nearestCentroid(lon, lat, feature.geometry)
    if (d < bestDistance) {
      bestDistance = d
      bestFeature = feature
    }
  }
  if (bestFeature === null) return null
  return {
    municipality: bestFeature.properties.name,
    province: bestFeature.properties.prov_name,
    provinceAcronym: bestFeature.properties.prov_acr,
    istatCode: bestFeature.properties.com_istat_code,
    matchType: 'nearest-fallback',
  }
}
