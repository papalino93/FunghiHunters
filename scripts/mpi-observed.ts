/**
 * MPI sulle sette zone con le osservazioni SIR interpolate, a confronto col solo modello.
 *
 *   npx tsx scripts/mpi-observed.ts
 *   npx tsx scripts/mpi-observed.ts --stations 60
 *
 * E' il giro completo della pipeline: anagrafica, serie storiche, interpolazione con correzione
 * di quota, fusione col modello, motore MPI, confidence. Mostra affiancati il punteggio con solo
 * Open-Meteo e quello con le stazioni, perche' la differenza fra i due e' esattamente il valore
 * che le osservazioni aggiungono.
 */

import { ALGORITHM_V1 } from '@/lib/config/algorithm'
import { ZONES } from '@/lib/config/zones'
import { addDays, daysBetween as daysBetweenDates, today } from '@/lib/domain/time'
import type { Station, Variable } from '@/lib/domain/types'
import { distanceKm } from '@/lib/qc/checks'
import { buildFeatures, type CellContext, type DailyWeather } from '@/lib/model/features'
import { computeMpi, mpiLabel } from '@/lib/model/mpi'
import {
  DEFAULT_VARIABLE_WEIGHTS,
  aggregateConfidence,
  variableConfidence,
} from '@/lib/model/confidence'
import { buildZoneSeries, zoneConfidence, type DailySamples } from '@/lib/pipeline/zone-series'
import type { StationSample } from '@/lib/spatial/interpolate'
import { fetchJson } from '@/lib/sources/http'
import {
  isStationActive,
  parseSeries,
  parseStations,
  seriesUrl,
  stationsUrl,
} from '@/lib/sources/sir-archive'

const HISTORY_DAYS = 46
const FORECAST_DAYS = 7

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  return Number.isFinite(value) ? value : fallback
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

function dailyMean(times: readonly string[], values: readonly (number | null)[]): Map<string, number> {
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

  return response.daily.time.map((date, i) => ({
    date,
    precipitationMm: response.daily.precipitation_sum[i] ?? null,
    temperatureMaxC: response.daily.temperature_2m_max[i] ?? null,
    temperatureMinC: response.daily.temperature_2m_min[i] ?? null,
    et0Mm: response.daily.et0_fao_evapotranspiration[i] ?? null,
    windMs: (response.daily.wind_speed_10m_max[i] ?? null) === null
      ? null
      : (response.daily.wind_speed_10m_max[i] as number) / 3.6,
    soilMoisture: soilMoisture.get(date) ?? null,
    soilTemperatureC: soilTemp.get(date) ?? null,
    vpdKpa: vpd.get(date) ?? null,
    // Script diagnostico, non richiede l'umidità: non è nel confronto osservato-vs-modellato.
    relativeHumidityPercent: null,
    provenance: date > todayIso ? 'FORECAST' : 'MODELLED',
  }))
}

async function main(): Promise<void> {
  const maxStations = arg('stations', 50)
  const todayIso = today()
  const startDate = addDays(todayIso, -HISTORY_DAYS)

  console.log(`MPI ${ALGORITHM_V1.version} - ${todayIso}`)
  console.log(`Finestra: ${startDate} -> ${todayIso}\n`)

  const [modelResponses, stations] = await Promise.all([
    fetchModel(),
    fetchJson(stationsUrl(), { timeoutMs: 120_000 }).then(parseStations),
  ])

  const candidates = stations
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

  console.log(`${candidates.length} stazioni SIR attorno alle zone, scarico le serie:`)

  const jobs: Array<{ variable: Variable; idst: string }> = [
    { variable: 'precipitation', idst: 'pluvio0_24' },
    { variable: 'temperature_max', idst: 'termo_max' },
    { variable: 'temperature_min', idst: 'termo_min' },
  ]

  // date -> variabile -> campioni
  const byDate = new Map<string, Map<Variable, StationSample[]>>()

  for (const job of jobs) {
    process.stdout.write(`  ${job.idst} `)
    let series = 0
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
        }
        series += 1
      } catch {
        // Una stazione che non risponde non ferma il giro.
      }
      await new Promise((resolve) => setTimeout(resolve, 110))
    }
    console.log(`${series} serie`)
  }

  console.log('\n')
  console.log(
    `${'zona'.padEnd(21)} ${'MPI mod'.padStart(8)} ${'conf'.padStart(5)}   ` +
      `${'MPI oss'.padStart(8)} ${'conf'.padStart(5)}  ${'staz'.padStart(4)}  etichetta`,
  )

  for (const [i, zone] of ZONES.entries()) {
    const response = modelResponses[i]
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
    const todayIndex = modelSeries.findIndex((d) => d.date === todayIso)
    if (todayIndex < 0) continue
    const upToToday = modelSeries.slice(0, todayIndex + 1)

    // Solo modello.
    const modelFeatures = buildFeatures(upToToday, cell, ALGORITHM_V1)
    const modelMpi = computeMpi({ features: modelFeatures, cell })
    const modelConfidence = aggregateConfidence({
      variables: (['precipitation', 'temperature_max', 'temperature_min', 'soil_moisture', 'et0'] as const).map(
        (variable) =>
          variableConfidence({
            variable,
            provenance: 'MODELLED',
            stations: [],
            horizonDays: 0,
            ensembleAgreement: null,
            coverage: modelFeatures.coverage,
          }),
      ),
      weights: DEFAULT_VARIABLE_WEIGHTS,
    })

    // Con le osservazioni interpolate.
    const observationsByDate = new Map<string, DailySamples>()
    for (const [date, samples] of byDate) observationsByDate.set(date, samples)

    const assembled = buildZoneSeries({ target, modelSeries: upToToday, observationsByDate })
    const features = buildFeatures(assembled.series, cell, ALGORITHM_V1)
    const result = computeMpi({ features, cell })
    const ageDays =
      assembled.lastObservedDate === null
        ? 30
        : Math.max(0, -daysBetweenDates(todayIso, assembled.lastObservedDate))
    const confidence = zoneConfidence({
      interpolation: assembled.lastObservedInterpolation,
      coverage: features.coverage,
      observationAgeDays: ageDays,
    })

    const stationCount =
      assembled.lastObservedInterpolation.get('precipitation')?.neighbours.length ?? 0

    console.log(
      `${zone.name.padEnd(21)} ${modelMpi.mpi.toFixed(1).padStart(8)} ` +
        `${modelConfidence.score.toFixed(0).padStart(5)}   ` +
        `${result.mpi.toFixed(1).padStart(8)} ${confidence.score.toFixed(0).padStart(5)}  ` +
        `${String(stationCount).padStart(4)}  ${mpiLabel(result.mpi)}`,
    )

    const rain = assembled.lastObservedInterpolation.get('precipitation')
    const tmax = assembled.lastObservedInterpolation.get('temperature_max')
    if (rain !== undefined && tmax !== undefined) {
      const nearest = rain.neighbours[0]
      console.log(
        `  ${'stazione piu rappresentativa:'.padEnd(30)} ${nearest?.stationCode ?? 'n/d'} ` +
          `a ${nearest?.distanceKm.toFixed(1) ?? '?'} km, ` +
          `${nearest?.elevationDiffM.toFixed(0) ?? '?'} m di dislivello ` +
          `(efficace ${nearest?.effectiveKm.toFixed(1) ?? '?'} km)`,
      )
      console.log(
        `  ${'gradiente termico stimato:'.padEnd(30)} ` +
          `${tmax.lapseRatePerM === null ? 'n/d' : `${(tmax.lapseRatePerM * 1000).toFixed(2)} C/km`}` +
          `  peso osservato ${(rain.observedWeight * 100).toFixed(0)} %`,
      )
    }
    console.log(
      `  ${'giorni con osservazioni:'.padEnd(30)} ${assembled.observedDays} su ${upToToday.length}` +
        `, ultimo ${assembled.lastObservedDate ?? 'n/d'}\n`,
    )
  }
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

main().catch((error: unknown) => {
  console.error('Calcolo fallito:', error)
  process.exitCode = 1
})
