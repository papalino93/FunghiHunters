/**
 * Job di ingestione giornaliera, eseguibile subito e senza database.
 *
 *   npx tsx scripts/ingest-daily.ts
 *   npx tsx scripts/ingest-daily.ts --out data/daily.json
 *
 * Fa il giro completo: legge l'anagrafica, scarica i tre layer giornalieri del GeoServer,
 * normalizza, applica i controlli di qualita' e stampa un riepilogo. Scrivere su Postgres sara'
 * l'ultimo passo, non il primo: finche' la pipeline non e' affidabile, un file e' piu' facile da
 * guardare di una tabella.
 *
 * In produzione girera' su GitHub Actions, non su Vercel: il piano Hobby consente un solo cron
 * al giorno con precisione di un'ora, e i job di ingestione non stanno nei 300 secondi di una
 * funzione serverless.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { Observation, Station } from '@/lib/domain/types'
import { addDays, today } from '@/lib/domain/time'
import { ZONE_REFERENCE_STATIONS } from '@/lib/config/zones'
import { SirGeoserverAdapter, SIR_DAILY_LAYERS } from '@/lib/sources/sir-geoserver'
import {
  applyFindings,
  checkRange,
  checkSpatialOutlier,
  checkTemperatureConsistency,
  type QcFinding,
} from '@/lib/qc/checks'

interface Summary {
  readonly runAt: string
  readonly referenceDate: string | null
  readonly stationCount: number
  readonly observationCount: number
  readonly missingCount: number
  readonly flagged: Readonly<Record<string, number>>
  readonly layerFreshness: Readonly<Record<string, string | null>>
  readonly findings: readonly QcFinding[]
}

async function main(): Promise<void> {
  const outIndex = process.argv.indexOf('--out')
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined

  const adapter = new SirGeoserverAdapter()
  const runAt = new Date().toISOString()

  console.log('Anagrafica stazioni...')
  const stations = await adapter.listStations()
  const byCode = new Map(stations.map((s) => [s.code, s]))
  console.log(`  ${stations.length} stazioni`)

  console.log('Layer giornalieri...')
  const observations = await adapter.fetchObservations()
  console.log(`  ${observations.length} osservazioni`)

  const freshness: Record<string, string | null> = {}
  for (const layer of SIR_DAILY_LAYERS) {
    freshness[layer.layer] = await adapter.fetchLayerFreshness(layer.layer)
  }

  console.log('Controllo qualita\'...')
  const findings = runQualityControl(observations, byCode)
  const marked = applyFindings(observations, findings)

  const flagged: Record<string, number> = {}
  for (const obs of marked) {
    flagged[obs.qualityFlag] = (flagged[obs.qualityFlag] ?? 0) + 1
  }

  const summary: Summary = {
    runAt,
    referenceDate: marked[0]?.date ?? null,
    stationCount: new Set(marked.map((o) => o.stationCode)).size,
    observationCount: marked.length,
    missingCount: marked.filter((o) => o.value === null).length,
    flagged,
    layerFreshness: freshness,
    findings,
  }

  report(summary, marked, byCode)

  if (outPath !== undefined) {
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, JSON.stringify({ summary, observations: marked }, null, 2), 'utf8')
    console.log(`\nScritto ${outPath}`)
  }
}

/**
 * I controlli che hanno senso su un solo giorno.
 * Lo zero prolungato e la staleness richiedono una storia e girano nel job di consolidamento.
 */
function runQualityControl(
  observations: readonly Observation[],
  byCode: ReadonlyMap<string, Station>,
): QcFinding[] {
  const findings: QcFinding[] = []

  for (const obs of observations) {
    const rangeFinding = checkRange(obs)
    if (rangeFinding !== null) findings.push(rangeFinding)
  }

  findings.push(...checkTemperatureConsistency(observations))

  // Outlier spaziale: confronta ogni stazione con le vicine comparabili dello stesso giorno.
  const sameVariable = new Map<string, Observation[]>()
  for (const obs of observations) {
    if (obs.value === null) continue
    const key = `${obs.variable}|${obs.date}|${obs.window}`
    const bucket = sameVariable.get(key) ?? []
    bucket.push(obs)
    sameVariable.set(key, bucket)
  }

  for (const bucket of sameVariable.values()) {
    for (const obs of bucket) {
      const target = byCode.get(obs.stationCode)
      if (target === undefined) continue
      const neighbours = bucket
        .filter((o) => o.stationCode !== obs.stationCode)
        .flatMap((o) => {
          const station = byCode.get(o.stationCode)
          return station === undefined || o.value === null ? [] : [{ station, value: o.value }]
        })
      const finding = checkSpatialOutlier(obs, target, neighbours)
      if (finding !== null) findings.push(finding)
    }
  }

  return findings
}

function report(
  summary: Summary,
  observations: readonly Observation[],
  byCode: ReadonlyMap<string, Station>,
): void {
  console.log('\n--- Riepilogo ---')
  console.log(`Giorno di riferimento : ${summary.referenceDate ?? 'n/d'}`)
  console.log(`Stazioni              : ${summary.stationCount}`)
  console.log(`Osservazioni          : ${summary.observationCount}`)
  console.log(
    `Valori assenti        : ${summary.missingCount} ` +
      `(${((summary.missingCount / Math.max(1, summary.observationCount)) * 100).toFixed(1)} %)`,
  )

  console.log('\nFlag di qualita\':')
  for (const [flag, count] of Object.entries(summary.flagged).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${flag.padEnd(16)} ${count}`)
  }

  console.log('\nAggiornamento dichiarato dalla fonte:')
  for (const [layer, when] of Object.entries(summary.layerFreshness)) {
    console.log(`  ${layer.padEnd(40)} ${when ?? 'n/d'}`)
  }

  if (summary.findings.length > 0) {
    console.log(`\nSegnalazioni (${summary.findings.length}), prime 10:`)
    for (const finding of summary.findings.slice(0, 10)) {
      const name = byCode.get(finding.stationCode)?.name ?? finding.stationCode
      console.log(`  [${finding.flag}] ${name} ${finding.variable}: ${finding.reason}`)
    }
  } else {
    console.log('\nNessuna segnalazione.')
  }

  // Le sette zone di taratura: verifica rapida che i dati arrivino dove servono.
  console.log('\nPioggia di ieri sulle stazioni delle zone di taratura:')
  const rain = observations.filter((o) => o.variable === 'precipitation' && o.window === '0_24')
  for (const code of Object.values(ZONE_REFERENCE_STATIONS)) {
    const value = rain.find((o) => o.stationCode === code)
    const name = byCode.get(code)?.name ?? code
    console.log(
      `  ${name.padEnd(34)} ${value?.value === null || value === undefined ? 'n/d' : `${value.value} mm`}`,
    )
  }

  console.log(`\nFinestra utile per il modello: ${addDays(today(), -26)} -> ${today()}`)
}

main().catch((error: unknown) => {
  console.error('Ingestione fallita:', error)
  process.exitCode = 1
})
