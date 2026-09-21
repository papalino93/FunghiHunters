/**
 * Comuni italiani, tutti: la base geografica per uscire dalla Toscana.
 *
 * `istat-boundaries.ts` scarica i confini della sola Toscana (`limits_R_9_...`) e serve a un'altra
 * domanda: in quale comune cade il centro di una zona gia' decisa a mano. Qui si fa il contrario —
 * dai comuni si ricavano le zone — e serve quindi il file nazionale.
 *
 * **Due fonti, perche' nessuna delle due basta da sola.**
 * - Il GeoJSON nazionale (stesso mirror ISTAT gia' usato, CC-BY) da' geometria, nome, provincia e
 *   codice ISTAT, ma **non la regione**.
 * - Il CSV di `opendatasicilia/comuni-italiani` (stessi codici ISTAT) da' la regione.
 * Si uniscono sul codice ISTAT del comune, che e' la chiave reale di entrambi.
 *
 * **Cosa NON c'e' in nessuna delle due: la quota.** Va risolta a parte, sul terreno vero, ed e'
 * quello che fa `scripts/ingest-zones-italia.ts`. Usare l'altitudine del municipio sarebbe
 * sbagliato due volte: e' il centro abitato, non il bosco, e spesso sta nel fondovalle.
 */

import { fetchJson, fetchText } from '@/lib/sources/http'
import {
  parseBoundaries,
  ringCentroid,
  type MunicipalityCollection,
  type MunicipalityGeometry,
} from '@/lib/sources/istat-boundaries'

export const NATIONAL_BOUNDARIES_URL =
  'https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_IT_municipalities.geojson'

export const COMUNI_CSV_URL =
  'https://raw.githubusercontent.com/opendatasicilia/comuni-italiani/main/dati/comuni.csv'

export const NATIONAL_LICENSE = 'CC-BY (ISTAT, via guglielmo/geojson-italy e opendatasicilia/comuni-italiani)'

export interface RegionLookupEntry {
  readonly region: string
  readonly province: string
  readonly provinceAcronym: string
}

/**
 * Regione e provincia per codice ISTAT del comune.
 *
 * Parser minimo e deliberatamente severo: le colonne attese sono
 * `comune,pro_com_t,den_prov,sigla,den_reg,cod_reg`, e se l'intestazione cambia si ferma invece di
 * indovinare le posizioni. Un CSV letto male qui assegnerebbe zone alla regione sbagliata senza
 * che nulla sembri rotto.
 */
export function parseComuniCsv(text: string): Map<string, RegionLookupEntry> {
  const lines = text.trim().split(/\r?\n/)
  const header = lines[0]?.split(',') ?? []
  const idx = {
    code: header.indexOf('pro_com_t'),
    province: header.indexOf('den_prov'),
    acronym: header.indexOf('sigla'),
    region: header.indexOf('den_reg'),
  }
  if (Object.values(idx).some((i) => i < 0)) {
    throw new Error(`Intestazione CSV inattesa: ${header.join(',')}`)
  }

  const out = new Map<string, RegionLookupEntry>()
  for (const line of lines.slice(1)) {
    // I nomi di comune con virgola nel CSV sarebbero quotati: qui non ce ne sono, ma se comparissero
    // il conteggio delle colonne salterebbe e la riga verrebbe scartata invece di essere sbagliata.
    const cells = line.split(',')
    if (cells.length !== header.length) continue
    const code = cells[idx.code]
    const region = cells[idx.region]
    const province = cells[idx.province]
    const acronym = cells[idx.acronym]
    if (code === undefined || region === undefined || province === undefined || acronym === undefined) {
      continue
    }
    out.set(code, { region, province, provinceAcronym: acronym })
  }
  return out
}

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

/** Tutti i comuni con regione nota, come candidati zona. Il filtro per quota avviene dopo. */
export function buildCandidates(
  collection: MunicipalityCollection,
  regions: ReadonlyMap<string, RegionLookupEntry>,
): CandidateZone[] {
  const out: CandidateZone[] = []
  for (const feature of collection.features) {
    const lookup = regions.get(feature.properties.com_istat_code)
    if (lookup === undefined) continue
    const point = referencePoint(feature.geometry)
    out.push({
      istatCode: feature.properties.com_istat_code,
      name: feature.properties.name,
      region: lookup.region,
      province: lookup.province,
      provinceAcronym: lookup.provinceAcronym,
      latitude: Number(point.lat.toFixed(5)),
      longitude: Number(point.lon.toFixed(5)),
    })
  }
  return out
}

export async function fetchNationalBoundaries(): Promise<MunicipalityCollection> {
  // 36 MB: il timeout generoso non e' pigrizia, e' la dimensione reale del file.
  const data = await fetchJson<unknown>(NATIONAL_BOUNDARIES_URL, { timeoutMs: 180_000 })
  return parseBoundaries(data)
}

export async function fetchRegionLookup(): Promise<Map<string, RegionLookupEntry>> {
  return parseComuniCsv(await fetchText(COMUNI_CSV_URL, { timeoutMs: 60_000 }))
}
