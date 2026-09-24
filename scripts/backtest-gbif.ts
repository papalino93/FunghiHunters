/**
 * Backtest caso-controllo dell'MPI sulle presenze di porcino in Italia (GBIF).
 *
 *   npx tsx scripts/backtest-gbif.ts
 *   npx tsx scripts/backtest-gbif.ts --sample 250 --seed 20260924 --cache /percorso/cache
 *   npx tsx scripts/backtest-gbif.ts --offline            # solo quanto gia' in cache, nessuna rete
 *   npx tsx scripts/backtest-gbif.ts --max-calls 50       # al massimo 50 richieste meteo nuove
 *   npx tsx scripts/backtest-gbif.ts --out docs/validazione --rows   # scrive anche le righe in CSV
 *
 * Dietro un proxy HTTPS (sessioni remote) il `fetch` di Node 22 va avviato con
 * `NODE_USE_ENV_PROXY=1`, altrimenti ignora `HTTPS_PROXY`.
 *
 * Opzioni:
 *   --sample N      localita'-anno da valutare, campione stratificato (250)
 *   --strata S      `region` (default) o `region-month`: strati del campione. Per mese si appiattisce
 *                   la stagionalita' dei casi, e il modello nullo di calendario perde proprio
 *                   l'informazione che deve rappresentare: vedi docs/VALIDAZIONE.md
 *   --seed S        seme del campione, dei controlli e del bootstrap (20260924)
 *   --cache DIR     cartella della cache (GBIF e archivio meteo); default $BACKTEST_CACHE_DIR o
 *                   la cartella scratch della sessione che ha creato lo script
 *   --out DIR       dove scrivere backtest-summary.{md,json} (default: la cache)
 *   --rows          scrive anche backtest-rows.csv (una riga per giorno caso/controllo)
 *   --bootstrap B   replicati del bootstrap a grappoli (2000)
 *   --max-calls N   tetto alle richieste meteo nuove di questa corsa (default: nessuno)
 *   --offline       non chiama la rete: usa solo la cache
 *
 * Disegno (Capinha et al. 2019, Int J Biometeorol 63:1015), metodo e limiti: docs/VALIDAZIONE.md.
 *
 * Cosa fa, in ordine:
 *   1. scarica (o rilegge dalla cache) le presenze GBIF dei quattro porcini in Italia 2016-2025;
 *   2. filtra, deduplica lo stesso giorno entro 1 km, raggruppa in localita' e localita'-anno;
 *   3. estrae il campione stratificato e, per ogni localita'-anno, 3 date di controllo;
 *   4. una richiesta all'archivio Open-Meteo per localita'-anno (1 aprile - 30 novembre), con
 *      il ritmo dei limiti del piano gratuito e la cache su disco: la corsa si riprende da dove
 *      si era fermata. **Al primo HTTP 429 smette di chiedere** e valuta quello che ha;
 *   5. punteggio di ogni giorno caso/controllo con le varianti di `src/lib/validation/variants.ts`
 *      e i due modelli nulli di calendario;
 *   6. metriche (`src/lib/validation/metrics.ts`) e riepilogo.
 *
 * Il modello di produzione non viene modificato: lo script usa `buildFeatures` e `computeMpi`
 * cosi' come sono.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { dayOfYear } from '@/lib/model/mpi'
import { HttpError, fetchJson } from '@/lib/sources/http'
import { RateBudgetExhausted, RatePacer } from '@/lib/sources/open-meteo-rate'
import {
  type ArchiveResponse,
  type ArchiveSeries,
  archiveCallWeight,
  archiveToSeries,
  archiveUrl,
} from '@/lib/validation/archive'
import { DEFAULT_CONTROLS, sampleControlDates } from '@/lib/validation/controls'
import {
  type GbifOccurrence,
  type GbifPage,
  GBIF_PAGE_SIZE,
  type LocationYear,
  PORCINI_TAXA,
  type PresenceRecord,
  type RejectReason,
  acceptOccurrence,
  assignLocations,
  buildLocationYears,
  dedupeSameDay,
  gbifSearchUrl,
  stratifiedSample,
} from '@/lib/validation/gbif'
import {
  aucMannWhitney,
  bandCounts,
  brierScore,
  calendarKernelScores,
  calendarMonthlyScores,
  type PairStats,
  clusterBootstrapGroupSets,
  groupSetsToIndices,
  matchedAuc,
  matchedPairStats,
  leaveOneYearOutCalibration,
  leaveOneYearOutPrevalence,
  percentileInterval,
  quantile,
  reliabilityTable,
} from '@/lib/validation/metrics'
import { mulberry32 } from '@/lib/validation/rng'
import { WEATHER_VARIANTS, historyUpTo } from '@/lib/validation/variants'

// ---------------------------------------------------------------------------------------------
// Argomenti
// ---------------------------------------------------------------------------------------------

const DEFAULT_CACHE =
  '/tmp/claude-0/-home-user-FunghiHunters/9d5418dc-3892-547f-8ed1-784166e47483/scratchpad/backtest-cache'

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index < 0 ? undefined : process.argv[index + 1]
}

function argNumber(name: string, fallback: number): number {
  const raw = argValue(name)
  const value = raw === undefined ? Number.NaN : Number(raw)
  return Number.isFinite(value) ? value : fallback
}

const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`)

const SAMPLE = argNumber('sample', 250)
const STRATA = argValue('strata') === 'region-month' ? 'region-month' : 'region'
const SEED = argNumber('seed', 20260924)
const BOOTSTRAP = argNumber('bootstrap', 2000)
const MAX_CALLS = argNumber('max-calls', Number.POSITIVE_INFINITY)
const OFFLINE = hasFlag('offline')
const WRITE_ROWS = hasFlag('rows')
const CACHE_DIR = argValue('cache') ?? process.env.BACKTEST_CACHE_DIR ?? DEFAULT_CACHE
const OUT_DIR = argValue('out') ?? CACHE_DIR

// ---------------------------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function readCache<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    // Un file troncato da una corsa interrotta si riscarica, non si prende per buono.
    return null
  }
}

function writeCache(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value))
}

/** Seme per localita'-anno: i controlli non cambiano se cambia la dimensione del campione. */
function hashSeed(text: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 2_654_435_761)
  return h >>> 0
}

// ---------------------------------------------------------------------------------------------
// 1. GBIF
// ---------------------------------------------------------------------------------------------

async function loadGbif(): Promise<GbifOccurrence[]> {
  const dir = join(CACHE_DIR, 'gbif')
  ensureDir(dir)
  const all: GbifOccurrence[] = []
  for (const taxonKey of Object.keys(PORCINI_TAXA).map(Number)) {
    let offset = 0
    for (;;) {
      const path = join(dir, `${taxonKey}-${offset}.json`)
      let page = readCache<GbifPage>(path)
      if (page === null) {
        if (OFFLINE) throw new Error(`Modalita' offline e pagina GBIF non in cache: ${path}`)
        page = await fetchJson<GbifPage>(gbifSearchUrl(taxonKey, offset), { timeoutMs: 60_000 })
        writeCache(path, page)
      }
      all.push(...page.results)
      if (page.endOfRecords || page.results.length === 0) break
      offset += GBIF_PAGE_SIZE
    }
  }
  // Lo stesso record non compare in due taxon, ma una chiave doppia costerebbe un caso doppio.
  const byKey = new Map(all.map((o) => [o.key, o]))
  return [...byKey.values()]
}

// ---------------------------------------------------------------------------------------------
// 4. Meteo
// ---------------------------------------------------------------------------------------------

interface WeatherOutcome {
  readonly series: Map<string, ArchiveSeries>
  readonly fetched: number
  readonly fromCache: number
  readonly failed: number
  readonly weightSpent: number
  readonly stopReason: string | null
}

async function loadWeather(sample: readonly LocationYear[]): Promise<WeatherOutcome> {
  const dir = join(CACHE_DIR, 'archive')
  ensureDir(dir)
  // Limiti propri sotto quelli dichiarati (600/5000/10000): la quota e' per indirizzo IP, e in
  // una sessione remota l'IP d'uscita puo' essere condiviso con altro traffico.
  const pacer = new RatePacer({
    limits: { perMinute: 300, perHour: 4_000, perDay: 8_000 },
    maxWaitMs: 65 * 60_000,
  })
  const series = new Map<string, ArchiveSeries>()
  let fetched = 0
  let fromCache = 0
  let failed = 0
  let consecutiveFailures = 0
  let weightSpent = 0
  let stopReason: string | null = null

  for (const [n, ly] of sample.entries()) {
    const elevationM = ly.cases.find((c) => c.elevationM !== null)?.elevationM ?? null
    const request = { latitude: ly.latitude, longitude: ly.longitude, year: ly.year, elevationM }
    const path = join(dir, `${ly.id}.json`)
    const cached = readCache<{ url: string; response: ArchiveResponse }>(path)
    const url = archiveUrl(request)
    if (cached !== null && cached.url === url) {
      series.set(ly.id, archiveToSeries(cached.response))
      fromCache += 1
      continue
    }
    if (OFFLINE || stopReason !== null) continue
    if (fetched >= MAX_CALLS) {
      stopReason = `tetto --max-calls ${MAX_CALLS} raggiunto`
      continue
    }
    const weight = archiveCallWeight(ly.year)
    try {
      const waited = await pacer.reserve(weight)
      if (waited > 1000) console.log(`  pausa di ${Math.round(waited / 1000)} s per i limiti Open-Meteo`)
      // Un solo tentativo per il 429: ritentare un limite di quota e' esattamente cio' che non si
      // deve fare. I guasti transitori (5xx, rete) si ritentano qui sotto, a mano.
      const response = await fetchJson<ArchiveResponse>(url, { timeoutMs: 90_000, attempts: 1 })
      weightSpent += weight
      writeCache(path, { url, fetchedAt: new Date().toISOString(), response })
      series.set(ly.id, archiveToSeries(response))
      fetched += 1
      consecutiveFailures = 0
      if (fetched % 10 === 0) {
        console.log(`  meteo: ${fetched} nuove, ${fromCache} da cache (${n + 1}/${sample.length})`)
      }
    } catch (error) {
      if (error instanceof HttpError && error.status === 429) {
        stopReason = `HTTP 429 da Open-Meteo dopo ${fetched} richieste nuove: ${error.bodySnippet.slice(0, 160)}`
        console.log(`  ${stopReason}`)
        continue
      }
      if (error instanceof RateBudgetExhausted) {
        stopReason = error.message
        continue
      }
      failed += 1
      consecutiveFailures += 1
      console.log(`  meteo non disponibile per ${ly.id}: ${String(error).slice(0, 200)}`)
      if (consecutiveFailures >= 5) stopReason = '5 errori di rete consecutivi'
      else await new Promise((resolve) => setTimeout(resolve, 5_000 * consecutiveFailures))
    }
  }
  return { series, fetched, fromCache, failed, weightSpent, stopReason }
}

// ---------------------------------------------------------------------------------------------
// 5. Righe e punteggi
// ---------------------------------------------------------------------------------------------

interface Row {
  readonly locationYear: string
  readonly locationId: string
  readonly region: string
  readonly year: number
  readonly date: string
  readonly month: number
  readonly doy: number
  readonly isCase: boolean
  readonly elevationM: number
  readonly uncertaintyKnown: boolean
  readonly scores: Record<string, number>
  /** Componenti della 1.5, per leggere perche' un caso ha preso poco. */
  readonly water: number
  readonly thermal: number
  readonly phenology: number
}

function scoreRows(
  sample: readonly LocationYear[],
  weather: ReadonlyMap<string, ArchiveSeries>,
): { rows: Row[]; missingDays: number } {
  const rows: Row[] = []
  let missingDays = 0
  for (const ly of sample) {
    const w = weather.get(ly.id)
    if (w === undefined) continue
    const caseDates = [...new Set(ly.cases.map((c) => c.date))]
    const controls = sampleControlDates(
      ly.year,
      caseDates,
      mulberry32(hashSeed(ly.id, SEED)),
      DEFAULT_CONTROLS,
    )
    const entries: { date: string; isCase: boolean; uncertaintyKnown: boolean }[] = [
      ...ly.cases.map((c) => ({ date: c.date, isCase: true, uncertaintyKnown: c.uncertaintyM !== null })),
      ...controls.map((date) => ({
        date,
        isCase: false,
        uncertaintyKnown: ly.cases.some((c) => c.uncertaintyM !== null),
      })),
    ]
    for (const entry of entries) {
      const history = historyUpTo(w.days, entry.date)
      if (history === null || history.length < 30) {
        missingDays += 1
        continue
      }
      const input = { history, elevationM: w.elevationM }
      const scores: Record<string, number> = {}
      let reference: ReturnType<(typeof WEATHER_VARIANTS)[number]['score']> | null = null
      for (const variant of WEATHER_VARIANTS) {
        const result = variant.score(input)
        scores[variant.key] = result.mpi
        if (variant.key === 'v15') reference = result
      }
      rows.push({
        locationYear: ly.id,
        locationId: ly.locationId,
        region: ly.region,
        year: ly.year,
        date: entry.date,
        month: Number(entry.date.slice(5, 7)),
        doy: dayOfYear(entry.date),
        isCase: entry.isCase,
        elevationM: w.elevationM,
        uncertaintyKnown: entry.uncertaintyKnown,
        scores,
        water: reference?.components.water ?? Number.NaN,
        thermal: reference?.components.thermal.score ?? Number.NaN,
        phenology: reference?.components.phenology ?? Number.NaN,
      })
    }
  }
  return { rows, missingDays }
}

// ---------------------------------------------------------------------------------------------
// 6. Metriche
// ---------------------------------------------------------------------------------------------

interface ModelScores {
  readonly key: string
  readonly label: string
  readonly change: string
  readonly values: number[]
  /** Scala per la logistica: l'MPI va in [0, 1], il calendario e' gia' una frazione. */
  readonly scale: number
}

const fmt = (v: number | null, digits = 3): string =>
  v === null || !Number.isFinite(v) ? '—' : v.toFixed(digits)

function elevationBand(m: number): string {
  if (m < 600) return '<600 m'
  if (m <= 1200) return '600-1200 m'
  return '>1200 m'
}

function subsetAuc(model: ModelScores, labels: readonly boolean[], mask: readonly boolean[]): number | null {
  const idx = mask.flatMap((keep, i) => (keep ? [i] : []))
  return aucMannWhitney(model.values, labels, idx)
}

async function main(): Promise<void> {
  ensureDir(CACHE_DIR)
  ensureDir(OUT_DIR)
  console.log(`Cache: ${CACHE_DIR}`)

  const occurrences = await loadGbif()
  const rejected: Partial<Record<RejectReason, number>> = {}
  const accepted: PresenceRecord[] = []
  for (const o of occurrences) {
    const result = acceptOccurrence(o)
    if (result.ok) accepted.push(result.record)
    else rejected[result.reason] = (rejected[result.reason] ?? 0) + 1
  }
  const deduped = dedupeSameDay(accepted)
  const located = assignLocations(deduped)
  const locationYears = buildLocationYears(located)
  const sample = stratifiedSample(
    locationYears,
    SAMPLE,
    (ly) => (STRATA === 'region' ? ly.region : `${ly.region}|${ly.firstMonth}`),
    mulberry32(SEED),
  )
  const sampleCases = sample.reduce((acc, ly) => acc + ly.cases.length, 0)
  console.log(
    `GBIF: ${occurrences.length} record, ${accepted.length} accettati, ${deduped.length} dopo ` +
      `deduplica, ${new Set(located.map((r) => r.locationId)).size} localita', ` +
      `${locationYears.length} localita'-anno; campione ${sample.length} (${sampleCases} casi)`,
  )
  console.log(`Scarti: ${JSON.stringify(rejected)}`)

  const weather = await loadWeather(sample)
  console.log(
    `Meteo: ${weather.fetched} nuove, ${weather.fromCache} da cache, ${weather.failed} fallite, ` +
      `peso speso ${weather.weightSpent.toFixed(0)}` +
      (weather.stopReason === null ? '' : `; fermato: ${weather.stopReason}`),
  )

  const { rows, missingDays } = scoreRows(sample, weather.series)
  const labels = rows.map((r) => r.isCase)
  const years = rows.map((r) => r.year)
  const groups = rows.map((r) => r.locationYear)
  const nCases = labels.filter(Boolean).length
  const nControls = labels.length - nCases
  console.log(`Righe valutate: ${rows.length} (${nCases} casi, ${nControls} controlli), giorni senza meteo ${missingDays}`)
  if (nCases === 0 || nControls === 0) {
    console.log('Nessun caso o nessun controllo valutabile: niente metriche.')
    writeFileSync(
      join(OUT_DIR, 'backtest-summary.json'),
      JSON.stringify({ incomplete: true, weather: { ...weather, series: undefined }, rejected }, null, 2),
    )
    return
  }

  const models: ModelScores[] = [
    ...WEATHER_VARIANTS.map((v) => ({
      key: v.key,
      label: v.label,
      change: v.change,
      values: rows.map((r) => r.scores[v.key] ?? 0),
      scale: 100,
    })),
    {
      key: 'calendario-mese',
      label: '(f) nullo: calendario mensile',
      change: 'frazione dei casi degli altri anni nello stesso mese',
      values: calendarMonthlyScores(rows.map((r) => r.month), labels, years),
      scale: 1,
    },
    {
      key: 'calendario-giorno',
      label: '(f2) nullo: calendario a nucleo',
      change: 'densita\' dei giorni dell\'anno dei casi degli altri anni, nucleo 10 giorni',
      values: calendarKernelScores(rows.map((r) => r.doy), labels, years),
      scale: 1,
    },
  ]
  const byKey = new Map(models.map((m) => [m.key, m]))
  const v15 = byKey.get('v15')
  const nullMonth = byKey.get('calendario-mese')
  const nullKernel = byKey.get('calendario-giorno')
  if (v15 === undefined || nullMonth === undefined || nullKernel === undefined) {
    throw new Error('varianti di riferimento mancanti')
  }

  // Gli stessi replicati per l'AUC complessiva e per quella appaiata, e per tutte le varianti:
  // le differenze fra varianti sono cosi' appaiate replicato per replicato.
  const bootGroups = clusterBootstrapGroupSets(groups, BOOTSTRAP, mulberry32(SEED + 1))
  const boot = groupSetsToIndices(groups, bootGroups)
  const bootAuc = new Map<string, (number | null)[]>()
  const bootMatched = new Map<string, (number | null)[]>()
  const matchedStats = new Map<string, Map<string, PairStats>>()
  for (const m of models) {
    bootAuc.set(m.key, boot.map((idx) => aucMannWhitney(m.values, labels, idx)))
    const stats = matchedPairStats(m.values, labels, groups)
    matchedStats.set(m.key, stats)
    bootMatched.set(m.key, bootGroups.map((set) => matchedAuc(stats, set)))
  }
  const diffCi = (
    a: string,
    b: string,
    source: ReadonlyMap<string, (number | null)[]> = bootAuc,
  ): { low: number; high: number; pBelow0: number } => {
    const xa = source.get(a) ?? []
    const xb = source.get(b) ?? []
    const diffs = xa.flatMap((v, i) => {
      const w = xb[i]
      return v === null || w === null || w === undefined ? [] : [v - w]
    })
    const ci = percentileInterval(diffs)
    return { ...ci, pBelow0: diffs.filter((d) => d <= 0).length / Math.max(1, diffs.length) }
  }

  const prevalence = leaveOneYearOutPrevalence(labels, years)
  const brierBaseline = brierScore(prevalence, labels)

  interface Summary {
    key: string
    label: string
    change: string
    auc: number | null
    ci: { low: number; high: number }
    vsV15: { delta: number | null; low: number; high: number; pBelow0: number }
    vsCalendar: { delta: number | null; low: number; high: number; pBelow0: number }
    vsKernel: { delta: number | null; low: number; high: number; pBelow0: number }
    matched: number | null
    matchedCi: { low: number; high: number }
    matchedVsV15: { delta: number | null; low: number; high: number; pBelow0: number }
    matchedVsCalendar: { delta: number | null; low: number; high: number; pBelow0: number }
    brier: number
    brierSkill: number
    byElevation: Record<string, number | null>
    byMonth: Record<string, number | null>
    sensitivity: Record<string, number | null>
    caseBands: number[]
    caseMedian: number
  }

  const elevationBands = ['<600 m', '600-1200 m', '>1200 m']
  const months = [...new Set(rows.map((r) => r.month))].sort((a, b) => a - b)
  const summaries: Summary[] = models.map((m) => {
    const auc = aucMannWhitney(m.values, labels)
    const calibrated = leaveOneYearOutCalibration(m.values.map((v) => v / m.scale), labels, years)
    const brier = brierScore(calibrated, labels)
    const delta = (other: ModelScores): number | null => {
      const o = aucMannWhitney(other.values, labels)
      return auc === null || o === null ? null : auc - o
    }
    const caseValues = m.values.filter((_, i) => labels[i])
    const matchedOf = (key: string): number | null => {
      const stats = matchedStats.get(key)
      return stats === undefined ? null : matchedAuc(stats)
    }
    const matched = matchedOf(m.key)
    const matchedDelta = (key: string): number | null => {
      const o = matchedOf(key)
      return matched === null || o === null ? null : matched - o
    }
    return {
      key: m.key,
      label: m.label,
      change: m.change,
      auc,
      ci: percentileInterval(bootAuc.get(m.key) ?? []),
      vsV15: { delta: delta(v15), ...diffCi(m.key, 'v15') },
      vsCalendar: { delta: delta(nullMonth), ...diffCi(m.key, 'calendario-mese') },
      vsKernel: { delta: delta(nullKernel), ...diffCi(m.key, 'calendario-giorno') },
      matched,
      matchedCi: percentileInterval(bootMatched.get(m.key) ?? []),
      matchedVsV15: { delta: matchedDelta('v15'), ...diffCi(m.key, 'v15', bootMatched) },
      matchedVsCalendar: {
        delta: matchedDelta('calendario-mese'),
        ...diffCi(m.key, 'calendario-mese', bootMatched),
      },
      brier,
      brierSkill: 1 - brier / brierBaseline,
      byElevation: Object.fromEntries(
        elevationBands.map((band) => [
          band,
          subsetAuc(m, labels, rows.map((r) => elevationBand(r.elevationM) === band)),
        ]),
      ),
      byMonth: Object.fromEntries(
        // Dentro un mese il calendario mensile e' costante a meno dell'anno lasciato fuori: la sua
        // "AUC del mese" misurerebbe solo quale anno e' stato escluso, quindi non si riporta.
        months.map((month) => [
          String(month),
          m.key === 'calendario-mese'
            ? null
            : subsetAuc(m, labels, rows.map((r) => r.month === month)),
        ]),
      ),
      sensitivity: {
        'casi giu-nov': subsetAuc(m, labels, rows.map((r) => r.month >= 6)),
        'solo incertezza nota': subsetAuc(m, labels, rows.map((r) => r.uncertaintyKnown)),
        'senza Trentino-Alto Adige': subsetAuc(
          m,
          labels,
          rows.map((r) => r.region !== 'Trentino-Alto Adige'),
        ),
      },
      caseBands: m.scale === 100 ? bandCounts(caseValues, [20, 40, 60, 80]) : [],
      caseMedian: quantile(caseValues, 0.5),
    }
  })

  // Tabella di affidabilita' per la 1.5 e per il calendario, dopo calibrazione LOYO.
  const reliability = Object.fromEntries(
    [v15, nullMonth].map((m) => [
      m.key,
      reliabilityTable(leaveOneYearOutCalibration(m.values.map((v) => v / m.scale), labels, years), labels, 10),
    ]),
  )

  // ------------------------------------------------------------------ riepilogo leggibile
  const lines: string[] = []
  const regionsInRows = new Map<string, number>()
  for (const r of rows) if (r.isCase) regionsInRows.set(r.region, (regionsInRows.get(r.region) ?? 0) + 1)
  const elevationsCases = rows.filter((r) => r.isCase).map((r) => r.elevationM)
  lines.push(`# Backtest GBIF — riepilogo generato`)
  lines.push('')
  lines.push(`Generato: ${new Date().toISOString()} — seme ${SEED}, bootstrap ${BOOTSTRAP} replicati a grappoli (localita'-anno).`)
  lines.push('')
  lines.push(
    `GBIF: ${occurrences.length} record scaricati, ${accepted.length} accettati, ${deduped.length} dopo deduplica ` +
      `(stesso giorno entro 1 km), ${locationYears.length} localita'-anno. Scarti: ${JSON.stringify(rejected)}.`,
  )
  lines.push(
    `Campione: ${sample.length} localita'-anno (strati: ${STRATA === 'region' ? 'regione' : 'regione x mese'}, allocazione uguale). Meteo disponibile per ` +
      `${weather.series.size} (${weather.fetched} scaricate ora, ${weather.fromCache} da cache, ` +
      `${weather.failed} fallite)` + (weather.stopReason === null ? '.' : `; corsa fermata: ${weather.stopReason}.`),
  )
  lines.push(
    `Righe: ${rows.length} = ${nCases} casi + ${nControls} controlli (${missingDays} giorni scartati per meteo mancante). ` +
      `Quota dei casi: mediana ${quantile(elevationsCases, 0.5).toFixed(0)} m, ` +
      `10°-90° percentile ${quantile(elevationsCases, 0.1).toFixed(0)}-${quantile(elevationsCases, 0.9).toFixed(0)} m.`,
  )
  lines.push(
    `Casi per regione: ${[...regionsInRows.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
  )
  lines.push(`Brier di riferimento (sola prevalenza, LOYO): ${fmt(brierBaseline)}.`)
  lines.push('')
  lines.push('## AUC per variante')
  lines.push('')
  lines.push('| Variante | Cambiamento | AUC [IC 95%] | Δ vs 1.5 [IC 95%] | Δ vs calendario mensile [IC 95%] | Δ vs calendario a nucleo [IC 95%] | Brier (LOYO) | BSS |')
  lines.push('|---|---|---|---|---|---|---|---|')
  for (const s of summaries) {
    const d = (x: { delta: number | null; low: number; high: number }): string =>
      `${fmt(x.delta)} [${fmt(x.low)}, ${fmt(x.high)}]`
    lines.push(
      `| ${s.label} | ${s.change} | ${fmt(s.auc)} [${fmt(s.ci.low)}, ${fmt(s.ci.high)}] | ` +
        `${s.key === 'v15' ? '—' : d(s.vsV15)} | ${s.key === 'calendario-mese' ? '—' : d(s.vsCalendar)} | ` +
        `${s.key === 'calendario-giorno' ? '—' : d(s.vsKernel)} | ${fmt(s.brier, 4)} | ${fmt(s.brierSkill)} |`,
    )
  }
  lines.push('')
  lines.push('## AUC appaiata (caso contro controlli della stessa localita\'-anno)')
  lines.push('')
  lines.push('| Variante | AUC appaiata [IC 95%] | Δ vs 1.5 [IC 95%] | Δ vs calendario mensile [IC 95%] |')
  lines.push('|---|---|---|---|')
  for (const s of summaries) {
    const d = (x: { delta: number | null; low: number; high: number }): string =>
      `${fmt(x.delta)} [${fmt(x.low)}, ${fmt(x.high)}]`
    lines.push(
      `| ${s.label} | ${fmt(s.matched)} [${fmt(s.matchedCi.low)}, ${fmt(s.matchedCi.high)}] | ` +
        `${s.key === 'v15' ? '—' : d(s.matchedVsV15)} | ` +
        `${s.key === 'calendario-mese' ? '—' : d(s.matchedVsCalendar)} |`,
    )
  }
  lines.push('')
  lines.push('## AUC per fascia di quota e per mese')
  lines.push('')
  const bandN = elevationBands.map((band) => {
    const sub = rows.filter((r) => elevationBand(r.elevationM) === band)
    return `${band}: ${sub.filter((r) => r.isCase).length} casi / ${sub.filter((r) => !r.isCase).length} controlli`
  })
  const monthN = months.map((month) => {
    const sub = rows.filter((r) => r.month === month)
    return `${month}: ${sub.filter((r) => r.isCase).length}/${sub.filter((r) => !r.isCase).length}`
  })
  lines.push(`Numerosita' (casi/controlli): ${bandN.join('; ')}. Mesi: ${monthN.join('; ')}.`)
  lines.push('')
  lines.push(`| Variante | ${elevationBands.join(' | ')} | ${months.map((m) => `mese ${m}`).join(' | ')} |`)
  lines.push(`|---|${elevationBands.map(() => '---').join('|')}|${months.map(() => '---').join('|')}|`)
  for (const s of summaries) {
    lines.push(
      `| ${s.label} | ${elevationBands.map((b) => fmt(s.byElevation[b] ?? null)).join(' | ')} | ` +
        `${months.map((m) => fmt(s.byMonth[String(m)] ?? null)).join(' | ')} |`,
    )
  }
  lines.push('')
  lines.push('## Sensibilita\'')
  lines.push('')
  const sensKeys = Object.keys(summaries[0]?.sensitivity ?? {})
  lines.push(`| Variante | ${sensKeys.join(' | ')} |`)
  lines.push(`|---|${sensKeys.map(() => '---').join('|')}|`)
  for (const s of summaries) lines.push(`| ${s.label} | ${sensKeys.map((k) => fmt(s.sensitivity[k] ?? null)).join(' | ')} |`)
  lines.push('')
  lines.push('## MPI nei giorni in cui i porcini sono stati trovati')
  lines.push('')
  lines.push('| Variante | <20 | 20-40 | 40-60 | 60-80 | >=80 | mediana |')
  lines.push('|---|---|---|---|---|---|---|')
  for (const s of summaries) {
    if (s.caseBands.length === 0) continue
    const pct = s.caseBands.map((c) => `${c} (${((100 * c) / nCases).toFixed(0)}%)`)
    lines.push(`| ${s.label} | ${pct.join(' | ')} | ${fmt(s.caseMedian, 1)} |`)
  }
  lines.push('')
  lines.push('## Affidabilita\' (decili, dopo calibrazione logistica LOYO)')
  for (const [key, table] of Object.entries(reliability)) {
    lines.push('')
    lines.push(`**${byKey.get(key)?.label ?? key}**`)
    lines.push('')
    lines.push('| Decile | n | p prevista media | frequenza osservata |')
    lines.push('|---|---|---|---|')
    for (const [i, bin] of table.entries()) {
      lines.push(`| ${i + 1} | ${bin.n} | ${fmt(bin.meanPredicted)} | ${fmt(bin.observedRate)} |`)
    }
  }
  // Perche' i casi con MPI basso prendono poco: il fattore limitante medio.
  const lowCases = rows.filter((r) => r.isCase && (r.scores.v15 ?? 0) < 20)
  if (lowCases.length > 0) {
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
    lines.push('')
    lines.push('## Casi con MPI 1.5 < 20: da che cosa dipende')
    lines.push('')
    lines.push(
      `${lowCases.length} casi. Media dei componenti della 1.5: acqua ${fmt(mean(lowCases.map((r) => r.water)), 2)}, ` +
        `termico ${fmt(mean(lowCases.map((r) => r.thermal)), 2)}, stagione ${fmt(mean(lowCases.map((r) => r.phenology)), 2)}. ` +
        `Fattore piu' basso: acqua ${lowCases.filter((r) => r.water <= Math.min(r.thermal, r.phenology)).length}, ` +
        `termico ${lowCases.filter((r) => r.thermal < r.water && r.thermal <= r.phenology).length}, ` +
        `stagione ${lowCases.filter((r) => r.phenology < r.water && r.phenology < r.thermal).length}.`,
    )
  }
  const markdown = lines.join('\n')
  console.log(`\n${markdown}`)
  writeFileSync(join(OUT_DIR, 'backtest-summary.md'), `${markdown}\n`)
  writeFileSync(
    join(OUT_DIR, 'backtest-summary.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        seed: SEED,
        bootstrap: BOOTSTRAP,
        gbif: {
          records: occurrences.length,
          accepted: accepted.length,
          deduped: deduped.length,
          locationYears: locationYears.length,
          rejected,
        },
        sample: { locationYears: sample.length, cases: sampleCases },
        weather: {
          fetched: weather.fetched,
          fromCache: weather.fromCache,
          failed: weather.failed,
          weightSpent: weather.weightSpent,
          stopReason: weather.stopReason,
          available: weather.series.size,
        },
        rows: { total: rows.length, cases: nCases, controls: nControls, missingDays },
        brierBaseline,
        summaries,
        reliability,
      },
      null,
      2,
    ),
  )
  if (WRITE_ROWS) {
    const header = [
      'location_year', 'region', 'year', 'date', 'is_case', 'elevation_m', 'uncertainty_known',
      ...models.map((m) => m.key), 'v15_water', 'v15_thermal', 'v15_phenology',
    ]
    const csv = [header.join(',')]
    for (const [i, r] of rows.entries()) {
      csv.push(
        [
          r.locationYear, JSON.stringify(r.region), r.year, r.date, r.isCase ? 1 : 0, Math.round(r.elevationM),
          r.uncertaintyKnown ? 1 : 0,
          ...models.map((m) => {
            const v = m.values[i] ?? Number.NaN
            return m.scale === 100 ? v.toFixed(1) : v.toFixed(4)
          }),
          r.water.toFixed(3), r.thermal.toFixed(3), r.phenology.toFixed(3),
        ].join(','),
      )
    }
    writeFileSync(join(OUT_DIR, 'backtest-rows.csv'), `${csv.join('\n')}\n`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
