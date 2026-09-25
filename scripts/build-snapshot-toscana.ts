/**
 * Lo snapshot di tutti i comuni boscati della Toscana, con i pluviometri della Regione.
 *
 *   npx tsx scripts/build-snapshot-toscana.ts [--cell 0.12]
 *
 * **Perche' esiste.** Fino al 25/09/2026 la Toscana aveva le sette zone di taratura e 24 comuni
 * del catalogo nazionale, tutti sopra i 500 m e con la pioggia del solo modello meteo. Una
 * segnalazione da Roveta (Scandicci, porcini trovati) ha mostrato i due buchi insieme: la zona piu'
 * vicina era a 36 km, e il modello dava 7 mm dove il pluviometro SIR di Vingone ne misurava 91.
 * Qui ogni comune toscano con abbastanza bosco diventa una zona, e pioggia e temperature vengono
 * dall'interpolazione delle stazioni SIR, come per le sette zone storiche.
 *
 * **Cosa scrive.** `public/data/regioni/toscana.json` (lo stesso file che prima scriveva il
 * calcolo nazionale per i suoi 24 comuni) e le voci toscane di `public/data/italia-index.json`.
 * Il calcolo nazionale, quando trova il catalogo toscano, salta la Toscana e ne riprende le voci
 * da questo file (vedi `TUSCANY_OWNED` in `build-snapshot-italia.ts`).
 *
 * **Quanto costa.** A Open-Meteo si chiede solo quello che le stazioni non misurano (evapotra-
 * spirazione, suolo, aria, vento) e la previsione, con una storia corta: ~3,6 chiamate pesate per
 * zona. Al SIR, una serie per stazione e grandezza: una stazione per cella di `--cell` gradi.
 */

import { readFile, writeFile } from 'node:fs/promises'

import { ALGORITHM_V1, uncalibratedParams } from '@/lib/config/algorithm'
import { addDays, today } from '@/lib/domain/time'
import type { Station, Variable } from '@/lib/domain/types'
import { annotate } from '@/lib/pipeline/ci-report'
import {
  buildForecastUrl,
  chunkPoints,
  forecastWeightPerPoint,
  toModelSeries,
  type OpenMeteoResponse,
} from '@/lib/pipeline/open-meteo-series'
import type { DailySamples } from '@/lib/pipeline/zone-series'
import { buildZoneSnapshot } from '@/lib/pipeline/zone-snapshot'
import { distanceKm } from '@/lib/qc/checks'
import { hasValidShape } from '@/lib/snapshot/load'
import { SNAPSHOT_SCHEMA_VERSION } from '@/lib/snapshot/types'
import type { Snapshot, SnapshotSource, SnapshotZone } from '@/lib/snapshot/types'
import { LICENSES } from '@/lib/sources/adapter'
import { fetchJson } from '@/lib/sources/http'
import { OPEN_METEO_FREE_LIMITS, RatePacer } from '@/lib/sources/open-meteo-rate'
import { isStationActive, parseSeries, parseStations, seriesUrl, stationsUrl } from '@/lib/sources/sir-archive'
import type { StationSample } from '@/lib/spatial/interpolate'
import type { ForestFile } from '@/../scripts/ingest-forest-italia'
import type { ItalianZone } from '@/../scripts/ingest-zones-italia'
import { keptIndexEntry, type ItaliaIndex } from '@/../scripts/build-snapshot-italia'

/** 26 giorni di finestra idrica + 14 mostrati + margine: bastano, e costano meno dei 60 nazionali. */
const HISTORY_DAYS = 42
const FORECAST_DAYS = 8
const DISPLAY_PAST_DAYS = 14

/**
 * Sotto questa quota di bosco attorno al punto un comune non diventa zona: pianura, citta',
 * coltivi. E' la soglia oltre la quale il termine del bosco (`habitat.coverReference`) non toglie
 * piu' nulla, cioe' dove il modello considera il bosco "abbastanza".
 */
export const MIN_FOREST_FRACTION = ALGORITHM_V1.habitat.coverReference.value

export const TUSCANY_ZONES_FILE = 'public/data/zones-toscana.json'
export const TUSCANY_FOREST_FILE = 'public/data/forest-toscana.json'
const REGION_FILE = 'public/data/regioni/toscana.json'
const INDEX_FILE = 'public/data/italia-index.json'

const STATION_NOTE =
  'Pioggia e temperature dalle stazioni del Servizio Idrologico della Regione Toscana, ' +
  'interpolate sul punto della zona; il resto (suolo, aria, vento) e la previsione dal modello meteo.'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback
}

function toSample(station: Station, value: number): StationSample {
  return {
    stationCode: station.code,
    latitude: station.latitude,
    longitude: station.longitude,
    elevationM: station.elevationM ?? 0,
    value,
    validated: false,
  }
}

/** Le zone toscane da calcolare: i comuni del catalogo con abbastanza bosco misurato. Pura. */
export function selectTuscanZones(
  zones: readonly ItalianZone[],
  forest: ReadonlyMap<string, { forestFraction: number }>,
  minForest = MIN_FOREST_FRACTION,
): ItalianZone[] {
  return zones.filter((z) => (forest.get(z.code)?.forestFraction ?? 0) >= minForest)
}

/**
 * Una stazione per cella: la piu' vicina al centro della cella, cosi' la rete copre la regione in
 * modo uniforme invece di addensarsi nella piana fiorentina. Pura.
 */
export function pickStations(stations: readonly Station[], cellDeg: number): Station[] {
  const byCell = new Map<string, Station>()
  for (const s of stations) {
    const cy = Math.floor(s.latitude / cellDeg)
    const cx = Math.floor(s.longitude / cellDeg)
    const key = `${String(cy)}:${String(cx)}`
    const centre = { lat: (cy + 0.5) * cellDeg, lon: (cx + 0.5) * cellDeg }
    const current = byCell.get(key)
    const d = distanceKm(centre.lat, centre.lon, s.latitude, s.longitude)
    if (current === undefined || d < distanceKm(centre.lat, centre.lon, current.latitude, current.longitude)) {
      byCell.set(key, s)
    }
  }
  return [...byCell.values()]
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf-8')) as T
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const cellDeg = Number(arg('cell', '0.12'))
  const todayIso = today()
  const startDate = addDays(todayIso, -HISTORY_DAYS)
  const year = Number(todayIso.slice(0, 4))

  const catalog = await readJson<{ zones: ItalianZone[] }>(TUSCANY_ZONES_FILE)
  const forestFile = await readJson<ForestFile>(TUSCANY_FOREST_FILE)
  if (catalog === null || forestFile === null) {
    console.log(`${TUSCANY_ZONES_FILE} o ${TUSCANY_FOREST_FILE} mancanti: niente da calcolare.`)
    return
  }
  const forest = new Map(forestFile.zones.map((z) => [z.code, z]))
  const zones = selectTuscanZones(catalog.zones, forest)
  console.log(
    `Toscana ${ALGORITHM_V1.version} - ${todayIso}: ${zones.length} comuni su ${catalog.zones.length} ` +
      `con almeno il ${Math.round(MIN_FOREST_FRACTION * 100)}% di bosco`,
  )

  // Stazioni SIR attive, una per cella.
  const allStations = parseStations(await fetchJson(stationsUrl(), { timeoutMs: 120_000 }))
  const active = allStations.filter((s) => s.elevationM !== null && isStationActive(s, 'precipitation', year))
  const stations = pickStations(active, cellDeg)
  const stationByCode = new Map(stations.map((s) => [s.code, s]))
  console.log(`  ${stations.length} stazioni SIR (una per cella di ${String(cellDeg)}°) su ${active.length} attive`)

  const jobs: Array<{ variable: Variable; idst: string }> = [
    { variable: 'precipitation', idst: 'pluvio0_24' },
    { variable: 'temperature_max', idst: 'termo_max' },
    { variable: 'temperature_min', idst: 'termo_min' },
  ]
  const byDate = new Map<string, Map<Variable, StationSample[]>>()
  const seriesCount: Record<string, number> = {}
  let lastSirUpdate: string | null = null
  for (const job of jobs) {
    let count = 0
    for (const station of stations) {
      if (!isStationActive(station, job.variable, year)) continue
      try {
        const payload = await fetchJson(seriesUrl(station.code, job.idst), { timeoutMs: 90_000 })
        for (const obs of parseSeries(payload, station.code, job.idst)) {
          if (obs.date < startDate || obs.date > todayIso || obs.value === null) continue
          const forDate = byDate.get(obs.date) ?? new Map<Variable, StationSample[]>()
          const list = forDate.get(job.variable) ?? []
          list.push(toSample(station, obs.value))
          forDate.set(job.variable, list)
          byDate.set(obs.date, forDate)
          if (lastSirUpdate === null || obs.date > lastSirUpdate) lastSirUpdate = obs.date
        }
        count += 1
      } catch {
        // Una stazione che non risponde non ferma il calcolo: conta il totale, sotto.
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    seriesCount[job.idst] = count
    console.log(`  ${job.idst}: ${count} serie`)
  }
  const observationsByDate = new Map<string, DailySamples>(byDate)

  // Open-Meteo, a lotti dimensionati sul peso.
  const weightPerPoint = forecastWeightPerPoint(HISTORY_DAYS, FORECAST_DAYS)
  const perRequest = Math.max(1, Math.floor(OPEN_METEO_FREE_LIMITS.perMinute / weightPerPoint))
  const pacer = new RatePacer({ maxWaitMs: 65 * 60_000 })
  const computed: SnapshotZone[] = []
  let modelFailures = 0
  for (const chunk of chunkPoints(zones, perRequest)) {
    let responses: OpenMeteoResponse[]
    try {
      await pacer.reserve(chunk.length * weightPerPoint)
      responses = await fetchJson<OpenMeteoResponse[]>(buildForecastUrl(chunk, HISTORY_DAYS, FORECAST_DAYS), {
        timeoutMs: 180_000,
      })
      if (!Array.isArray(responses) || responses.length !== chunk.length) throw new Error('risposte disallineate')
    } catch (error) {
      modelFailures += chunk.length
      console.error(`  lotto Open-Meteo fallito: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    for (const [j, zone] of chunk.entries()) {
      const response = responses[j]
      if (response === undefined) continue
      const measured = forest.get(zone.code)
      const snapshotZone = buildZoneSnapshot({
        zone: {
          code: zone.code,
          name: zone.name,
          reference: zone.name,
          province: zone.provinceAcronym,
          latitude: zone.latitude,
          longitude: zone.longitude,
          elevationM: zone.elevationM,
          forest: measured?.forest ?? [],
          ...(measured === undefined ? {} : { forestFraction: measured.forestFraction, forestShares: measured.shares }),
          stationNotes: STATION_NOTE,
        },
        modelSeries: toModelSeries(response, todayIso),
        observationsByDate,
        todayIso,
        displayPastDays: DISPLAY_PAST_DAYS,
        forecastDays: FORECAST_DAYS,
        municipality: zone.name,
        nearbyMunicipalities: [],
        stationByCode,
      })
      if (snapshotZone !== null) computed.push(snapshotZone)
    }
    console.log(`  ${computed.length} zone calcolate, ${Math.round(pacer.used)} chiamate pesate`)
  }

  // Senza zone, o con meta' delle zone perse, si tiene il file di ieri.
  if (computed.length === 0 || computed.length < zones.length / 2) {
    annotate('error', 'Snapshot Toscana non aggiornato', `${computed.length} zone su ${zones.length}: resta il file precedente.`)
    process.exitCode = 1
    return
  }

  const pluvio = seriesCount['pluvio0_24'] ?? 0
  const generatedAt = new Date().toISOString()
  const sources: SnapshotSource[] = [
    {
      status: pluvio === 0 ? 'down' : pluvio < stations.length * 0.8 ? 'degraded' : 'ok',
      recordsFetched: pluvio,
      coverage: 'Toscana, rete di pluviometri e termometri al suolo',
      name: 'Regione Toscana - Servizio Idrologico Regionale',
      license: LICENSES.sir.code,
      url: LICENSES.sir.url,
      attribution: LICENSES.sir.attribution,
      lastUpdate: lastSirUpdate,
    },
    {
      status: modelFailures === 0 ? 'ok' : 'degraded',
      recordsFetched: zones.length - modelFailures,
      coverage: 'Toscana, suolo, aria, vento e previsione',
      name: 'Open-Meteo',
      license: LICENSES.openMeteo.code,
      url: LICENSES.openMeteo.url,
      attribution: LICENSES.openMeteo.attribution,
      lastUpdate: todayIso,
    },
  ]
  const snapshot: Snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt,
    algorithmVersion: ALGORITHM_V1.version,
    referenceDate: todayIso,
    zones: [...computed].sort((a, b) => b.mpi - a.mpi || (b.mpiRaw ?? b.mpi) - (a.mpiRaw ?? a.mpi)),
    sources,
    uncalibratedParams: uncalibratedParams(),
  }
  if (!hasValidShape(snapshot)) throw new Error('Snapshot toscano con forma non valida: non scritto.')
  await writeFile(REGION_FILE, JSON.stringify(snapshot), 'utf8')

  // Le voci toscane dell'indice nazionale, sostituite; il resto dell'indice non si tocca.
  const index = await readJson<ItaliaIndex>(INDEX_FILE)
  if (index !== null) {
    await writeFile(INDEX_FILE, `${JSON.stringify(withTuscany(index, snapshot, todayIso))}\n`, 'utf8')
  }
  console.log(`Scritto ${REGION_FILE}: ${computed.length} zone. Indice aggiornato.`)
}

/** L'indice con le voci toscane prese da `snapshot`. Pura, per i test. */
export function withTuscany(index: ItaliaIndex, snapshot: Snapshot, todayIso: string): ItaliaIndex {
  const zones = [
    ...index.zones.filter((z) => z.regionSlug !== 'toscana'),
    ...snapshot.zones.map((z) => keptIndexEntry(z, 'Toscana', todayIso)),
  ]
  const others = index.regions.filter((r) => r.slug !== 'toscana')
  return {
    ...index,
    regions: [...others, { name: 'Toscana', slug: 'toscana', zoneCount: snapshot.zones.length }].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    zones,
  }
}

if (process.argv[1]?.includes('build-snapshot-toscana')) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}

