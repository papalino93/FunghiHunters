/**
 * Adapter per l'archivio storico SIR (`dati.php`).
 *
 * Si usa **una volta sola**, per il backfill. L'endpoint non accetta alcun filtro temporale:
 * verificato il 2026-09-17 provando `&ANNO=2026`, `&DATA_INIZIO=`, `&FROM=&TO=` e `&LIMIT=`, che
 * restituiscono tutti esattamente gli stessi 387.693 byte. Ogni chiamata scarica l'intera serie
 * storica, per alcune stazioni dal 1961.
 *
 * Per l'aggiornamento quotidiano si usa `sir-geoserver`, che costa tre chiamate invece di
 * quattrocento.
 */

import { z } from 'zod'

import {
  type Observation,
  type Station,
  type StationMeasure,
  type Variable,
  isSourceQualityFlag,
} from '@/lib/domain/types'
import { repairMojibake } from '@/lib/normalize/mojibake'
import { parseNumeric, parseText } from '@/lib/normalize/values'
import { fetchJson } from '@/lib/sources/http'
import {
  LICENSES,
  type FetchObservationsRequest,
  type SourceCapabilities,
  type StationSourceAdapter,
} from '@/lib/sources/adapter'
import {
  SIR_MEASURES,
  SIR_PRIMARY_IDSTS,
  dayShiftToCanonical,
  measureByConsistencyKey,
  measureByIdst,
} from '@/lib/sources/sir-measures'
import { addDays, daysBetween } from '@/lib/domain/time'

const BASE_URL = 'https://www.sir.toscana.it/archivio/dati.php'

export const SIR_SOURCE_CODE = 'sir-toscana'

/**
 * Schema dell'anagrafica. Volutamente tollerante sui campi che non usiamo: un campo nuovo lato
 * fonte non deve far fallire l'ingestione.
 */
const stationsSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      geometry: z.object({
        type: z.literal('Point'),
        coordinates: z.tuple([z.number(), z.number()]).rest(z.number()),
      }),
      properties: z
        .object({
          Codice: z.string(),
          Nome: z.string(),
          Comune: z.unknown().optional(),
          Provincia: z.unknown().optional(),
          'Quota mslm': z.unknown().optional(),
          Consistenza: z
            .record(
              z.string(),
              z.object({
                Anni: z.array(z.union([z.array(z.string()), z.string()])).optional(),
                SorgenteDati: z.string().optional(),
              }),
            )
            .optional(),
        })
        .loose(),
    }),
  ),
})

const seriesSchema = z.object({
  features: z
    .array(
      z.object({
        properties: z.object({
          SerieDati: z.array(
            z.object({
              Data: z.string(),
              Valore: z.union([z.string(), z.number(), z.null()]),
              TipoValore: z.string().optional(),
            }),
          ),
        }),
      }),
    )
    .optional(),
  properties: z
    .object({
      SerieDati: z.array(
        z.object({
          Data: z.string(),
          Valore: z.union([z.string(), z.number(), z.null()]),
          TipoValore: z.string().optional(),
        }),
      ),
    })
    .optional(),
})

/** Appiattisce l'array di anni, che la fonte annida a un livello in piu' senza motivo evidente. */
function flattenYears(raw: ReadonlyArray<readonly string[] | string> | undefined): number[] {
  if (raw === undefined) return []
  const out: number[] = []
  for (const entry of raw) {
    const items = Array.isArray(entry) ? entry : [entry]
    for (const item of items) {
      const year = Number(item)
      if (Number.isInteger(year)) out.push(year)
    }
  }
  return out.sort((a, b) => a - b)
}

export function parseStations(payload: unknown): Station[] {
  const parsed = stationsSchema.parse(payload)
  const stations: Station[] = []

  for (const feature of parsed.features) {
    const props = feature.properties
    const [longitude, latitude] = feature.geometry.coordinates

    const measures: StationMeasure[] = []
    for (const [key, entry] of Object.entries(props.Consistenza ?? {})) {
      const spec = measureByConsistencyKey(key)
      if (spec === undefined) continue
      measures.push({
        variable: spec.variable,
        window: spec.window,
        years: flattenYears(entry.Anni),
        seriesUrl: entry.SorgenteDati ?? null,
      })
    }

    const nameRaw = props.Nome
    stations.push({
      code: props.Codice,
      name: repairMojibake(nameRaw),
      nameRaw,
      municipality: parseText(props.Comune) === null ? null : repairMojibake(String(props.Comune)),
      province: parseText(props.Provincia),
      elevationM: parseNumeric(props['Quota mslm']),
      latitude,
      longitude,
      sourceCode: SIR_SOURCE_CODE,
      measures,
    })
  }

  return stations
}

/** `true` se la stazione misura quella grandezza e dichiara dati per l'anno indicato. */
export function isStationActive(station: Station, variable: Variable, year: number): boolean {
  return station.measures.some((m) => m.variable === variable && m.years.includes(year))
}

/** Estrae la serie dal payload, che a seconda dell'endpoint e' GeoJSON o oggetto semplice. */
function extractSeries(payload: unknown): ReadonlyArray<{
  Data: string
  Valore: string | number | null
  TipoValore?: string | undefined
}> {
  const parsed = seriesSchema.parse(payload)
  const fromFeature = parsed.features?.[0]?.properties.SerieDati
  if (fromFeature !== undefined) return fromFeature
  if (parsed.properties !== undefined) return parsed.properties.SerieDati
  throw new Error('Serie SIR senza campo SerieDati')
}

export function parseSeries(
  payload: unknown,
  stationCode: string,
  idst: string,
): Observation[] {
  const spec = measureByIdst(idst)
  if (spec === undefined) throw new Error(`IDST sconosciuto: ${idst}`)

  const shift = dayShiftToCanonical(spec)
  const observations: Observation[] = []

  for (const record of extractSeries(payload)) {
    // `Data` e' "YYYY-MM-DD HH:MM:SS" in ora locale. La parte oraria codifica la finestra
    // (00:00 per 0-24, 09:00 per 9-9) ed e' gia' rappresentata da `spec.window`.
    const date = record.Data.slice(0, 10)
    const rawFlag = record.TipoValore ?? 'unknown'

    observations.push({
      stationCode,
      variable: spec.variable,
      window: spec.window,
      date: shift === 0 ? date : addDays(date, shift),
      value: parseNumeric(record.Valore),
      unit: spec.unit,
      sourceQualityFlag: isSourceQualityFlag(rawFlag) ? rawFlag : 'unknown',
      // I controlli veri girano dopo, in `qc`. Qui il dato e' solo normalizzato.
      qualityFlag: parseNumeric(record.Valore) === null ? 'missing' : 'ok',
      provenance: 'OBSERVED',
      sourceCode: SIR_SOURCE_CODE,
      sourceUpdatedAt: null,
    })
  }

  return observations
}

export function stationsUrl(): string {
  return `${BASE_URL}?D=json_stations`
}

export function seriesUrl(stationCode: string, idst: string): string {
  return `${BASE_URL}?IDST=${encodeURIComponent(idst)}&D=json&IDS=${encodeURIComponent(stationCode)}`
}

const CAPABILITIES: SourceCapabilities = {
  variables: [...new Set(SIR_MEASURES.map((m) => m.variable))],
  windows: [...new Set(SIR_MEASURES.map((m) => m.window))],
  supportsIncremental: false,
  // Verificato: ANNO, DATA_INIZIO, FROM/TO e LIMIT sono tutti ignorati.
  supportsDateRange: false,
  maxPointsPerRequest: 1,
}

export interface SirArchiveOptions {
  /** Millisecondi di pausa fra una stazione e l'altra: e' un archivio pubblico, non un'API. */
  readonly delayMs?: number
  readonly onProgress?: (done: number, total: number) => void
}

/**
 * Adapter dell'archivio storico. Scarica serie intere, una stazione per volta.
 * Usare solo per il backfill, e con `delayMs` non nullo.
 */
export class SirArchiveAdapter implements StationSourceAdapter {
  readonly sourceCode = SIR_SOURCE_CODE
  readonly license = LICENSES.sir
  readonly capabilities = CAPABILITIES

  constructor(private readonly options: SirArchiveOptions = {}) {}

  async listStations(): Promise<Station[]> {
    // 1.45 MB e circa 11 secondi di risposta: va cachata, non richiesta a ogni job.
    return parseStations(await fetchJson(stationsUrl(), { timeoutMs: 120_000 }))
  }

  async fetchObservations(request: FetchObservationsRequest = {}): Promise<Observation[]> {
    const stations = await this.listStations()
    const wanted =
      request.stationCodes === undefined
        ? stations
        : stations.filter((s) => request.stationCodes?.includes(s.code) === true)

    const idsts = SIR_PRIMARY_IDSTS.filter((idst) => {
      const spec = measureByIdst(idst)
      if (spec === undefined) return false
      return request.variables === undefined || request.variables.includes(spec.variable)
    })

    const jobs: Array<{ station: Station; idst: string }> = []
    for (const station of wanted) {
      for (const idst of idsts) {
        const spec = measureByIdst(idst)
        if (spec === undefined) continue
        const measured = station.measures.some(
          (m) => m.variable === spec.variable && m.window === spec.window,
        )
        if (measured) jobs.push({ station, idst })
      }
    }

    const out: Observation[] = []
    for (const [index, job] of jobs.entries()) {
      const payload = await fetchJson(seriesUrl(job.station.code, job.idst), {
        timeoutMs: 120_000,
      })
      out.push(...filterByRange(parseSeries(payload, job.station.code, job.idst), request))
      this.options.onProgress?.(index + 1, jobs.length)
      const delay = this.options.delayMs ?? 250
      if (delay > 0 && index < jobs.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
    return out
  }
}

/** Filtro a valle, dato che la fonte non sa filtrare da sola. */
function filterByRange(
  observations: readonly Observation[],
  request: FetchObservationsRequest,
): Observation[] {
  const range = request.range
  if (range === undefined) return [...observations]
  return observations.filter(
    (o) => daysBetween(range.start, o.date) >= 0 && daysBetween(o.date, range.end) >= 0,
  )
}
