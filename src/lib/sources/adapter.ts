/**
 * Contratto comune degli adapter di fonte.
 *
 * L'obiettivo e' che sostituire una fonte non tocchi il motore: il motore conosce
 * `Observation` e `GridValue`, non conosce il SIR ne' Open-Meteo. Ogni adapter dichiara anche
 * le proprie `capabilities`, cosi' l'orchestratore puo' scegliere chi interrogare per cosa senza
 * cablare i nomi delle fonti.
 */

import type {
  AggregationWindow,
  DateRange,
  GridValue,
  Observation,
  Station,
  Variable,
} from '@/lib/domain/types'

/** Punto su cui chiedere valori modellati o previsti. */
export interface GridPoint {
  readonly latitude: number
  readonly longitude: number
  /** Quota reale della cella: Open-Meteo la usa per il downscaling, e funziona davvero. */
  readonly elevationM: number
}

export interface SourceCapabilities {
  readonly variables: readonly Variable[]
  readonly windows: readonly AggregationWindow[]
  /** `true` se la fonte permette di scaricare solo il nuovo invece dell'intera serie. */
  readonly supportsIncremental: boolean
  /** `true` se la fonte accetta un intervallo di date. Il SIR `dati.php` non lo fa. */
  readonly supportsDateRange: boolean
  /** Numero massimo di punti in una singola richiesta, se applicabile. */
  readonly maxPointsPerRequest: number | null
}

/** Metadati di licenza, da mostrare in UI e da tracciare nel database. */
export interface SourceLicense {
  readonly code: string
  readonly name: string
  readonly url: string
  readonly attribution: string
}

/** Fonte di osservazioni puntuali da stazioni. */
export interface StationSourceAdapter {
  readonly sourceCode: string
  readonly license: SourceLicense
  readonly capabilities: SourceCapabilities

  /** Anagrafica delle stazioni. */
  listStations(): Promise<Station[]>

  /**
   * Osservazioni giornaliere.
   * Gli adapter che non supportano un intervallo restituiscono tutto e filtrano a valle:
   * e' la ragione per cui `range` e' opzionale invece che obbligatorio e ignorato.
   */
  fetchObservations(request: FetchObservationsRequest): Promise<Observation[]>
}

export interface FetchObservationsRequest {
  /** Codici stazione da interrogare. Se assente, tutte quelle disponibili. */
  readonly stationCodes?: readonly string[]
  readonly variables?: readonly Variable[]
  readonly range?: DateRange
}

/** Fonte di valori modellati o previsti su punti arbitrari. */
export interface GridSourceAdapter {
  readonly sourceCode: string
  readonly license: SourceLicense
  readonly capabilities: SourceCapabilities

  fetchGridValues(request: FetchGridRequest): Promise<GridValue[]>
}

export interface FetchGridRequest {
  readonly points: readonly GridPoint[]
  readonly variables: readonly Variable[]
  readonly range: DateRange
}

/** Licenze delle fonti usate dal progetto, verificate il 2026-09-17. */
export const LICENSES = {
  sir: {
    code: 'CC-BY-SA',
    name: 'Creative Commons Attribuzione - Condividi allo stesso modo',
    url: 'https://dati.toscana.it/dataset/stazioni-meteo-idrologiche',
    attribution: 'Regione Toscana - Servizio Idrologico Regionale',
  },
  openMeteo: {
    code: 'CC-BY-4.0',
    name: 'Creative Commons Attribution 4.0 International',
    url: 'https://open-meteo.com/en/terms',
    attribution: 'Open-Meteo.com, su dati ECMWF IFS, DWD ICON, NOAA GFS ed ERA5',
  },
} as const satisfies Record<string, SourceLicense>
