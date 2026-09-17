/**
 * Adapter incrementale SIR, via GeoServer OGC.
 *
 * E' il cuore dell'aggiornamento quotidiano. `geo.sir.toscana.it` espone dei layer con i valori
 * aggregati **del giorno precedente per tutte le stazioni insieme**: tre richieste, circa
 * 400 KB, meno di un secondo. La stessa copertura via `dati.php` costerebbe circa 400 richieste
 * e 156 MB al giorno.
 *
 * Misure del 2026-09-17:
 *   sir_pluviometri_valori_ieri_pubblico   417 feature, 151 KB, 0.24 s
 *   sir_pluviometri_valori_ieri9_pubblico  417 feature, 151 KB, 0.20 s
 *   sir_termometri_valori_ieri_pubblico    263 feature, 102 KB, 0.20 s
 *
 * Validato incrociando con `dati.php`: il layer riporta `dataora 2026-09-16T07:00:00Z, valore 0`
 * dove l'archivio riporta `Data 2026-09-16 09:00:00, Valore "0.0"`.
 *
 * L'endpoint non e' documentato sul portale: l'ho trovato risalendo alla risorsa GeoJSON del
 * dataset CKAN `pluviometri`. Puo' cambiare senza preavviso, quindi chi lo usa deve prevedere il
 * ripiego su `sir-archive` (vedi `ingest/daily`).
 */

import { z } from 'zod'

import {
  type AggregationWindow,
  type Observation,
  type Variable,
} from '@/lib/domain/types'
import { attributedDateFromLabel } from '@/lib/domain/time'
import { repairMojibake } from '@/lib/normalize/mojibake'
import { parseNumeric } from '@/lib/normalize/values'
import { fetchJson } from '@/lib/sources/http'
import {
  LICENSES,
  type FetchObservationsRequest,
  type SourceCapabilities,
  type StationSourceAdapter,
} from '@/lib/sources/adapter'
import { SIR_SOURCE_CODE, parseStations, stationsUrl } from '@/lib/sources/sir-archive'
import type { Station } from '@/lib/domain/types'

const OWS_URL = 'https://geo.sir.toscana.it/geoserver/geo/ows'

/** Un layer di valori giornalieri e le grandezze che ne estraiamo. */
interface DailyLayerSpec {
  readonly layer: string
  readonly window: AggregationWindow
  /** Mappa dal campo del GeoJSON alla nostra grandezza. */
  readonly fields: ReadonlyArray<{ field: string; variable: Variable; unit: string }>
}

export const SIR_DAILY_LAYERS: readonly DailyLayerSpec[] = [
  {
    layer: 'sir_pluviometri_valori_ieri_pubblico',
    window: '0_24',
    fields: [{ field: 'valore', variable: 'precipitation', unit: 'mm' }],
  },
  {
    layer: 'sir_pluviometri_valori_ieri9_pubblico',
    window: '9_9',
    fields: [{ field: 'valore', variable: 'precipitation', unit: 'mm' }],
  },
  {
    layer: 'sir_termometri_valori_ieri_pubblico',
    // Le temperature SIR esistono solo nella finestra 9-9: non c'e' una variante 0-24.
    window: '9_9',
    fields: [
      { field: 't_max', variable: 'temperature_max', unit: 'degC' },
      { field: 't_min', variable: 'temperature_min', unit: 'degC' },
      { field: 't_med', variable: 'temperature_mean', unit: 'degC' },
    ],
  },
]

/**
 * `dataora` puo' essere `null`.
 *
 * Non e' un caso teorico: nel layer termometrico del 2026-09-17 due stazioni su 263 hanno
 * `dataora: null` insieme a tutti i valori nulli. Sono stazioni che quel giorno non hanno
 * trasmesso. Non e' un dato da scartare in silenzio: il fatto che una stazione sia muta e'
 * esattamente cio' che il controllo di qualita' deve vedere per marcarla offline.
 */
const featureCollectionSchema = z.object({
  features: z.array(
    z.object({
      properties: z
        .object({
          idstazione: z.string(),
          nome: z.string().nullish(),
          dataora: z.string().nullish(),
          data_aggiornamento: z.string().nullish(),
        })
        .loose(),
    }),
  ),
})

export function featureUrl(layer: string): string {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName: `geo:${layer}`,
    outputFormat: 'application/json',
  })
  return `${OWS_URL}?${params.toString()}`
}

/**
 * Giorno di riferimento del layer, dedotto dalla maggioranza delle etichette valide.
 *
 * Serve per poter attribuire un giorno anche alle stazioni mute, quelle con `dataora: null`.
 * Usiamo la moda e non il primo valore perche' un singolo record sfasato non deve spostare
 * l'intero layer.
 */
export function inferLayerDate(payload: unknown): string | null {
  const parsed = featureCollectionSchema.parse(payload)
  const counts = new Map<string, number>()
  for (const feature of parsed.features) {
    const label = feature.properties.dataora
    if (label === null || label === undefined) continue
    const date = attributedDateFromLabel(label)
    counts.set(date, (counts.get(date) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [date, count] of counts) {
    if (count > bestCount) {
      best = date
      bestCount = count
    }
  }
  return best
}

/** Converte un layer di valori giornalieri in osservazioni normalizzate. */
export function parseDailyLayer(payload: unknown, spec: DailyLayerSpec): Observation[] {
  const parsed = featureCollectionSchema.parse(payload)
  const layerDate = inferLayerDate(payload)
  const observations: Observation[] = []

  for (const feature of parsed.features) {
    const props = feature.properties
    // `dataora` e' UTC: 2026-09-15T22:00:00Z e' la mezzanotte italiana del 16 in ora legale.
    // La conversione al giorno locale e' l'unico punto in cui questo va gestito.
    const label = props.dataora
    const date = label === null || label === undefined ? layerDate : attributedDateFromLabel(label)
    // Senza nemmeno un'etichetta valida nell'intero layer non sappiamo di che giorno parliamo:
    // meglio nessuna riga che una riga datata a caso.
    if (date === null) continue

    const silent = label === null || label === undefined
    const updatedAt = props.data_aggiornamento ?? null

    for (const field of spec.fields) {
      const value = silent ? null : parseNumeric(props[field.field])
      observations.push({
        stationCode: props.idstazione,
        variable: field.variable,
        window: spec.window,
        date,
        value,
        unit: field.unit,
        // Questo endpoint non espone `TipoValore`: i dati recenti non sono comunque validati.
        sourceQualityFlag: 'unknown',
        qualityFlag: value === null ? 'missing' : 'ok',
        provenance: 'OBSERVED',
        sourceCode: SIR_SOURCE_CODE,
        sourceUpdatedAt: updatedAt,
      })
    }
  }

  return observations
}

/** Nomi di stazione visti nel layer, gia' riparati dalla codifica. */
export function parseStationNames(payload: unknown): Map<string, string> {
  const parsed = featureCollectionSchema.parse(payload)
  const names = new Map<string, string>()
  for (const feature of parsed.features) {
    const raw = feature.properties.nome
    // Una stazione muta puo' avere anche il nome nullo: la saltiamo, l'anagrafica lo sa comunque.
    if (raw !== null && raw !== undefined) {
      names.set(feature.properties.idstazione, repairMojibake(raw))
    }
  }
  return names
}

const CAPABILITIES: SourceCapabilities = {
  variables: [
    'precipitation',
    'temperature_max',
    'temperature_min',
    'temperature_mean',
  ],
  windows: ['0_24', '9_9'],
  supportsIncremental: true,
  // Espone solo "ieri": non e' un intervallo, e' l'ultimo giorno disponibile.
  supportsDateRange: false,
  maxPointsPerRequest: null,
}

/**
 * Adapter incrementale. Restituisce **solo l'ultimo giorno disponibile**: non e' una limitazione
 * aggirabile, e' cio' che il layer contiene. Per i buchi piu' vecchi si torna all'archivio.
 */
export class SirGeoserverAdapter implements StationSourceAdapter {
  readonly sourceCode = SIR_SOURCE_CODE
  readonly license = LICENSES.sir
  readonly capabilities = CAPABILITIES

  async listStations(): Promise<Station[]> {
    return parseStations(await fetchJson(stationsUrl(), { timeoutMs: 120_000 }))
  }

  async fetchObservations(request: FetchObservationsRequest = {}): Promise<Observation[]> {
    const layers = SIR_DAILY_LAYERS.filter((spec) =>
      request.variables === undefined
        ? true
        : spec.fields.some((f) => request.variables?.includes(f.variable) === true),
    )

    const batches = await Promise.all(
      layers.map(async (spec) => {
        const payload = await fetchJson(featureUrl(spec.layer), { timeoutMs: 60_000 })
        return parseDailyLayer(payload, spec)
      }),
    )

    let observations = batches.flat()
    if (request.variables !== undefined) {
      const wanted = new Set<Variable>(request.variables)
      observations = observations.filter((o) => wanted.has(o.variable))
    }
    if (request.stationCodes !== undefined) {
      const wanted = new Set(request.stationCodes)
      observations = observations.filter((o) => wanted.has(o.stationCode))
    }
    return observations
  }

  /** L'istante in cui la fonte dichiara di aver aggiornato un layer. Utile per la salute fonti. */
  async fetchLayerFreshness(layer: string): Promise<string | null> {
    const payload = await fetchJson(featureUrl(layer), { timeoutMs: 60_000 })
    const parsed = featureCollectionSchema.parse(payload)
    return parsed.features[0]?.properties.data_aggiornamento ?? null
  }
}
