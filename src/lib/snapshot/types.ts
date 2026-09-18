import { ALGORITHM_V1 } from '@/lib/config/algorithm'

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
  /** Perché la fonte non è (o non è del tutto) una misura toscana, quando è il caso. */
  readonly transferabilityCaution?: string
}

export interface SnapshotSeriesPoint {
  readonly date: string
  readonly mpi: number
  readonly confidence: number
  readonly dataQuality: number
  readonly forecastCertainty: number
  readonly provenance: 'OBSERVED' | 'REANALYSIS' | 'MODELLED' | 'FORECAST'
  readonly rainMm: number | null
  readonly tMinC: number | null
  readonly tMaxC: number | null
  /** Massimo giornaliero, non una media — vedi il commento su `windMean7d` in `model/features.ts`. */
  readonly windMs: number | null
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
  /** Umidità relativa dell'aria a 2 m, media 7 giorni. Informativa: non entra nel punteggio. */
  readonly humidityMean7d: number | null
}

export interface SnapshotZone {
  readonly code: string
  readonly name: string
  readonly reference: string
  readonly province: string
  /**
   * Comune reale che contiene il centro della zona, verificato contro i confini ISTAT
   * (`src/lib/sources/istat-boundaries.ts`). `null` solo se `public/data/admin-boundaries.json`
   * non è stato generato (`npx tsx scripts/ingest-admin-boundaries.ts`) — non dovrebbe succedere
   * in un deploy normale, ma lo snapshot non deve rompersi se succede.
   */
  readonly municipality: string | null
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number
  readonly forest: readonly string[]
  readonly stationNotes: string

  readonly mpi: number
  readonly confidence: number
  /** Quanto sono buoni i dati osservati, indipendentemente da quanto guardiamo avanti. */
  readonly dataQuality: number
  /** Quanto è affidabile la previsione per il giorno: 100 per oggi. */
  readonly forecastCertainty: number
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
  /**
   * Giorni della finestra di calcolo. È il denominatore vero di `observedDays`.
   * Prima l'interfaccia lo ricavava con un'aritmetica inventata sul numero di punti mostrati,
   * e presentava all'utente un numero che non corrispondeva a nulla.
   */
  readonly windowDays: number
  readonly lastObservedDate: string | null
  readonly thermalOptimumC: number
  readonly lapseRateCPerKm: number | null

  /**
   * Comuni reali entro 15 km dal punto di riferimento della zona, verificati contro i confini
   * ISTAT (`scripts/ingest-nearby-comuni.ts`). Non è il confine della zona — le sette zone sono
   * punti, non poligoni — ma toponimi reali per orientarsi, mai coordinate esatte fabbricate.
   * Array vuoto se `public/data/nearby-comuni.json` non è stato generato.
   */
  readonly nearbyMunicipalities: readonly SnapshotNearbyMunicipality[]
}

export interface SnapshotNearbyMunicipality {
  readonly municipality: string
  readonly province: string
  readonly provinceAcronym: string
  readonly distanceKm: number
}

export interface SnapshotSource {
  /** `ok` quando la fonte ha risposto, `degraded` quando ha risposto in parte, `down` mai. */
  readonly status: 'ok' | 'degraded' | 'down'
  /** Quante serie/stazioni sono arrivate davvero, per rendere visibile un degrado silenzioso. */
  readonly recordsFetched: number | null
  readonly coverage: string
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

/**
 * `true` quando lo snapshot è stato calcolato da una versione del modello diversa da quella che
 * gira ora nell'app deployata.
 *
 * Può succedere davvero: lo snapshot si rigenera una volta al giorno via cron
 * (`.github/workflows/daily-snapshot.yml`), il codice dell'app si deploya in un momento
 * indipendente. Un attimo di disallineamento fra i due non è un bug, ma va potuto vedere, perché
 * la spiegazione dei punteggi (`explainScore`, `ALGORITHM_V1` in `lib/config/algorithm.ts`)
 * descrive la versione del codice corrente, non necessariamente quella che ha prodotto i numeri
 * che si stanno leggendo. Vive qui e non in `snapshot/load.ts` apposta: quel modulo importa
 * `node:fs` e non può essere importato da un componente client, questa funzione sì.
 */
export function algorithmVersionMismatch(snapshot: Snapshot): boolean {
  return snapshot.zones.length > 0 && snapshot.algorithmVersion !== ALGORITHM_V1.version
}
