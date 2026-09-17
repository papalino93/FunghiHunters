/**
 * Tipi di dominio condivisi da tutta la pipeline.
 *
 * Regola che governa questo file: niente stringhe libere dove esiste un insieme chiuso di valori.
 * La finestra di aggregazione, la provenienza e i flag di qualita' viaggiano con il dato, sempre,
 * perche' il bug piu' costoso di questo progetto sarebbe mescolare due misure che sembrano
 * identiche e non lo sono.
 */

/** Grandezze misurate o modellate, con un nome unico indipendente dalla fonte. */
export const VARIABLES = [
  'precipitation',
  'temperature_max',
  'temperature_min',
  'temperature_mean',
  'relative_humidity_mean',
  'wind_speed_mean',
  'wind_gust',
  'wind_direction',
  'soil_temperature',
  'soil_moisture',
  'et0',
  'vapour_pressure_deficit',
  'shortwave_radiation',
  'dew_point',
] as const

export type Variable = (typeof VARIABLES)[number]

/**
 * Finestra di aggregazione giornaliera.
 *
 * Il SIR pubblica la pioggia in due varianti che differiscono di un giorno sullo stesso evento:
 * `0_24` (mezzanotte-mezzanotte, ora locale) e `9_9` (dalle 9:00 del giorno precedente alle 9:00
 * del giorno indicato). Verificato sulla stazione TOS11000114 dell'Amiata: 6.1 mm compaiono il
 * 2026-08-12 nella serie 0-24 e il 2026-08-13 nella serie 9-9.
 *
 * Open-Meteo aggrega 0-24. Usiamo `0_24` ovunque come finestra canonica; `9_9` viene ingerita
 * solo per confronto e controllo qualita', mai mescolata.
 */
export const AGGREGATION_WINDOWS = ['0_24', '9_9', 'instant'] as const
export type AggregationWindow = (typeof AGGREGATION_WINDOWS)[number]

/** La finestra su cui si costruisce il modello. Ogni altra e' materiale di controllo. */
export const CANONICAL_WINDOW: AggregationWindow = '0_24'

/**
 * Da dove viene un valore. Distinguiamo la rianalisi dal modello previsionale: ERA5 assimila
 * osservazioni reali ed e' qualitativamente diversa da un modello girato all'indietro.
 */
export const PROVENANCES = ['OBSERVED', 'REANALYSIS', 'MODELLED', 'FORECAST'] as const
export type Provenance = (typeof PROVENANCES)[number]

/** Esito dei controlli di qualita' interni. `ok` non significa validato dalla fonte. */
export const QUALITY_FLAGS = [
  'ok',
  'out_of_range',
  'suspect_jump',
  'suspect_flat',
  'spatial_outlier',
  'inconsistent',
  'missing',
  'interpolated',
] as const
export type QualityFlag = (typeof QUALITY_FLAGS)[number]

/**
 * Flag di qualita' cosi' come lo dichiara il SIR nel campo `TipoValore`.
 *
 * Osservati sul campo: `P` sulle serie di pioggia, temperatura e umidita', `N` su quelle
 * anemometriche. Il significato non e' documentato sul portale: li conserviamo cosi' come
 * arrivano e non li interpretiamo, perche' un flag frainteso e' peggio di un flag opaco.
 */
export const SOURCE_QUALITY_FLAGS = ['P', 'N', 'V', 'S', 'unknown'] as const
export type SourceQualityFlag = (typeof SOURCE_QUALITY_FLAGS)[number]

/** `true` se la stringa e' un flag di qualita' noto alla fonte. */
export function isSourceQualityFlag(value: string): value is SourceQualityFlag {
  return (SOURCE_QUALITY_FLAGS as readonly string[]).includes(value)
}

/** Una stazione di misura, normalizzata. */
export interface Station {
  /** Codice SIR, es. `TOS11000114`. */
  readonly code: string
  /** Nome con la codifica riparata (vedi `normalize/mojibake`). */
  readonly name: string
  /** Nome esattamente come arriva dalla fonte, conservato per tracciabilita'. */
  readonly nameRaw: string
  readonly municipality: string | null
  readonly province: string | null
  readonly elevationM: number | null
  readonly latitude: number
  readonly longitude: number
  readonly sourceCode: string
  /** Quali grandezze misura e in che finestra. */
  readonly measures: readonly StationMeasure[]
}

export interface StationMeasure {
  readonly variable: Variable
  readonly window: AggregationWindow
  /** Anni per cui la fonte dichiara di avere dati. E' cio' che dice se la stazione e' viva. */
  readonly years: readonly number[]
  /** URL della serie storica, quando la fonte lo espone. */
  readonly seriesUrl: string | null
}

/**
 * Un'osservazione giornaliera normalizzata.
 *
 * `date` e' il giorno a cui la misura e' attribuita **nel calendario locale**, gia' risolto
 * secondo la semantica della finestra. Non e' un timestamp: un giorno meteorologico non e' un
 * istante, e trattarlo come tale e' esattamente come nascono gli sfasamenti.
 */
export interface Observation {
  readonly stationCode: string
  readonly variable: Variable
  readonly window: AggregationWindow
  /** Data locale in formato `YYYY-MM-DD`. */
  readonly date: string
  /** `null` quando la fonte non ha il dato: non si finge uno zero. */
  readonly value: number | null
  readonly unit: string
  readonly sourceQualityFlag: SourceQualityFlag
  readonly qualityFlag: QualityFlag
  readonly provenance: Provenance
  readonly sourceCode: string
  /** Istante in cui la fonte dichiara di aver aggiornato il dato, se lo espone. */
  readonly sourceUpdatedAt: string | null
}

/** Valore modellato o previsto su un punto, non su una stazione. */
export interface GridValue {
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number
  readonly variable: Variable
  readonly date: string
  readonly value: number | null
  readonly unit: string
  readonly provenance: Provenance
  readonly sourceCode: string
  /** Istante di emissione della corsa del modello, per le previsioni. */
  readonly runAt: string | null
}

/** Unita' di misura canoniche. Usate per validare gli adapter, non per convertire al volo. */
export const UNITS: Readonly<Record<Variable, string>> = {
  precipitation: 'mm',
  temperature_max: 'degC',
  temperature_min: 'degC',
  temperature_mean: 'degC',
  relative_humidity_mean: 'percent',
  wind_speed_mean: 'm/s',
  wind_gust: 'm/s',
  wind_direction: 'deg',
  soil_temperature: 'degC',
  soil_moisture: 'm3/m3',
  et0: 'mm',
  vapour_pressure_deficit: 'kPa',
  shortwave_radiation: 'MJ/m2',
  dew_point: 'degC',
}

/** Intervallo di date chiuso, in date locali `YYYY-MM-DD`. */
export interface DateRange {
  readonly start: string
  readonly end: string
}
