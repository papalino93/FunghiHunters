/**
 * Formato dello snapshot precalcolato.
 *
 * L'app non calcola l'MPI a ogni richiesta: leggerebbe cinquanta serie storiche SIR per ogni
 * visita, che e' insensato e comunque troppo lento. Il calcolo gira una volta al giorno su
 * GitHub Actions e produce questo file, che l'app serve staticamente.
 *
 * E' anche la forma che prenderanno le righe del database quando ci sara': stessi campi, stessa
 * granularita'. Lo snapshot e' un database con una tabella sola e nessun server.
 */

export interface SnapshotFactor {
  readonly key: string
  readonly label: string
  readonly contribution: number
  readonly value: string
  readonly provenance: 'sourced' | 'calibrate'
  readonly source?: string
}

export interface SnapshotSeriesPoint {
  readonly date: string
  readonly mpi: number
  readonly confidence: number
  readonly provenance: 'OBSERVED' | 'REANALYSIS' | 'MODELLED' | 'FORECAST'
  readonly rainMm: number | null
  readonly tMinC: number | null
  readonly tMaxC: number | null
}

export interface SnapshotStation {
  readonly code: string
  readonly name: string
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number | null
  readonly distanceKm: number
  readonly elevationDiffM: number
  readonly effectiveKm: number
  /** Quale grandezza questa stazione sta alimentando. */
  readonly variable: string
}

export interface SnapshotWeather {
  readonly rain24h: number | null
  readonly rain72h: number | null
  readonly rain7d: number | null
  readonly rain14d: number | null
  readonly rain26d: number | null
  readonly effectiveWaterMm: number
  readonly initialDeficitMm: number
  readonly et0_7d: number | null
  readonly et0_14d: number | null
  readonly tMean20d: number | null
  readonly tMinWindow: number | null
  readonly tMaxWindow: number | null
  readonly soilTemperatureMean: number | null
  readonly soilMoisture: number | null
  readonly vpdMean7d: number | null
  readonly windMean7d: number | null
}

export interface SnapshotZone {
  readonly code: string
  readonly name: string
  readonly reference: string
  readonly province: string
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number
  readonly forest: readonly string[]
  readonly stationNotes: string

  readonly mpi: number
  readonly confidence: number
  readonly label: string
  readonly limitingFactor: string | null
  /** Differenza fra la media dei prossimi quattro giorni e quella degli ultimi quattro. */
  readonly development: number

  readonly series: readonly SnapshotSeriesPoint[]
  readonly weather: SnapshotWeather
  readonly positiveFactors: readonly SnapshotFactor[]
  readonly negativeFactors: readonly SnapshotFactor[]
  readonly neutralFactors: readonly SnapshotFactor[]
  readonly stations: readonly SnapshotStation[]

  readonly bestWindow: {
    readonly peakDate: string
    readonly peakMpi: number
    readonly start: string
    readonly end: string
    readonly narrative: string
  } | null

  readonly observedDays: number
  readonly lastObservedDate: string | null
  readonly thermalOptimumC: number
  readonly lapseRateCPerKm: number | null
}

export interface SnapshotSource {
  readonly name: string
  readonly license: string
  readonly url: string
  readonly attribution: string
  readonly lastUpdate: string | null
}

export interface Snapshot {
  readonly generatedAt: string
  readonly algorithmVersion: string
  readonly referenceDate: string
  readonly zones: readonly SnapshotZone[]
  readonly sources: readonly SnapshotSource[]
  /** Parametri del modello che non hanno una fonte e sono dichiarati da calibrare. */
  readonly uncalibratedParams: readonly string[]
}
