/**
 * Comuni italiani, tutti: la base geografica per uscire dalla Toscana.
 *
 * `istat-boundaries.ts` scarica i confini della sola Toscana (`limits_R_9_...`) e serve a un'altra
 * domanda: in quale comune cade il centro di una zona gia' decisa a mano. Qui si fa il contrario —
 * dai comuni si ricavano le zone — e serve quindi il file nazionale.
 *
 * **Una fonte sola, e il motivo e' una lezione pagata.** All'inizio la regione arrivava da un CSV
 * esterno (`opendatasicilia/comuni-italiani`) unito al GeoJSON sul codice ISTAT del comune. Il
 * primo catalogo vero, il 21/09/2026, e' uscito senza la Sardegna: 383 comuni su 7.896 non
 * trovavano la loro riga. Il motivo e' la riorganizzazione delle province sarde — il GeoJSON usa
 * i codici nuovi (Fonni e' `114013`), il CSV quelli vecchi (`091013`) — e l'unione falliva in
 * silenzio, cioe' nel modo peggiore: un'isola intera spariva senza un errore.
 * Il GeoJSON pero' la regione ce l'aveva gia', in `reg_name`. Verificato sul file vero: 7.896
 * feature, 20 regioni su 20, nessun campo mancante, nessun codice duplicato. Quindi il CSV non
 * serviva e la sua unica conseguenza era un buco. Via il CSV, via il buco.
 *
 * **Cosa NON c'e' in nessuna delle due: la quota.** Va risolta a parte, sul terreno vero, ed e'
 * quello che fa `scripts/ingest-zones-italia.ts`. Usare l'altitudine del municipio sarebbe
 * sbagliato due volte: e' il centro abitato, non il bosco, e spesso sta nel fondovalle.
 */

import { fetchJson } from '@/lib/sources/http'
import {
  parseBoundaries,
  ringCentroid,
  type MunicipalityCollection,
  type MunicipalityGeometry,
} from '@/lib/sources/istat-boundaries'

export const NATIONAL_BOUNDARIES_URL =
  'https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_IT_municipalities.geojson'

export const NATIONAL_LICENSE = 'CC-BY (ISTAT, via guglielmo/geojson-italy)'

/**
 * Punto di riferimento del comune: il centroide del suo anello esterno piu' esteso.
 *
 * **E' un'approssimazione, e va detta.** Non e' un punto nel bosco ne' il municipio: e' il centro
 * geometrico della forma amministrativa. Per un comune montano compatto cade in genere in quota,
 * per uno lungo e stretto puo' cadere in un punto che non rappresenta bene nessuna delle sue parti.
 * La quota poi viene risolta sul terreno reale proprio in quel punto, quindi punto e quota restano
 * coerenti fra loro: cio' che non garantiscono e' di essere il punto migliore del comune.
 */
export function referencePoint(geometry: MunicipalityGeometry): { lon: number; lat: number } {
  const outerRings =
    geometry.type === 'Polygon'
      ? [geometry.coordinates[0] as ReadonlyArray<readonly [number, number]>]
      : (geometry.coordinates as readonly (readonly ReadonlyArray<readonly [number, number]>[])[]).map(
          (rings) => rings[0] as ReadonlyArray<readonly [number, number]>,
        )

  let best = outerRings[0] as ReadonlyArray<readonly [number, number]>
  for (const ring of outerRings) {
    if (ring.length > best.length) best = ring
  }
  return ringCentroid(best)
}

export interface CandidateZone {
  /** Codice ISTAT del comune: chiave stabile e reale, non un progressivo inventato. */
  readonly istatCode: string
  readonly name: string
  readonly region: string
  readonly province: string
  readonly provinceAcronym: string
  readonly latitude: number
  readonly longitude: number
}

/**
 * Tutti i comuni come candidati zona. Il filtro per quota avviene dopo.
 *
 * Non scarta nulla: ogni feature del file porta gia' nome, provincia, sigla, regione e codice, e
 * un comune che sparisse qui sparirebbe in silenzio — che e' esattamente come si era persa la
 * Sardegna. Se un campo mancasse davvero, e' meglio accorgersene con un errore piu' avanti che
 * con una regione vuota nel menu.
 */
export function buildCandidates(collection: MunicipalityCollection): CandidateZone[] {
  return collection.features.map((feature) => {
    const point = referencePoint(feature.geometry)
    return {
      istatCode: feature.properties.com_istat_code,
      name: feature.properties.name,
      region: feature.properties.reg_name,
      province: feature.properties.prov_name,
      provinceAcronym: feature.properties.prov_acr,
      latitude: Number(point.lat.toFixed(5)),
      longitude: Number(point.lon.toFixed(5)),
    }
  })
}

export async function fetchNationalBoundaries(): Promise<MunicipalityCollection> {
  // 36 MB: il timeout generoso non e' pigrizia, e' la dimensione reale del file.
  const data = await fetchJson<unknown>(NATIONAL_BOUNDARIES_URL, { timeoutMs: 180_000 })
  return parseBoundaries(data)
}
