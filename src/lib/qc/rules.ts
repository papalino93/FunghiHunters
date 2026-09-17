/**
 * Regole di plausibilita' per il controllo di qualita'.
 *
 * I dati SIR recenti **non sono validati**: arrivano in automatico dalle stazioni e possono
 * contenere errori. Verificato che le serie 2026 portano `TipoValore: "P"` e non il marchio
 * "Anno Validato".
 *
 * Nessuno dei numeri qui sotto e' un dato scientifico: sono soglie operative scelte larghe, il
 * cui scopo e' intercettare il guasto evidente senza buttare via l'evento estremo vero. Stanno
 * in un file di configurazione proprio perche' vanno ritarati guardando quanti falsi positivi
 * producono, e ogni modifica e' una nuova versione dell'algoritmo.
 */

import type { Variable } from '@/lib/domain/types'

export interface PlausibleRange {
  readonly min: number
  readonly max: number
  /** Variazione massima plausibile fra due giorni consecutivi. `null` se il salto non ha senso. */
  readonly maxDailyJump: number | null
}

/**
 * Intervalli di plausibilita' per la Toscana.
 *
 * Il massimo di pioggia e' volutamente altissimo: in Toscana esistono eventi da oltre 300 mm in
 * 24 ore, e un controllo stretto li scarterebbe proprio quando contano di piu'. Qui cerchiamo il
 * sensore impazzito, non il temporale forte.
 */
export const PLAUSIBLE_RANGES: Readonly<Partial<Record<Variable, PlausibleRange>>> = {
  precipitation: { min: 0, max: 500, maxDailyJump: null },
  temperature_max: { min: -25, max: 48, maxDailyJump: 18 },
  temperature_min: { min: -30, max: 35, maxDailyJump: 18 },
  temperature_mean: { min: -28, max: 42, maxDailyJump: 15 },
  relative_humidity_mean: { min: 0, max: 100, maxDailyJump: null },
  wind_speed_mean: { min: 0, max: 45, maxDailyJump: null },
  wind_gust: { min: 0, max: 90, maxDailyJump: null },
  wind_direction: { min: 0, max: 360, maxDailyJump: null },
}

/** Parametri dei controlli che confrontano una stazione con le vicine. */
export interface SpatialQcConfig {
  /** Raggio entro cui cercare stazioni di confronto. */
  readonly radiusKm: number
  /** Dislivello massimo perche' una stazione sia considerata comparabile. */
  readonly maxElevationDiffM: number
  /** Numero minimo di vicine perche' il confronto abbia senso. */
  readonly minNeighbours: number
  /** Soglia in deviazioni robuste (MAD) oltre cui il valore e' un outlier spaziale. */
  readonly madThreshold: number
}

export const DEFAULT_SPATIAL_QC: SpatialQcConfig = {
  radiusKm: 25,
  maxElevationDiffM: 400,
  minNeighbours: 3,
  madThreshold: 6,
}

/** Parametri del controllo sullo zero prolungato. */
export interface FlatZeroQcConfig {
  /** Giorni consecutivi a zero oltre i quali si sospetta il guasto. */
  readonly minDays: number
  /** Pioggia che le vicine devono aver visto nello stesso periodo perche' lo zero sia sospetto. */
  readonly neighbourRainMm: number
}

/**
 * Il pluviometro guasto e' il caso peggiore di tutti: non produce valori assurdi, produce zeri.
 * Sono indistinguibili da un periodo secco se guardati da soli, e un periodo secco e' proprio
 * cio' che il modello interpreta come "condizioni sfavorevoli". Un guasto non rilevato non
 * genera un errore: genera una zona che sembra spenta.
 */
export const DEFAULT_FLAT_ZERO_QC: FlatZeroQcConfig = {
  minDays: 10,
  neighbourRainMm: 15,
}

/** Giorni senza dato nuovo oltre i quali una stazione si considera offline. */
export const STALENESS_DAYS = 2
