/**
 * Quale modello di Open-Meteo vede davvero la pioggia in Toscana?
 *
 * Il 25/09/2026 una segnalazione da Roveta (Scandicci) ha mostrato il problema più grosso del
 * progetto: dal 25 agosto il pluviometro SIR di Vingone, a 3 km, aveva misurato 91 mm (46 il
 * 10-11/9, 35 il 18/9), mentre il modello di Open-Meteo che usiamo per 1.195 zone su 1.202
 * (`best_match`) ne dava 7. ICON-2I di ARPAE, il modello italiano a 2 km, ne dava 49. Un caso solo
 * non decide niente: questo script mette a confronto i modelli con i pluviometri della Regione
 * Toscana, sparsi su tutta la regione, per gli ultimi `--days` giorni.
 *
 * Cosa conta per il punteggio, e quindi cosa si misura:
 *  - la pioggia cumulata su 7 e su 26 giorni (la finestra del bilancio idrico);
 *  - gli eventi forti (≥ 20 mm in un giorno, la soglia che innesca la buttata): quanti ne vede il
 *    modello, tollerando un giorno di sfasamento, e quanti ne inventa;
 *  - l'errore giornaliero, per completezza.
 *
 * Una stazione per cella di `--cell` gradi, così la Toscana pesa per superficie e non per dove le
 * stazioni sono più fitte (la piana fiorentina). Le serie SIR sono quelle `pluvio0_24` (giorno
 * solare, come Open-Meteo) quando ci sono; le stazioni che hanno solo la 9-9 si saltano, perché
 * confrontarle giorno per giorno con una 0-24 produrrebbe errori che non sono dei modelli.
 *
 *   npx tsx scripts/validate-precip-models.ts --days 45 --cell 0.15 --out docs/validazione
 *
 * Una chiamata a Open-Meteo per stazione e modello, con una pausa fra le chiamate: poche decine,
 * lontane dal limite giornaliero del piano gratuito.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { addDays, today } from '@/lib/domain/time'
import type { Station } from '@/lib/domain/types'
import { fetchJson } from '@/lib/sources/http'
import { isStationActive, parseSeries, parseStations, seriesUrl, stationsUrl } from '@/lib/sources/sir-archive'

const SOURCES = ['best_match', 'italia_meteo_arpae_icon_2i'] as const
type Source = (typeof SOURCES)[number]
/** I due modelli e la loro media giorno per giorno, dove ci sono entrambi. */
const MODELS = [...SOURCES, 'media'] as const
type Model = (typeof MODELS)[number]

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? String(process.argv[i + 1]) : fallback
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface StationSeries {
  readonly station: Station
  readonly observed: ReadonlyMap<string, number>
  readonly modelled: Readonly<Record<Model, ReadonlyMap<string, number>>>
}

async function modelSeries(station: Station, model: Source, pastDays: number): Promise<Map<string, number>> {
  const params = new URLSearchParams({
    latitude: String(station.latitude),
    longitude: String(station.longitude),
    daily: 'precipitation_sum',
    past_days: String(pastDays),
    forecast_days: '1',
    timezone: 'Europe/Rome',
    models: model,
  })
  if (station.elevationM !== null) params.set('elevation', String(station.elevationM))
  const payload = (await fetchJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    timeoutMs: 30_000,
    attempts: 2,
  })) as { daily?: Record<string, Array<string | number | null>> }
  const daily = payload.daily ?? {}
  const key = Object.keys(daily).find((k) => k.startsWith('precipitation_sum'))
  const out = new Map<string, number>()
  if (key === undefined) return out
  const times = daily['time'] ?? []
  for (const [i, t] of times.entries()) {
    const v = daily[key]?.[i]
    if (typeof t === 'string' && typeof v === 'number') out.set(t, v)
  }
  return out
}

function sumWindow(series: ReadonlyMap<string, number>, end: string, days: number): number | null {
  let total = 0
  for (let i = 0; i < days; i++) {
    const v = series.get(addDays(end, -i))
    if (v === undefined) return null
    total += v
  }
  return total
}

interface ModelScore {
  readonly dailyMae: number
  readonly dailyBias: number
  readonly sum7Mae: number
  readonly sum26Mae: number
  /** Rapporto fra totale del modello e totale osservato, su tutto il periodo e tutte le stazioni. */
  readonly totalRatio: number
  readonly eventsObserved: number
  readonly eventsSeen: number
  readonly eventsInvented: number
}

function score(all: readonly StationSeries[], model: Model, days: readonly string[]): ModelScore {
  let dailyErr = 0
  let dailyBias = 0
  let dailyN = 0
  let s7Err = 0
  let s7N = 0
  let s26Err = 0
  let s26N = 0
  let totalObs = 0
  let totalMod = 0
  let eventsObserved = 0
  let eventsSeen = 0
  let eventsInvented = 0

  for (const s of all) {
    const mod = s.modelled[model]
    for (const day of days) {
      const o = s.observed.get(day)
      const m = mod.get(day)
      if (o === undefined || m === undefined) continue
      dailyErr += Math.abs(m - o)
      dailyBias += m - o
      dailyN += 1
      totalObs += o
      totalMod += m

      const near = (series: ReadonlyMap<string, number>) =>
        Math.max(series.get(addDays(day, -1)) ?? 0, series.get(day) ?? 0, series.get(addDays(day, 1)) ?? 0)
      if (o >= 20) {
        eventsObserved += 1
        if (near(mod) >= 10) eventsSeen += 1
      }
      if (m >= 20 && near(s.observed) < 5) eventsInvented += 1
    }
    for (const day of days) {
      const o7 = sumWindow(s.observed, day, 7)
      const m7 = sumWindow(mod, day, 7)
      if (o7 !== null && m7 !== null) {
        s7Err += Math.abs(m7 - o7)
        s7N += 1
      }
      const o26 = sumWindow(s.observed, day, 26)
      const m26 = sumWindow(mod, day, 26)
      if (o26 !== null && m26 !== null) {
        s26Err += Math.abs(m26 - o26)
        s26N += 1
      }
    }
  }

  return {
    dailyMae: dailyErr / Math.max(dailyN, 1),
    dailyBias: dailyBias / Math.max(dailyN, 1),
    sum7Mae: s7Err / Math.max(s7N, 1),
    sum26Mae: s26Err / Math.max(s26N, 1),
    totalRatio: totalMod / Math.max(totalObs, 1e-9),
    eventsObserved,
    eventsSeen,
    eventsInvented,
  }
}

async function main(): Promise<void> {
  const dayCount = Number(arg('days', '45'))
  const cell = Number(arg('cell', '0.15'))
  const outDir = arg('out', '')
  const end = addDays(today(), -1)
  const start = addDays(end, -(dayCount - 1))
  const year = Number(end.slice(0, 4))

  const stations = parseStations(await fetchJson(stationsUrl(), { timeoutMs: 120_000 }))
  const candidates = stations.filter(
    (s) =>
      isStationActive(s, 'precipitation', year) &&
      s.measures.some((m) => m.variable === 'precipitation' && m.window === '0_24' && m.years.includes(year)),
  )
  // Una stazione per cella, la più alta: i boschi stanno in quota più delle città.
  const byCell = new Map<string, Station>()
  for (const s of candidates) {
    const key = `${Math.floor(s.latitude / cell)}:${Math.floor(s.longitude / cell)}`
    const current = byCell.get(key)
    if (current === undefined || (s.elevationM ?? 0) > (current.elevationM ?? 0)) byCell.set(key, s)
  }
  const picked = [...byCell.values()]
  console.log(`Pioggia, ${start} → ${end}: ${String(picked.length)} stazioni SIR (una per cella di ${String(cell)}°)`)

  const series: StationSeries[] = []
  for (const station of picked) {
    try {
      const obs = parseSeries(await fetchJson(seriesUrl(station.code, 'pluvio0_24'), { timeoutMs: 60_000, attempts: 2 }), station.code, 'pluvio0_24')
      const observed = new Map<string, number>()
      for (const o of obs) if (o.value !== null && o.date >= addDays(start, -26) && o.date <= end) observed.set(o.date, o.value)
      if (observed.size < dayCount * 0.8) continue
      const modelled = {} as Record<Model, Map<string, number>>
      for (const model of SOURCES) {
        modelled[model] = await modelSeries(station, model, dayCount + 26)
        await sleep(400)
      }
      const media = new Map<string, number>()
      for (const [day, a] of modelled.best_match) {
        const b = modelled.italia_meteo_arpae_icon_2i.get(day)
        if (b !== undefined) media.set(day, (a + b) / 2)
      }
      modelled.media = media
      series.push({ station, observed, modelled })
    } catch (error) {
      console.warn(`  ${station.name}: saltata (${error instanceof Error ? error.message : String(error)})`)
    }
  }

  const days: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  const scores = Object.fromEntries(MODELS.map((m) => [m, score(series, m, days)])) as Record<Model, ModelScore>

  const f = (n: number, d = 1) => n.toFixed(d).replace('.', ',')
  const rows = MODELS.map((m) => {
    const s = scores[m]
    return `| ${m} | ${f(s.dailyMae)} | ${f(s.dailyBias)} | ${f(s.sum7Mae)} | ${f(s.sum26Mae)} | ${f(s.totalRatio * 100, 0)}% | ${String(s.eventsSeen)}/${String(s.eventsObserved)} | ${String(s.eventsInvented)} |`
  })
  const perStation = series.map((s) => {
    const obs = sumWindow(s.observed, end, dayCount) ?? NaN
    const cols = MODELS.map((m) => f(sumWindow(s.modelled[m], end, dayCount) ?? NaN, 0))
    return `| ${s.station.name} | ${String(s.station.elevationM ?? '?')} | ${f(obs, 0)} | ${cols.join(' | ')} |`
  })
  const md = [
    `# Pioggia: modelli Open-Meteo contro pluviometri SIR`,
    '',
    `Periodo ${start} → ${end} (${String(dayCount)} giorni), ${String(series.length)} stazioni della Regione Toscana, una per cella di ${String(cell)}°. Generato da \`scripts/validate-precip-models.ts\`.`,
    '',
    '| Modello | Errore giornaliero (mm) | Scarto medio (mm/giorno) | Errore sui 7 giorni (mm) | Errore sui 26 giorni (mm) | Totale rispetto al misurato | Eventi ≥ 20 mm visti | Eventi ≥ 20 mm inventati |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '«Visto»: il modello dà almeno 10 mm fra il giorno prima e quello dopo. «Inventato»: il modello dà almeno 20 mm e il pluviometro meno di 5 in quei tre giorni.',
    '',
    `## Totale del periodo per stazione (mm)`,
    '',
    `| Stazione | Quota (m) | Misurato | ${MODELS.join(' | ')} |`,
    `|---|---|---|${MODELS.map(() => '---').join('|')}|`,
    ...perStation,
    '',
  ].join('\n')
  console.log('\n' + md)
  if (outDir !== '') {
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, 'pioggia-modelli.md'), md)
    writeFileSync(join(outDir, 'pioggia-modelli.json'), JSON.stringify({ start, end, stations: series.length, scores }, null, 2) + '\n')
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
