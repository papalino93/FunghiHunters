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
import { addDays, daysBetween, today } from '@/lib/domain/time'
import type { Station, Variable } from '@/lib/domain/types'
import { distanceKm } from '@/lib/qc/checks'
import { buildFeatures, type CellContext, type DailyWeather } from '@/lib/model/features'
import { computeMpi, mpiLabel } from '@/lib/model/mpi'
import { explainScore } from '@/lib/model/explain'
import { potentialWindow, type ForecastPoint } from '@/lib/model/narrative'
import { buildZoneSeries, zoneConfidence, type DailySamples } from '@/lib/pipeline/zone-series'
import type { StationSample } from '@/lib/spatial/interpolate'
import { LICENSES } from '@/lib/sources/adapter'
import { fetchJson } from '@/lib/sources/http'
import {
  isStationActive,
  parseSeries,
  parseStations,
  seriesUrl,
  stationsUrl,
} from '@/lib/sources/sir-archive'
import type {
  Snapshot,
  SnapshotFactor,
  SnapshotSeriesPoint,
  SnapshotStation,
  SnapshotZone,
} from '@/lib/snapshot/types'

const HISTORY_DAYS = 60
const FORECAST_DAYS = 8
const DISPLAY_PAST_DAYS = 14

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index < 0 ? fallback : (process.argv[index + 1] ?? fallback)
}

interface OpenMeteoResponse {
  readonly daily: {
    time: string[]
    precipitation_sum: Array<number | null>
    temperature_2m_max: Array<number | null>
    temperature_2m_min: Array<number | null>
    et0_fao_evapotranspiration: Array<number | null>
    wind_speed_10m_max: Array<number | null>
  }
  readonly hourly: {
    time: string[]
    soil_moisture_0_to_7cm: Array<number | null>
    soil_temperature_0_to_7cm: Array<number | null>
    vapour_pressure_deficit: Array<number | null>
  }
}

async function fetchModel(): Promise<OpenMeteoResponse[]> {
  const params = new URLSearchParams({
    latitude: ZONES.map((z) => z.latitude).join(','),
    longitude: ZONES.map((z) => z.longitude).join(','),
    elevation: ZONES.map((z) => z.elevationM).join(','),
    daily:
      'precipitation_sum,temperature_2m_max,temperature_2m_min,' +
      'et0_fao_evapotranspiration,wind_speed_10m_max',
    hourly: 'soil_moisture_0_to_7cm,soil_temperature_0_to_7cm,vapour_pressure_deficit',
    past_days: String(HISTORY_DAYS),
    forecast_days: String(FORECAST_DAYS),
    timezone: 'Europe/Rome',
  })
  return fetchJson<OpenMeteoResponse[]>(
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
    { timeoutMs: 120_000 },
  )
}

function dailyMean(
  times: readonly string[],
  values: readonly (number | null)[],
): Map<string, number> {
  const acc = new Map<string, { total: number; count: number }>()
  for (const [i, time] of times.entries()) {
    const value = values[i]
    if (value === null || value === undefined) continue
    const date = time.slice(0, 10)
    const entry = acc.get(date) ?? { total: 0, count: 0 }
    entry.total += value
    entry.count += 1
    acc.set(date, entry)
  }
  const out = new Map<string, number>()
  for (const [date, entry] of acc) out.set(date, entry.total / entry.count)
  return out
}

function toModelSeries(response: OpenMeteoResponse, todayIso: string): DailyWeather[] {
  const soilMoisture = dailyMean(response.hourly.time, response.hourly.soil_moisture_0_to_7cm)
  const soilTemp = dailyMean(response.hourly.time, response.hourly.soil_temperature_0_to_7cm)
  const vpd = dailyMean(response.hourly.time, response.hourly.vapour_pressure_deficit)

  return response.daily.time.map((date, i) => {
    const wind = response.daily.wind_speed_10m_max[i]
    return {
      date,
      precipitationMm: response.daily.precipitation_sum[i] ?? null,
      temperatureMaxC: response.daily.temperature_2m_max[i] ?? null,
      temperatureMinC: response.daily.temperature_2m_min[i] ?? null,
      et0Mm: response.daily.et0_fao_evapotranspiration[i] ?? null,
      // Open-Meteo restituisce il vento in km/h.
      windMs: wind === null || wind === undefined ? null : wind / 3.6,
      soilMoisture: soilMoisture.get(date) ?? null,
      soilTemperatureC: soilTemp.get(date) ?? null,
      vpdKpa: vpd.get(date) ?? null,
      provenance: date > todayIso ? 'FORECAST' : 'MODELLED',
    }
  })
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

async function main(): Promise<void> {
  const maxStations = Number(arg('stations', '45'))
  const outPath = arg('out', 'public/data/snapshot.json')
  const todayIso = today()
  const startDate = addDays(todayIso, -HISTORY_DAYS)

  console.log(`Snapshot ${ALGORITHM_V1.version} - ${todayIso}`)

  const [modelResponses, allStations] = await Promise.all([
    fetchModel(),
    fetchJson(stationsUrl(), { timeoutMs: 120_000 }).then(parseStations),
  ])

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

  const zones: SnapshotZone[] = []

  for (const [index, zone] of ZONES.entries()) {
    const response = modelResponses[index]
    if (response === undefined) continue

    const cell: CellContext = {
      elevationM: zone.elevationM,
      aspectDeg: null,
      slopeDeg: null,
      canopyDensity: null,
    }
    const target = {
      latitude: zone.latitude,
      longitude: zone.longitude,
      elevationM: zone.elevationM,
    }

    const modelSeries = toModelSeries(response, todayIso)
    const assembled = buildZoneSeries({ target, modelSeries, observationsByDate })
    const full = assembled.series

    const ageDays =
      assembled.lastObservedDate === null
        ? 30
        : Math.max(0, daysBetween(assembled.lastObservedDate, todayIso))

    // Punteggio per ogni giorno visualizzato: il motore e' puro, quindi basta ricalcolarlo
    // sulla serie troncata a quel giorno. E' anche esattamente cio' che serve al backtest.
    const points: SnapshotSeriesPoint[] = []
    const forecastPoints: ForecastPoint[] = []
    let currentResult: ReturnType<typeof computeMpi> | null = null
    let currentFeatures: ReturnType<typeof buildFeatures> | null = null
    let currentConfidence = 0
    let currentDataQuality = 0
    let currentForecastCertainty = 100

    for (let offset = -DISPLAY_PAST_DAYS; offset <= FORECAST_DAYS - 1; offset += 1) {
      const date = addDays(todayIso, offset)
      const dayIndex = full.findIndex((d) => d.date === date)
      if (dayIndex < 0) continue

      const upTo = full.slice(0, dayIndex + 1)
      const features = buildFeatures(upTo, cell, ALGORITHM_V1)
      const result = computeMpi({ features, cell })
      const horizon = Math.max(0, offset)
      const confidence = zoneConfidence({
        interpolation: assembled.lastObservedInterpolation,
        coverage: features.coverage,
        observationAgeDays: ageDays + Math.max(0, offset),
        horizonDays: horizon,
      })

      const day = full[dayIndex]
      points.push({
        date,
        mpi: result.mpi,
        confidence: confidence.score,
        dataQuality: confidence.dataQuality,
        forecastCertainty: confidence.forecastCertainty,
        provenance: day?.provenance ?? 'MODELLED',
        rainMm: day?.precipitationMm ?? null,
        tMinC: day?.temperatureMinC ?? null,
        tMaxC: day?.temperatureMaxC ?? null,
        // Massimo giornaliero (Open-Meteo non offre una vera media nell'endpoint daily), non
        // "vento medio": vedi il commento su windMean7d in model/features.ts.
        windMs: day?.windMs ?? null,
      })

      if (offset >= 0) {
        forecastPoints.push({ date, mpi: result.mpi, confidence: confidence.score })
      }
      if (offset === 0) {
        currentResult = result
        currentFeatures = features
        currentConfidence = confidence.score
        currentDataQuality = confidence.dataQuality
        currentForecastCertainty = confidence.forecastCertainty
      }
    }

    if (currentResult === null || currentFeatures === null) continue

    const explanation = explainScore(currentResult, currentFeatures, currentConfidence)
    const window = potentialWindow(forecastPoints, explanation.limitingFactor)

    const recent = points.filter((p) => daysBetween(p.date, todayIso) >= 0).slice(-4)
    const ahead = points.filter((p) => daysBetween(todayIso, p.date) > 0).slice(0, 4)
    const development =
      ahead.length === 0 || recent.length === 0
        ? 0
        : average(ahead.map((p) => p.mpi)) - average(recent.map((p) => p.mpi))

    const stations: SnapshotStation[] = []
    for (const [variable, result] of assembled.lastObservedInterpolation) {
      for (const neighbour of result.neighbours.slice(0, 4)) {
        const station = stationByCode.get(neighbour.stationCode)
        if (station === undefined) continue
        stations.push({
          code: station.code,
          name: station.name,
          latitude: station.latitude,
          longitude: station.longitude,
          elevationM: station.elevationM,
          distanceKm: neighbour.distanceKm,
          elevationDiffM: neighbour.elevationDiffM,
          effectiveKm: neighbour.effectiveKm,
          variable,
        })
      }
    }

    const tmaxInterpolation = assembled.lastObservedInterpolation.get('temperature_max')

    zones.push({
      code: zone.code,
      name: zone.name,
      reference: zone.reference,
      province: zone.province,
      municipality: municipalityByZone.get(zone.code) ?? null,
      latitude: zone.latitude,
      longitude: zone.longitude,
      elevationM: zone.elevationM,
      forest: zone.forest,
      stationNotes: zone.stationNotes.replace(/\s+/g, ' ').trim(),
      mpi: currentResult.mpi,
      confidence: currentConfidence,
      dataQuality: currentDataQuality,
      forecastCertainty: currentForecastCertainty,
      label: mpiLabel(currentResult.mpi),
      limitingFactor: explanation.limitingFactor,
      development: Math.round(development * 10) / 10,
      series: points,
      weather: {
        rain24h: currentFeatures.rain['rain_1d'] ?? null,
        rain72h: currentFeatures.rain['rain_3d'] ?? null,
        rain7d: currentFeatures.rain['rain_7d'] ?? null,
        rain14d: currentFeatures.rain['rain_14d'] ?? null,
        rain26d: currentFeatures.rain['rain_26d'] ?? null,
        effectiveWaterMm: Math.round(currentFeatures.water.effectiveMm * 10) / 10,
        initialDeficitMm: Math.round(currentFeatures.water.initialDeficitMm * 10) / 10,
        et0_7d: currentFeatures.et0_7d,
        et0_14d: currentFeatures.et0_14d,
        tMean20d: currentFeatures.tMeanWindow,
        tMinWindow: currentFeatures.tMinWindow,
        tMaxWindow: currentFeatures.tMaxWindow,
        soilTemperatureMean: currentFeatures.soilTemperatureMean,
        soilMoisture: full.find((d) => d.date === todayIso)?.soilMoisture ?? null,
        vpdMean7d: currentFeatures.vpdMean7d,
        windMean7d: currentFeatures.windMean7d,
      },
      positiveFactors: explanation.positiveFactors.map(toSnapshotFactor),
      negativeFactors: explanation.negativeFactors.map(toSnapshotFactor),
      neutralFactors: explanation.neutralFactors.map(toSnapshotFactor),
      stations,
      bestWindow:
        window === null
          ? null
          : {
              peakDate: window.peakDate,
              peakMpi: window.peakMpi,
              start: window.start,
              end: window.end,
              narrative: window.narrative,
            },
      observedDays: assembled.observedDays,
      // Il denominatore vero della copertura: la finestra di calcolo, non i punti mostrati.
      windowDays: full.filter((d) => d.date <= todayIso).length,
      lastObservedDate: assembled.lastObservedDate,
      thermalOptimumC: Math.round(currentResult.components.thermal.optimumC * 10) / 10,
      lapseRateCPerKm:
        tmaxInterpolation?.lapseRatePerM === null || tmaxInterpolation === undefined
          ? null
          : Math.round(tmaxInterpolation.lapseRatePerM * 1000 * 100) / 100,
    })

    console.log(
      `  ${zone.name.padEnd(21)} MPI ${String(currentResult.mpi).padStart(5)} ` +
        `conf ${currentConfidence.toFixed(0).padStart(3)}`,
    )
  }

  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    algorithmVersion: ALGORITHM_V1.version,
    referenceDate: todayIso,
    zones,
    sources: [
      {
        // Una fonte che risponde a meta' non e' una fonte che funziona: va detto.
        status: sirSeries === 0 ? 'down' : sirSeries < candidates.length ? 'degraded' : 'ok',
        recordsFetched: sirSeries,
        coverage: 'Toscana, rete di stazioni al suolo',
        name: 'Regione Toscana - Servizio Idrologico Regionale',
        license: LICENSES.sir.code,
        url: LICENSES.sir.url,
        attribution: LICENSES.sir.attribution,
        lastUpdate: lastSirUpdate,
      },
      {
        status: modelResponses.length === ZONES.length ? 'ok' : 'degraded',
        recordsFetched: modelResponses.length,
        coverage: 'globale, modelli a 2-11 km',
        name: 'Open-Meteo',
        license: LICENSES.openMeteo.code,
        url: LICENSES.openMeteo.url,
        attribution: LICENSES.openMeteo.attribution,
        lastUpdate: todayIso,
      },
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

  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(snapshot, null, 1), 'utf8')
  console.log(`\nScritto ${outPath}`)
}

function toSnapshotFactor(factor: {
  key: string
  label: string
  contribution: number
  value: string
  provenance: 'sourced' | 'calibrate'
  source?: string
  transferabilityCaution?: string
}): SnapshotFactor {
  return {
    key: factor.key,
    label: factor.label,
    contribution: Math.round(factor.contribution * 10) / 10,
    value: factor.value,
    provenance: factor.provenance,
    ...(factor.source === undefined ? {} : { source: factor.source }),
    ...(factor.transferabilityCaution === undefined
      ? {}
      : { transferabilityCaution: factor.transferabilityCaution }),
  }
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

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

main().catch((error: unknown) => {
  console.error('Snapshot fallito:', error)
  process.exitCode = 1
})
