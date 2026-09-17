/**
 * Controlli di qualita' sulle osservazioni.
 *
 * Due principi:
 *
 * 1. **Nessun controllo scarta un dato.** Ogni controllo puo' solo cambiare il `qualityFlag`.
 *    Chi consuma decide se fidarsi. Buttare via i dati sospetti nasconde i problemi delle fonti
 *    invece di renderli visibili nel pannello di salute.
 * 2. **Un controllo che non ha abbastanza contesto non si esprime.** Meglio nessun giudizio che
 *    un giudizio basato su due stazioni lontane.
 */

import type { Observation, QualityFlag, Station, Variable } from '@/lib/domain/types'
import { daysBetween } from '@/lib/domain/time'
import {
  DEFAULT_FLAT_ZERO_QC,
  DEFAULT_SPATIAL_QC,
  type FlatZeroQcConfig,
  MIN_ABSOLUTE_DEVIATION,
  PLAUSIBLE_RANGES,
  type SpatialQcConfig,
  STALENESS_DAYS,
} from '@/lib/qc/rules'

/** Esito di un controllo su una singola osservazione. */
export interface QcFinding {
  readonly stationCode: string
  readonly variable: Variable
  readonly date: string
  readonly flag: QualityFlag
  /** Spiegazione leggibile, destinata al pannello admin. */
  readonly reason: string
}

/** Distanza in chilometri fra due punti, formula dell'emisenoverso. */
export function distanceKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6371
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Mediana di un campione non vuoto. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('Mediana di un campione vuoto')
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] as number
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

/**
 * Deviazione assoluta mediana, scalata per essere confrontabile con una deviazione standard.
 * Robusta: un singolo valore impazzito non gonfia la soglia fino a nascondersi dentro.
 */
export function medianAbsoluteDeviation(values: readonly number[]): number {
  const m = median(values)
  return 1.4826 * median(values.map((v) => Math.abs(v - m)))
}

/** Controllo 1: il valore sta nell'intervallo climaticamente possibile. */
export function checkRange(observation: Observation): QcFinding | null {
  if (observation.value === null) return null
  const range = PLAUSIBLE_RANGES[observation.variable]
  if (range === undefined) return null

  if (observation.value < range.min || observation.value > range.max) {
    return {
      stationCode: observation.stationCode,
      variable: observation.variable,
      date: observation.date,
      flag: 'out_of_range',
      reason:
        `${observation.value} ${observation.unit} fuori dall'intervallo plausibile ` +
        `[${range.min}, ${range.max}]`,
    }
  }
  return null
}

/**
 * Controllo 2: coerenza interna fra le temperature dello stesso giorno.
 * Una minima maggiore della massima non e' un valore estremo, e' un errore certo.
 */
export function checkTemperatureConsistency(
  dayObservations: readonly Observation[],
): QcFinding[] {
  const byKey = new Map<string, Map<Variable, Observation>>()
  for (const obs of dayObservations) {
    const key = `${obs.stationCode}|${obs.date}|${obs.window}`
    const entry = byKey.get(key) ?? new Map<Variable, Observation>()
    entry.set(obs.variable, obs)
    byKey.set(key, entry)
  }

  const findings: QcFinding[] = []
  for (const entry of byKey.values()) {
    const tmax = entry.get('temperature_max')
    const tmin = entry.get('temperature_min')
    if (tmax?.value == null || tmin?.value == null) continue
    if (tmin.value > tmax.value) {
      findings.push({
        stationCode: tmax.stationCode,
        variable: 'temperature_max',
        date: tmax.date,
        flag: 'inconsistent',
        reason: `minima ${tmin.value} maggiore della massima ${tmax.value}`,
      })
    }
  }
  return findings
}

/**
 * Controllo 3: salto impossibile fra giorni consecutivi.
 * Si applica solo alle grandezze per cui un salto ha significato: la pioggia puo' passare da 0
 * a 80 mm senza che nulla sia rotto.
 */
export function checkJumps(series: readonly Observation[]): QcFinding[] {
  if (series.length < 2) return []
  const variable = series[0]?.variable
  if (variable === undefined) return []
  const range = PLAUSIBLE_RANGES[variable]
  if (range?.maxDailyJump == null) return []

  const ordered = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const findings: QcFinding[] = []

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1]
    const curr = ordered[i]
    if (prev === undefined || curr === undefined) continue
    if (prev.value === null || curr.value === null) continue
    // Un salto ha senso solo fra giorni adiacenti: su un buco di una settimana non dice nulla.
    if (daysBetween(prev.date, curr.date) !== 1) continue

    const jump = Math.abs(curr.value - prev.value)
    if (jump > range.maxDailyJump) {
      findings.push({
        stationCode: curr.stationCode,
        variable: curr.variable,
        date: curr.date,
        flag: 'suspect_jump',
        reason:
          `variazione di ${jump.toFixed(1)} ${curr.unit} in un giorno ` +
          `(${prev.value} -> ${curr.value}), oltre il limite di ${range.maxDailyJump}`,
      })
    }
  }
  return findings
}

/** Serie di una stazione, gia' raggruppata, con la sua posizione. */
export interface StationSeries {
  readonly station: Station
  /** Osservazioni della stessa grandezza, in ordine qualsiasi. */
  readonly observations: readonly Observation[]
}

/**
 * Controllo 4: zero prolungato mentre le stazioni vicine vedono pioggia.
 *
 * E' il controllo che intercetta il pluviometro guasto o intasato. Richiede il contesto: da sola,
 * una sequenza di zeri e' semplicemente bel tempo.
 */
export function checkFlatZero(
  target: StationSeries,
  neighbours: readonly StationSeries[],
  config: FlatZeroQcConfig = DEFAULT_FLAT_ZERO_QC,
  spatial: SpatialQcConfig = DEFAULT_SPATIAL_QC,
): QcFinding[] {
  const own = [...target.observations]
    .filter((o) => o.variable === 'precipitation')
    .sort((a, b) => a.date.localeCompare(b.date))
  if (own.length < config.minDays) return []

  const comparable = neighbours.filter((n) => isComparable(target.station, n.station, spatial))
  if (comparable.length < spatial.minNeighbours) return []

  const neighbourRainByDate = new Map<string, number[]>()
  for (const neighbour of comparable) {
    for (const obs of neighbour.observations) {
      if (obs.variable !== 'precipitation' || obs.value === null) continue
      const bucket = neighbourRainByDate.get(obs.date) ?? []
      bucket.push(obs.value)
      neighbourRainByDate.set(obs.date, bucket)
    }
  }

  const findings: QcFinding[] = []
  let runStart = 0
  for (let i = 0; i <= own.length; i += 1) {
    const current = own[i]
    const isZero = current !== undefined && current.value === 0
    if (isZero) continue

    const runLength = i - runStart
    if (runLength >= config.minDays) {
      const run = own.slice(runStart, i)
      // Pioggia mediana vista dalle vicine nello stesso intervallo.
      const neighbourTotal = run.reduce((acc, obs) => {
        const values = neighbourRainByDate.get(obs.date)
        return acc + (values === undefined || values.length === 0 ? 0 : median(values))
      }, 0)

      if (neighbourTotal >= config.neighbourRainMm) {
        for (const obs of run) {
          findings.push({
            stationCode: obs.stationCode,
            variable: obs.variable,
            date: obs.date,
            flag: 'suspect_flat',
            reason:
              `${runLength} giorni consecutivi a zero mentre ${comparable.length} stazioni ` +
              `comparabili hanno registrato ${neighbourTotal.toFixed(1)} mm`,
          })
        }
      }
    }
    runStart = i + 1
  }
  return findings
}

/**
 * Controllo 5: outlier spaziale su un singolo giorno.
 * Confronta il valore con la mediana delle vicine comparabili, in unita' di MAD.
 */
export function checkSpatialOutlier(
  observation: Observation,
  targetStation: Station,
  neighbourValues: ReadonlyArray<{ station: Station; value: number }>,
  config: SpatialQcConfig = DEFAULT_SPATIAL_QC,
): QcFinding | null {
  if (observation.value === null) return null

  const comparable = neighbourValues.filter((n) => isComparable(targetStation, n.station, config))
  if (comparable.length < config.minNeighbours) return null

  const values = comparable.map((n) => n.value)
  const centre = median(values)
  const spread = medianAbsoluteDeviation(values)
  // Con vicine tutte identiche il MAD e' zero e ogni differenza sarebbe infinita: non giudichiamo.
  if (spread === 0) return null

  const absolute = Math.abs(observation.value - centre)
  // Il criterio statistico da solo segnala differenze fisicamente normali quando le vicine sono
  // molto concordi. Serve che il valore sia anomalo **e** lontano in unita' vere.
  const floor = MIN_ABSOLUTE_DEVIATION[observation.variable]
  if (floor !== undefined && absolute < floor) return null

  const deviations = absolute / spread
  if (deviations > config.madThreshold) {
    return {
      stationCode: observation.stationCode,
      variable: observation.variable,
      date: observation.date,
      flag: 'spatial_outlier',
      reason:
        `${observation.value} ${observation.unit} contro una mediana locale di ` +
        `${centre.toFixed(1)} su ${comparable.length} stazioni ` +
        `(${deviations.toFixed(1)} deviazioni robuste)`,
    }
  }
  return null
}

/** Controllo 6: la stazione non trasmette da troppo tempo. */
export function checkStaleness(
  series: StationSeries,
  asOfDate: string,
  maxAgeDays: number = STALENESS_DAYS,
): QcFinding | null {
  const withValue = series.observations.filter((o) => o.value !== null)
  if (withValue.length === 0) {
    return {
      stationCode: series.station.code,
      variable: series.observations[0]?.variable ?? 'precipitation',
      date: asOfDate,
      flag: 'missing',
      reason: 'nessun dato disponibile nel periodo',
    }
  }

  const latest = withValue.reduce((acc, o) => (o.date > acc ? o.date : acc), withValue[0]?.date ?? '')
  const age = daysBetween(latest, asOfDate)
  if (age > maxAgeDays) {
    return {
      stationCode: series.station.code,
      variable: withValue[0]?.variable ?? 'precipitation',
      date: asOfDate,
      flag: 'missing',
      reason: `ultimo dato il ${latest}, ${age} giorni fa: stazione considerata offline`,
    }
  }
  return null
}

/**
 * Due stazioni sono confrontabili se sono vicine **e** climaticamente simili.
 *
 * La quota e' un filtro e non un dettaglio: sulle sette zone di taratura la stazione piu' vicina
 * alla Garfagnana e' a 2.6 km ma 502 m piu' in basso, mentre quella giusta e' a 2.7 km e 169 m
 * di dislivello. Ignorare la quota significa scegliere sistematicamente la stazione sbagliata.
 */
export function isComparable(
  target: Station,
  candidate: Station,
  config: SpatialQcConfig = DEFAULT_SPATIAL_QC,
): boolean {
  if (candidate.code === target.code) return false
  const distance = distanceKm(
    target.latitude,
    target.longitude,
    candidate.latitude,
    candidate.longitude,
  )
  if (distance > config.radiusKm) return false
  if (target.elevationM === null || candidate.elevationM === null) return true
  return Math.abs(target.elevationM - candidate.elevationM) <= config.maxElevationDiffM
}

/** Applica un esito di controllo alle osservazioni, senza mai scartarle. */
export function applyFindings(
  observations: readonly Observation[],
  findings: readonly QcFinding[],
): Observation[] {
  if (findings.length === 0) return [...observations]
  const index = new Map<string, QualityFlag>()
  for (const finding of findings) {
    index.set(`${finding.stationCode}|${finding.variable}|${finding.date}`, finding.flag)
  }
  return observations.map((obs) => {
    const flag = index.get(`${obs.stationCode}|${obs.variable}|${obs.date}`)
    return flag === undefined ? obs : { ...obs, qualityFlag: flag }
  })
}
