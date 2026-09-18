/**
 * Calcola l'MPI sulle sette zone di taratura con dati reali, affiancando il modello baseline.
 *
 *   npx tsx scripts/mpi-zones.ts
 *   npx tsx scripts/mpi-zones.ts --explain amiata
 *
 * Serve a rispondere alla domanda "in che cosa il v1 fa meglio del baseline", con numeri invece
 * che con argomenti. Usa solo Open-Meteo: l'integrazione delle osservazioni SIR interpolate
 * arriva col motore di interpolazione, e fino ad allora il confronto resta a parita' di input,
 * che e' esattamente cio' che serve per isolare la differenza fra i due modelli.
 */

import { ZONES } from '@/lib/config/zones'
import { ALGORITHM_V1 } from '@/lib/config/algorithm'
import { addDays, today } from '@/lib/domain/time'
import { buildFeatures, type CellContext, type DailyWeather } from '@/lib/model/features'
import { computeMpi, mpiLabel } from '@/lib/model/mpi'
import { explainScore } from '@/lib/model/explain'
import {
  DEFAULT_VARIABLE_WEIGHTS,
  aggregateConfidence,
  variableConfidence,
} from '@/lib/model/confidence'
import { fetchJson } from '@/lib/sources/http'

const PAST_DAYS = 60
const FORECAST_DAYS = 10

interface OpenMeteoDaily {
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

async function fetchZones(): Promise<OpenMeteoDaily[]> {
  const params = new URLSearchParams({
    latitude: ZONES.map((z) => z.latitude).join(','),
    longitude: ZONES.map((z) => z.longitude).join(','),
    elevation: ZONES.map((z) => z.elevationM).join(','),
    daily:
      'precipitation_sum,temperature_2m_max,temperature_2m_min,' +
      'et0_fao_evapotranspiration,wind_speed_10m_max',
    hourly: 'soil_moisture_0_to_7cm,soil_temperature_0_to_7cm,vapour_pressure_deficit',
    past_days: String(PAST_DAYS),
    forecast_days: String(FORECAST_DAYS),
    timezone: 'Europe/Rome',
  })
  return fetchJson<OpenMeteoDaily[]>(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    timeoutMs: 120_000,
  })
}

/** Media giornaliera di una serie oraria. */
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

function toDailyWeather(response: OpenMeteoDaily, todayIso: string): DailyWeather[] {
  const soilMoisture = dailyMean(response.hourly.time, response.hourly.soil_moisture_0_to_7cm)
  const soilTemp = dailyMean(response.hourly.time, response.hourly.soil_temperature_0_to_7cm)
  const vpd = dailyMean(response.hourly.time, response.hourly.vapour_pressure_deficit)

  return response.daily.time.map((date, i) => ({
    date,
    precipitationMm: response.daily.precipitation_sum[i] ?? null,
    temperatureMaxC: response.daily.temperature_2m_max[i] ?? null,
    temperatureMinC: response.daily.temperature_2m_min[i] ?? null,
    et0Mm: response.daily.et0_fao_evapotranspiration[i] ?? null,
    // Open-Meteo restituisce il vento massimo giornaliero in km/h: lo portiamo a m/s.
    windMs: toMs(response.daily.wind_speed_10m_max[i] ?? null),
    soilMoisture: soilMoisture.get(date) ?? null,
    soilTemperatureC: soilTemp.get(date) ?? null,
    vpdKpa: vpd.get(date) ?? null,
    // Script diagnostico, non richiede l'umidità.
    relativeHumidityPercent: null,
    provenance: date > todayIso ? 'FORECAST' : 'MODELLED',
  }))
}

function toMs(kmh: number | null): number | null {
  return kmh === null ? null : kmh / 3.6
}

/** Il modello baseline, implementato esattamente come specificato, per il confronto. */
function baselineMpi(days: readonly DailyWeather[], index: number): number {
  const band = (v: number, a: number, b: number, c: number, d: number): number => {
    if (v <= a || v >= d) return 0
    if (v >= b && v <= c) return 1
    return v < b ? (v - a) / (b - a) : (d - v) / (d - c)
  }
  const rain = (i: number): number => days[i]?.precipitationMm ?? 0

  let best = { trigger: 0, lag: 12, start: index - 12 }
  for (let lag = 6; lag <= 18; lag += 1) {
    const j = index - lag
    if (j - 2 < 0) continue
    const r = rain(j) + rain(j - 1) + rain(j - 2)
    const rainScore = Math.min(1, Math.max(0, (r - 12) / 33))
    const lagScore = Math.exp(-((lag - 12) ** 2) / 40.5)
    if (rainScore * lagScore > best.trigger) {
      best = { trigger: rainScore * lagScore, lag, start: j }
    }
  }

  const window = days.slice(best.start, index + 1)
  const tmins = window.map((d) => d.temperatureMinC).filter((v): v is number => v !== null)
  const tmaxs = window.map((d) => d.temperatureMaxC).filter((v): v is number => v !== null)
  if (tmins.length === 0 || tmaxs.length === 0) return 0
  const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
  const temp = band(avg(tmins), 2, 8, 15, 20) * band(avg(tmaxs), 7, 14, 23, 30)

  let after = 0
  for (let i = best.start + 1; i <= index; i += 1) after += rain(i)
  const upkeep = Math.min(1, 0.55 + after / 25)
  const frost = Math.min(...tmins) < -1 ? 0.25 : 1

  return 100 * best.trigger * temp * upkeep * frost
}

async function main(): Promise<void> {
  const explainIndex = process.argv.indexOf('--explain')
  const explainZone = explainIndex >= 0 ? process.argv[explainIndex + 1] : undefined

  const todayIso = today()
  console.log(`MPI ${ALGORITHM_V1.version} - ${todayIso}\n`)

  const responses = await fetchZones()

  const rows: Array<{ zone: string; mpi: number; baseline: number; conf: number; label: string }> = []

  for (const [i, zone] of ZONES.entries()) {
    const response = responses[i]
    if (response === undefined) continue

    const days = toDailyWeather(response, todayIso)
    const todayIndex = days.findIndex((d) => d.date === todayIso)
    if (todayIndex < 0) continue

    const cell: CellContext = {
      elevationM: zone.elevationM,
      // Esposizione e chioma verranno dal DTM e dall'UCS: per ora non le imponiamo.
      aspectDeg: null,
      slopeDeg: null,
      canopyDensity: null,
    }

    const features = buildFeatures(days.slice(0, todayIndex + 1), cell, ALGORITHM_V1)
    const result = computeMpi({ features, cell })

    // Confidence: senza stazioni SIR interpolate il dato e' tutto modellato, e si vede.
    const confidence = aggregateConfidence({
      variables: (['precipitation', 'temperature_max', 'temperature_min', 'soil_moisture', 'et0'] as const).map(
        (variable) =>
          variableConfidence({
            variable,
            provenance: 'MODELLED',
            stations: [],
            horizonDays: 0,
            ensembleAgreement: null,
            coverage: features.coverage,
          }),
      ),
      weights: DEFAULT_VARIABLE_WEIGHTS,
    })

    rows.push({
      zone: zone.name,
      mpi: result.mpi,
      baseline: Math.round(baselineMpi(days, todayIndex) * 10) / 10,
      conf: confidence.score,
      label: mpiLabel(result.mpi),
    })

    if (explainZone === zone.code) {
      printExplanation(zone.name, result, features, confidence)
    }
  }

  console.log(
    `${'zona'.padEnd(21)} ${'MPI v1'.padStart(7)} ${'baseline'.padStart(9)} ${'conf'.padStart(5)}  etichetta`,
  )
  for (const row of rows) {
    console.log(
      `${row.zone.padEnd(21)} ${row.mpi.toFixed(1).padStart(7)} ` +
        `${row.baseline.toFixed(1).padStart(9)} ${row.conf.toFixed(0).padStart(5)}  ${row.label}`,
    )
  }

  console.log(`\nFinestra idrica: ${addDays(todayIso, -26)} -> ${todayIso}`)
  console.log('Suggerimento: --explain <codice zona> per il dettaglio dei fattori.')
}

function printExplanation(
  name: string,
  result: ReturnType<typeof computeMpi>,
  features: ReturnType<typeof buildFeatures>,
  confidence: ReturnType<typeof aggregateConfidence>,
): void {
  const explanation = explainScore(result, features, confidence.score, confidence.factors)
  console.log(`\n=== ${name}: perche' questo punteggio ===`)
  console.log(`MPI ${explanation.mpi} (${explanation.label}), confidence ${explanation.confidence}`)
  if (explanation.limitingFactor !== null) {
    console.log(`Fattore limitante: ${explanation.limitingFactor}`)
  }

  const show = (title: string, factors: readonly { label: string; contribution: number; value: string; provenance: string }[]): void => {
    if (factors.length === 0) return
    console.log(`\n${title}`)
    for (const factor of factors) {
      const mark = factor.provenance === 'calibrate' ? ' [da calibrare]' : ''
      console.log(
        `  ${factor.contribution >= 0 ? '+' : ''}${factor.contribution.toFixed(1)} ` +
          `${factor.label}${mark}\n      ${factor.value}`,
      )
    }
  }

  show('Fattori positivi:', explanation.positiveFactors)
  show('Fattori negativi:', explanation.negativeFactors)
  show('Fattori neutri:', explanation.neutralFactors)
  console.log('')
}

main().catch((error: unknown) => {
  console.error('Calcolo fallito:', error)
  process.exitCode = 1
})
