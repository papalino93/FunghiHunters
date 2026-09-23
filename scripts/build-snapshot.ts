/**
 * Precalcola lo snapshot che l'app serve staticamente.
 *
 *   npx tsx scripts/build-snapshot.ts
 *   npx tsx scripts/build-snapshot.ts --stations 40 --out public/data/snapshot.json
 *
 * Fa il giro completo — anagrafica, serie SIR, interpolazione, modello, confidence, finestra
 * potenziale — e scrive un file. Gira una volta al giorno su GitHub Actions: calcolare l'MPI a
 * ogni visita significherebbe leggere cinquanta serie storiche per ogni utente, che non ha senso
 * e sarebbe comunque troppo lento.
 *
 * Il formato e' gia' quello che prenderanno le righe del database quando ci sara'.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { ALGORITHM_V1, uncalibratedParams } from '@/lib/config/algorithm'
import { ZONES } from '@/lib/config/zones'
import { addDays, today } from '@/lib/domain/time'
import type { Station, Variable } from '@/lib/domain/types'
import { distanceKm } from '@/lib/qc/checks'
import {
  buildForecastUrl,
  toModelSeries,
  type OpenMeteoResponse,
} from '@/lib/pipeline/open-meteo-series'
import { buildZoneSnapshot } from '@/lib/pipeline/zone-snapshot'
import type { ForestFile } from '@/../scripts/ingest-forest-italia'
import type { DailySamples } from '@/lib/pipeline/zone-series'
import type { StationSample } from '@/lib/spatial/interpolate'
import { LICENSES } from '@/lib/sources/adapter'
import { annotate } from '@/lib/pipeline/ci-report'
import { fetchJson } from '@/lib/sources/http'
import {
  isStationActive,
  parseSeries,
  parseStations,
  seriesUrl,
  stationsUrl,
} from '@/lib/sources/sir-archive'
import { SNAPSHOT_SCHEMA_VERSION } from '@/lib/snapshot/types'
import type {
  Snapshot,
  SnapshotNearbyMunicipality,
  SnapshotSource,
  SnapshotZone,
} from '@/lib/snapshot/types'

const HISTORY_DAYS = 60
const FORECAST_DAYS = 8
const DISPLAY_PAST_DAYS = 14

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index < 0 ? fallback : (process.argv[index + 1] ?? fallback)
}

async function fetchModel(): Promise<OpenMeteoResponse[]> {
  return fetchJson<OpenMeteoResponse[]>(
    buildForecastUrl(ZONES, HISTORY_DAYS, FORECAST_DAYS),
    { timeoutMs: 120_000 },
  )
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

/**
 * Il bosco misurato delle sette zone, da `scripts/ingest-forest-italia.ts`.
 *
 * Mappa vuota quando il file non c'e' o non contiene ancora le zone toscane: il termine habitat
 * resta allora neutro, che e' come si comportava il modello prima della 1.4.0 — non una
 * penalizzazione silenziosa.
 */
async function loadForest(): Promise<Map<string, { forestFraction: number; shares: Readonly<Record<string, number>> }>> {
  try {
    const raw = await readFile('public/data/forest-italia.json', 'utf-8')
    const file = JSON.parse(raw) as ForestFile
    return new Map(
      file.zones.map((zone) => [
        zone.code,
        { forestFraction: zone.forestFraction, shares: zone.shares },
      ]),
    )
  } catch {
    return new Map()
  }
}

async function main(): Promise<void> {
  const maxStations = Number(arg('stations', '45'))
  const outPath = arg('out', 'public/data/snapshot.json')
  const todayIso = today()
  const startDate = addDays(todayIso, -HISTORY_DAYS)

  console.log(`Snapshot ${ALGORITHM_V1.version} - ${todayIso}`)

  /*
   * Le due fonti si scaricano in parallelo ma falliscono ciascuna per conto suo. Con
   * `Promise.all` un'anagrafica SIR che non risponde buttava via anche il modello gia' arrivato, e
   * con lui l'intero snapshot del giorno: esattamente il degrado che il pannello delle fonti
   * esiste per dichiarare. Le due fonti pero' non pesano uguale:
   *
   * - **senza Open-Meteo** non c'e' punteggio da calcolare — il modello e' l'unica serie che copre
   *   anche i giorni di previsione. Si esce con errore *senza scrivere*, cosi' resta lo snapshot di
   *   ieri invece di uno a zero zone, che l'app mostrerebbe come "nessun dato";
   * - **senza SIR** il punteggio esce lo stesso dal solo modello, come per le zone nazionali, la
   *   confidence cala da sola e la fonte finisce `down` nel pannello. Lo snapshot si scrive, poi
   *   lo script esce con codice 1: il workflow committa comunque i dati e fa diventare rossa la
   *   corsa (vedi `.github/workflows/daily-snapshot.yml`).
   */
  const [modelResult, stationsResult] = await Promise.allSettled([
    fetchModel(),
    fetchJson(stationsUrl(), { timeoutMs: 120_000 }).then(parseStations),
  ])
  if (modelResult.status === 'rejected') {
    throw new Error(
      'Open-Meteo non ha risposto: senza modello non c\'e\' punteggio da calcolare, ' +
        `lo snapshot precedente resta al suo posto. Causa: ${describeError(modelResult.reason)}`,
    )
  }
  const modelResponses = modelResult.value
  const sirStationsError =
    stationsResult.status === 'rejected' ? describeError(stationsResult.reason) : null
  const allStations = stationsResult.status === 'fulfilled' ? stationsResult.value : []
  if (sirStationsError !== null) {
    annotate(
      'error',
      'SIR non raggiungibile',
      `anagrafica stazioni non scaricata (${sirStationsError}): lo snapshot toscano esce dal solo ` +
        'modello meteo, con la fonte SIR dichiarata "down".',
    )
  }

  const candidates = allStations
    .filter((s) => s.elevationM !== null)
    .filter((s) => isStationActive(s, 'precipitation', 2026))
    .map((s) => ({
      station: s,
      zoneDistance: Math.min(
        ...ZONES.map((z) => distanceKm(z.latitude, z.longitude, s.latitude, s.longitude)),
      ),
    }))
    .sort((a, b) => a.zoneDistance - b.zoneDistance)
    .slice(0, maxStations)

  const stationByCode = new Map(candidates.map((c) => [c.station.code, c.station]))
  console.log(`  ${candidates.length} stazioni SIR`)

  const jobs: Array<{ variable: Variable; idst: string }> = [
    { variable: 'precipitation', idst: 'pluvio0_24' },
    { variable: 'temperature_max', idst: 'termo_max' },
    { variable: 'temperature_min', idst: 'termo_min' },
  ]

  const byDate = new Map<string, Map<Variable, StationSample[]>>()
  let lastSirUpdate: string | null = null
  // Serie effettivamente scaricate per la pioggia: e' l'indicatore di salute della fonte.
  let sirSeries = 0

  for (const job of jobs) {
    process.stdout.write(`  ${job.idst} `)
    let count = 0
    for (const candidate of candidates) {
      if (!isStationActive(candidate.station, job.variable, 2026)) continue
      try {
        const payload = await fetchJson(seriesUrl(candidate.station.code, job.idst), {
          timeoutMs: 90_000,
        })
        for (const obs of parseSeries(payload, candidate.station.code, job.idst)) {
          if (obs.date < startDate || obs.date > todayIso || obs.value === null) continue
          const forDate = byDate.get(obs.date) ?? new Map<Variable, StationSample[]>()
          const forVariable = forDate.get(job.variable) ?? []
          forVariable.push(toSample(candidate.station, obs.value))
          forDate.set(job.variable, forVariable)
          byDate.set(obs.date, forDate)
          if (lastSirUpdate === null || obs.date > lastSirUpdate) lastSirUpdate = obs.date
        }
        count += 1
      } catch {
        // Una stazione che non risponde non ferma lo snapshot, ma il conteggio lo registra.
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    console.log(`${count} serie`)
    if (job.variable === 'precipitation') sirSeries = count
  }

  const observationsByDate = new Map<string, DailySamples>()
  for (const [date, samples] of byDate) observationsByDate.set(date, samples)

  const municipalityByZone = await loadAdminBoundaries()
  const nearbyByZone = await loadNearbyComuni()
  const forestByZone = await loadForest()

  const zones: SnapshotZone[] = []

  for (const [index, zone] of ZONES.entries()) {
    const response = modelResponses[index]
    if (response === undefined) continue

    const measured = forestByZone.get(zone.code)
    const snapshotZone = buildZoneSnapshot({
      /*
       * Del bosco misurato si prende solo quanto ce n'e' e di che generi: l'etichetta resta
       * quella scritta a mano in `zones.ts`, che dice "abetina" e "castagneto" dove la mappa dei
       * generi sa dire soltanto "altre conifere" e "altre latifoglie".
       */
      zone: {
        ...zone,
        ...(measured === undefined
          ? {}
          : { forestFraction: measured.forestFraction, forestShares: measured.shares }),
      },
      modelSeries: toModelSeries(response, todayIso),
      observationsByDate,
      todayIso,
      displayPastDays: DISPLAY_PAST_DAYS,
      forecastDays: FORECAST_DAYS,
      municipality: municipalityByZone.get(zone.code) ?? null,
      nearbyMunicipalities: nearbyByZone.get(zone.code) ?? [],
      stationByCode,
    })
    if (snapshotZone === null) continue
    zones.push(snapshotZone)

    console.log(
      `  ${zone.name.padEnd(21)} MPI ${String(snapshotZone.mpi).padStart(5)} ` +
        `conf ${snapshotZone.confidence.toFixed(0).padStart(3)}`,
    )
  }

  const sirSource: SnapshotSource = {
    // Una fonte che risponde a meta' non e' una fonte che funziona: va detto.
    status: sirSeries === 0 ? 'down' : sirSeries < candidates.length ? 'degraded' : 'ok',
    recordsFetched: sirSeries,
    coverage: 'Toscana, rete di stazioni al suolo',
    name: 'Regione Toscana - Servizio Idrologico Regionale',
    license: LICENSES.sir.code,
    url: LICENSES.sir.url,
    attribution: LICENSES.sir.attribution,
    lastUpdate: lastSirUpdate,
  }
  const openMeteoSource: SnapshotSource = {
    status: modelResponses.length === ZONES.length ? 'ok' : 'degraded',
    recordsFetched: modelResponses.length,
    coverage: 'globale, modelli a 2-11 km',
    name: 'Open-Meteo',
    license: LICENSES.openMeteo.code,
    url: LICENSES.openMeteo.url,
    attribution: LICENSES.openMeteo.attribution,
    lastUpdate: todayIso,
  }

  const snapshot: Snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    algorithmVersion: ALGORITHM_V1.version,
    referenceDate: todayIso,
    zones,
    sources: [
      sirSource,
      openMeteoSource,
      {
        // Non fa parte del giro giornaliero: risolto una volta da `ingest-admin-boundaries.ts`
        // e letto da un file. "ok" se il file esiste ed e' stato letto, "down" altrimenti — non
        // "degraded", perche' non c'e' una via di mezzo per un file che c'e' o non c'e'.
        status: municipalityByZone.size > 0 ? 'ok' : 'down',
        recordsFetched: municipalityByZone.size,
        coverage: 'Toscana, confini comunali',
        name: 'ISTAT - confini amministrativi',
        license: LICENSES.istatBoundaries.code,
        url: LICENSES.istatBoundaries.url,
        attribution: LICENSES.istatBoundaries.attribution,
        lastUpdate: null,
      },
    ],
    uncalibratedParams: uncalibratedParams(),
  }

  if (zones.length === 0) {
    // Stesso motivo del modello mancante: uno snapshot vuoto scritto sopra quello di ieri
    // cancellerebbe la mappa invece di lasciarla un giorno indietro.
    throw new Error('Nessuna zona calcolata: lo snapshot precedente resta al suo posto.')
  }

  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(snapshot, null, 1), 'utf8')
  console.log(`\nScritto ${outPath}`)

  /*
   * Dopo la scrittura, non prima: il dato che c'e' va salvato comunque. Una fonte giornaliera
   * `down` fa uscire lo script con 1, e quindi la corsa rossa con l'email al proprietario; una
   * `degraded` (qualche stazione che non risponde) resta un avviso, perche' capita e non toglie il
   * dato di oggi. Solo le due fonti del giro giornaliero: l'ISTAT e' un file letto da disco,
   * non una fonte che puo' cadere oggi.
   */
  for (const source of [sirSource, openMeteoSource]) {
    if (source.status === 'ok') continue
    annotate(
      source.status === 'down' ? 'error' : 'warning',
      `${source.name}: ${source.status}`,
      `${source.recordsFetched ?? 0} record arrivati. Snapshot scritto lo stesso, la fonte e' ` +
        'dichiarata nel pannello "Dati e fonti".',
    )
    if (source.status === 'down') process.exitCode = 1
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}


/**
 * Legge il comune reale per zona, precalcolato da `scripts/ingest-admin-boundaries.ts`.
 * Non rifà la risoluzione punto-in-poligono a ogni build: quel file cambia solo quando cambiano
 * le zone, non ogni giorno insieme allo snapshot meteo.
 */
async function loadAdminBoundaries(): Promise<Map<string, string>> {
  try {
    const raw = await readFile('public/data/admin-boundaries.json', 'utf-8')
    const parsed = JSON.parse(raw) as { zones?: Array<{ zoneCode: string; municipality: string }> }
    return new Map((parsed.zones ?? []).map((z) => [z.zoneCode, z.municipality]))
  } catch {
    // File non ancora generato: lo snapshot esce comunque, con municipality null per tutte le
    // zone invece di fallire. Vedi il commento su SnapshotZone.municipality.
    return new Map()
  }
}

/**
 * Legge i comuni reali entro raggio per zona, precalcolati da `scripts/ingest-nearby-comuni.ts`.
 * Stesso motivo di `loadAdminBoundaries`: i confini comunali non cambiano ogni giorno, non ha
 * senso rifare la query geometrica a ogni build dello snapshot meteo.
 */
async function loadNearbyComuni(): Promise<Map<string, SnapshotNearbyMunicipality[]>> {
  try {
    const raw = await readFile('public/data/nearby-comuni.json', 'utf-8')
    const parsed = JSON.parse(raw) as {
      zones?: Record<string, SnapshotNearbyMunicipality[]>
    }
    return new Map(Object.entries(parsed.zones ?? {}))
  } catch {
    // File non ancora generato: nearbyMunicipalities resta un array vuoto per tutte le zone.
    return new Map()
  }
}


main().catch((error: unknown) => {
  console.error('Snapshot fallito:', error)
  annotate('error', 'Snapshot toscano non scritto', describeError(error))
  process.exitCode = 1
})
