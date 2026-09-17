/**
 * Valida l'interpolazione con leave-one-out cross-validation su dati SIR reali.
 *
 *   npx tsx scripts/validate-interpolation.ts
 *   npx tsx scripts/validate-interpolation.ts --stations 80 --days 40
 *
 * La domanda a cui risponde e' una sola: **lo schema regressione + IDW batte davvero il
 * "prendi la stazione piu' vicina"?** Se non lo battesse, tutta la complessita' in piu' non
 * sarebbe giustificata e sarebbe onesto dirlo.
 *
 * Scarica le serie storiche dall'archivio SIR, che non ha filtri temporali e restituisce tutto:
 * per questo il numero di stazioni e' limitato e c'e' una pausa fra una richiesta e l'altra.
 */

import { ZONES } from '@/lib/config/zones'
import { addDays, today } from '@/lib/domain/time'
import { distanceKm } from '@/lib/qc/checks'
import { fetchJson } from '@/lib/sources/http'
import {
  isStationActive,
  parseSeries,
  parseStations,
  seriesUrl,
  stationsUrl,
} from '@/lib/sources/sir-archive'
import type { Station, Variable } from '@/lib/domain/types'
import type { StationSample } from '@/lib/spatial/interpolate'
import { crossValidate, meanNearestDistanceKm } from '@/lib/spatial/validate'

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  return Number.isFinite(value) ? value : fallback
}

/** Distanza minima da una qualsiasi delle sette zone di taratura. */
function distanceToZones(station: Station): number {
  return Math.min(
    ...ZONES.map((z) => distanceKm(z.latitude, z.longitude, station.latitude, station.longitude)),
  )
}

async function main(): Promise<void> {
  const maxStations = arg('stations', 60)
  const dayCount = arg('days', 40)
  const endDate = addDays(today(), -1)
  const startDate = addDays(endDate, -(dayCount - 1))

  console.log(`Validazione interpolazione: ${startDate} -> ${endDate}\n`)

  const stations = parseStations(await fetchJson(stationsUrl(), { timeoutMs: 120_000 }))

  // Stazioni attive quest'anno e vicine alle zone di taratura, con quota nota.
  const candidates = stations
    .filter((s) => s.elevationM !== null)
    .filter(
      (s) =>
        isStationActive(s, 'precipitation', 2026) && isStationActive(s, 'temperature_max', 2026),
    )
    .map((s) => ({ station: s, zoneDistance: distanceToZones(s) }))
    .sort((a, b) => a.zoneDistance - b.zoneDistance)
    .slice(0, maxStations)

  console.log(`${candidates.length} stazioni selezionate attorno alle sette zone`)
  const last = candidates[candidates.length - 1]
  console.log(
    `  distanza dalle zone: da ${candidates[0]?.zoneDistance.toFixed(1)} a ` +
      `${last?.zoneDistance.toFixed(1)} km`,
  )
  const elevations = candidates.map((c) => c.station.elevationM ?? 0)
  console.log(
    `  quote: da ${Math.min(...elevations).toFixed(0)} a ${Math.max(...elevations).toFixed(0)} m`,
  )
  console.log(
    `  distanza media dalla stazione piu' vicina: ` +
      `${meanNearestDistanceKm(candidates.map((c) => toSample(c.station, 0))).toFixed(1)} km\n`,
  )

  // Serie giornaliere per grandezza. L'archivio non filtra: si scarica tutto e si ritaglia.
  const seriesByVariable = new Map<Variable, Map<string, Map<string, number>>>()
  const jobs: Array<{ variable: Variable; idst: string; nonNegative: boolean }> = [
    { variable: 'precipitation', idst: 'pluvio0_24', nonNegative: true },
    { variable: 'temperature_max', idst: 'termo_max', nonNegative: false },
    { variable: 'temperature_min', idst: 'termo_min', nonNegative: false },
  ]

  for (const job of jobs) {
    const byStation = new Map<string, Map<string, number>>()
    process.stdout.write(`Scarico ${job.idst}: `)
    for (const [index, candidate] of candidates.entries()) {
      try {
        const payload = await fetchJson(seriesUrl(candidate.station.code, job.idst), {
          timeoutMs: 90_000,
        })
        const observations = parseSeries(payload, candidate.station.code, job.idst)
        const inRange = new Map<string, number>()
        for (const obs of observations) {
          if (obs.date < startDate || obs.date > endDate) continue
          if (obs.value !== null) inRange.set(obs.date, obs.value)
        }
        if (inRange.size > 0) byStation.set(candidate.station.code, inRange)
      } catch {
        // Una stazione che non risponde non ferma la validazione: si nota e si va avanti.
      }
      if ((index + 1) % 10 === 0) process.stdout.write('.')
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
    console.log(` ${byStation.size} serie`)
    seriesByVariable.set(job.variable, byStation)
  }

  console.log('\n--- Leave-one-out cross-validation ---')
  console.log(
    `${'grandezza'.padEnd(18)} ${'giorni'.padStart(6)} ${'n'.padStart(6)} ` +
      `${'MAE'.padStart(7)} ${'RMSE'.padStart(7)} ${'bias'.padStart(7)} ` +
      `${'MAE vicina'.padStart(11)} ${'guadagno'.padStart(9)}`,
  )

  for (const job of jobs) {
    const byStation = seriesByVariable.get(job.variable)
    if (byStation === undefined) continue

    let maeSum = 0
    let nearestSum = 0
    let rmseSum = 0
    let biasSum = 0
    let nTotal = 0
    let daysUsed = 0

    for (let d = 0; d < dayCount; d += 1) {
      const date = addDays(startDate, d)
      const samples: StationSample[] = []
      for (const candidate of candidates) {
        const value = byStation.get(candidate.station.code)?.get(date)
        if (value === undefined) continue
        samples.push(toSample(candidate.station, value))
      }
      // Per la pioggia salta i giorni in cui non piove da nessuna parte: l'errore sarebbe zero
      // per costruzione e gonfierebbe artificialmente il risultato.
      if (job.nonNegative && samples.every((s) => s.value === 0)) continue

      const report = crossValidate(job.variable, samples, job.nonNegative)
      if (report === null) continue

      maeSum += report.mae * report.n
      nearestSum += report.nearestMae * report.n
      rmseSum += report.rmse * report.n
      biasSum += report.bias * report.n
      nTotal += report.n
      daysUsed += 1
    }

    if (nTotal === 0) {
      console.log(`${job.variable.padEnd(18)} nessun dato utilizzabile`)
      continue
    }

    const mae = maeSum / nTotal
    const nearest = nearestSum / nTotal
    const gain = nearest === 0 ? 0 : ((nearest - mae) / nearest) * 100
    const unit = job.variable === 'precipitation' ? 'mm' : 'C'

    console.log(
      `${job.variable.padEnd(18)} ${String(daysUsed).padStart(6)} ${String(nTotal).padStart(6)} ` +
        `${mae.toFixed(2).padStart(7)} ${(rmseSum / nTotal).toFixed(2).padStart(7)} ` +
        `${(biasSum / nTotal).toFixed(2).padStart(7)} ${nearest.toFixed(2).padStart(11)} ` +
        `${`${gain >= 0 ? '+' : ''}${gain.toFixed(1)} %`.padStart(9)}   ${unit}`,
    )
  }

  console.log(
    '\nIl confronto e con la stazione piu vicina in distanza EFFICACE, che gia tiene conto\n' +
      'della quota: e il termine di paragone piu duro fra quelli ingenui.',
  )
}

function toSample(station: Station, value: number): StationSample {
  return {
    stationCode: station.code,
    latitude: station.latitude,
    longitude: station.longitude,
    elevationM: station.elevationM ?? 0,
    value,
    // I dati recenti dell'archivio non sono validati dalla fonte.
    validated: false,
  }
}

main().catch((error: unknown) => {
  console.error('Validazione fallita:', error)
  process.exitCode = 1
})
