/**
 * Costruzione delle feature a partire dalla serie meteo giornaliera di una cella.
 *
 * Funzioni pure, senza rete ne' database: e' la parte che si testa con le fixture meteorologiche
 * ed e' cio' che rende banali sia il backtest sia il simulatore del pannello admin.
 */

import type { Provenance } from '@/lib/domain/types'
import type { AlgorithmConfig } from '@/lib/config/algorithm'
import {
  type CellModifiers,
  type WaterBalanceResult,
  waterBalance,
} from '@/lib/model/water'

/** Meteo di un giorno per una cella, gia' interpolato o modellato. */
export interface DailyWeather {
  readonly date: string
  readonly precipitationMm: number | null
  readonly temperatureMaxC: number | null
  readonly temperatureMinC: number | null
  readonly et0Mm: number | null
  readonly soilMoisture: number | null
  readonly soilTemperatureC: number | null
  readonly vpdKpa: number | null
  readonly windMs: number | null
  readonly provenance: Provenance
}

/** Caratteristiche stabili della cella. */
export interface CellContext {
  readonly elevationM: number
  readonly aspectDeg: number | null
  readonly slopeDeg: number | null
  readonly canopyDensity: number | null
}

/** Un evento di pioggia riconosciuto automaticamente. */
export interface RainEvent {
  readonly startDate: string
  readonly endDate: string
  readonly totalMm: number
  readonly durationDays: number
  readonly maxDailyMm: number
  readonly intensityMmDay: number
  /** Giorni trascorsi dalla fine dell'evento al giorno di riferimento. */
  readonly daysSinceEnd: number
  /** Giorni secchi consecutivi prima dell'inizio dell'evento. */
  readonly priorDryDays: number
}

export interface CellFeatures {
  readonly date: string
  readonly water: WaterBalanceResult
  readonly rain: Readonly<Record<string, number | null>>
  readonly et0_7d: number | null
  readonly et0_14d: number | null
  /** Media di (Tmax + Tmin) / 2 sulla finestra termica di configurazione. */
  readonly tMeanWindow: number | null
  readonly tMinWindow: number | null
  readonly tMaxWindow: number | null
  readonly soilTemperatureMean: number | null
  readonly vpdMean7d: number | null
  readonly windMean7d: number | null
  /** Giorni con massima sopra la soglia di stress da caldo, nella finestra termica. */
  readonly heatDays: number
  /** Calo termico massimo su tre giorni nella finestra, in gradi. Positivo = raffreddamento. */
  readonly maxThermalDrop: number | null
  readonly lastEvent: RainEvent | null
  readonly events: readonly RainEvent[]
  /** Provenienza dominante dei dati usati, per il confidence. */
  readonly provenanceMix: Readonly<Record<Provenance, number>>
  /** Giorni della finestra con almeno il dato di pioggia. */
  readonly coverage: number
}

const ROLLING_WINDOWS = [1, 3, 7, 14, 21, 26, 30] as const

function mean(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return null
  return present.reduce((a, b) => a + b, 0) / present.length
}

function sum(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return null
  return present.reduce((a, b) => a + b, 0)
}

function minOf(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return null
  return Math.min(...present)
}

function maxOf(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return null
  return Math.max(...present)
}

/**
 * Riconosce gli eventi di pioggia in una serie.
 *
 * Un evento e' una sequenza di giorni con pioggia sopra la soglia di tracciabilita', separata
 * dagli altri da almeno un giorno asciutto, e che nel complesso supera il minimo significativo.
 * Serve perche' 2 mm isolati e 35 mm in due giorni non devono produrre lo stesso risultato.
 */
export function detectRainEvents(
  days: readonly DailyWeather[],
  referenceDate: string,
  minEventMm = 5,
  wetDayMm = 0.5,
): RainEvent[] {
  const events: RainEvent[] = []
  let start = -1
  let dryRun = 0
  let dryBefore = 0

  const closeEvent = (endIndex: number): void => {
    if (start < 0) return
    const slice = days.slice(start, endIndex + 1)
    const total = slice.reduce((acc, d) => acc + (d.precipitationMm ?? 0), 0)
    if (total >= minEventMm) {
      const startDay = slice[0]
      const endDay = slice[slice.length - 1]
      if (startDay !== undefined && endDay !== undefined) {
        const duration = slice.length
        events.push({
          startDate: startDay.date,
          endDate: endDay.date,
          totalMm: total,
          durationDays: duration,
          maxDailyMm: Math.max(...slice.map((d) => d.precipitationMm ?? 0)),
          intensityMmDay: total / duration,
          daysSinceEnd: daysApart(endDay.date, referenceDate),
          priorDryDays: dryBefore,
        })
      }
    }
    start = -1
  }

  for (const [index, day] of days.entries()) {
    const rain = day.precipitationMm
    const isWet = rain !== null && rain >= wetDayMm
    if (isWet) {
      if (start < 0) {
        start = index
        dryBefore = dryRun
      }
      dryRun = 0
    } else {
      closeEvent(index - 1)
      dryRun += 1
    }
  }
  closeEvent(days.length - 1)

  return events
}

function daysApart(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/**
 * Calo termico massimo su tre giorni consecutivi, in gradi.
 * Positivo significa raffreddamento. Lo calcoliamo sempre, anche se la penalita' associata ha
 * peso zero: serve per poterlo validare piu' avanti sul diario uscite senza ricalcolare il passato.
 */
export function maxThermalDrop(temps: readonly (number | null)[]): number | null {
  let best: number | null = null
  for (let i = 3; i < temps.length; i += 1) {
    const before = temps[i - 3]
    const after = temps[i]
    if (before === null || before === undefined || after === null || after === undefined) continue
    const drop = before - after
    if (best === null || drop > best) best = drop
  }
  return best
}

/** Costruisce le feature per l'ultimo giorno della serie. */
export function buildFeatures(
  days: readonly DailyWeather[],
  cell: CellContext,
  config: AlgorithmConfig,
): CellFeatures {
  const last = days[days.length - 1]
  if (last === undefined) throw new Error('Serie meteo vuota')

  const modifiers: CellModifiers = {
    canopyDensity: cell.canopyDensity,
    aspectDeg: cell.aspectDeg,
  }

  const waterWindow = Math.round(config.water.windowDays.value)
  const soilAtStart = days[Math.max(0, days.length - waterWindow)]?.soilMoisture ?? null

  const water = waterBalance(
    days.map((d) => ({
      date: d.date,
      precipitationMm: d.precipitationMm,
      // Il decadimento usa la media giornaliera, non la massima: e' l'integrale della giornata
      // a svuotare il suolo, non il picco del primo pomeriggio.
      temperatureC: meanOfPair(d.temperatureMaxC, d.temperatureMinC),
      et0Mm: d.et0Mm,
      windMs: d.windMs,
    })),
    soilAtStart,
    config,
    modifiers,
  )

  const rain: Record<string, number | null> = {}
  for (const window of ROLLING_WINDOWS) {
    rain[`rain_${window}d`] = sum(days.slice(-window).map((d) => d.precipitationMm))
  }

  const thermalWindow = Math.round(config.thermal.airWindowDays.value)
  const thermalSlice = days.slice(-thermalWindow)
  const dailyMeans = thermalSlice.map((d) => meanOfPair(d.temperatureMaxC, d.temperatureMinC))

  const soilWindow = Math.round(config.thermal.soilWindowDays.value)
  const heatThreshold = config.penalties.heat.threshold.value

  const provenanceMix: Record<Provenance, number> = {
    OBSERVED: 0,
    REANALYSIS: 0,
    MODELLED: 0,
    FORECAST: 0,
  }
  for (const day of days.slice(-waterWindow)) {
    provenanceMix[day.provenance] += 1
  }

  return {
    date: last.date,
    water,
    rain,
    et0_7d: sum(days.slice(-7).map((d) => d.et0Mm)),
    et0_14d: sum(days.slice(-14).map((d) => d.et0Mm)),
    tMeanWindow: mean(dailyMeans),
    tMinWindow: minOf(thermalSlice.map((d) => d.temperatureMinC)),
    tMaxWindow: maxOf(thermalSlice.map((d) => d.temperatureMaxC)),
    soilTemperatureMean: mean(days.slice(-soilWindow).map((d) => d.soilTemperatureC)),
    vpdMean7d: mean(days.slice(-7).map((d) => d.vpdKpa)),
    windMean7d: mean(days.slice(-7).map((d) => d.windMs)),
    heatDays: thermalSlice.filter(
      (d) => d.temperatureMaxC !== null && d.temperatureMaxC > heatThreshold,
    ).length,
    maxThermalDrop: maxThermalDrop(dailyMeans),
    lastEvent: lastEventOf(days, last.date, waterWindow),
    events: detectRainEvents(days.slice(-waterWindow), last.date),
    provenanceMix,
    coverage: water.coveredDays / Math.max(1, waterWindow),
  }
}

function lastEventOf(
  days: readonly DailyWeather[],
  referenceDate: string,
  windowDays: number,
): RainEvent | null {
  const events = detectRainEvents(days.slice(-windowDays), referenceDate)
  return events.length === 0 ? null : (events[events.length - 1] ?? null)
}

function meanOfPair(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null
  if (a === null) return b
  if (b === null) return a
  return (a + b) / 2
}
