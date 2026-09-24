/**
 * Il motore MPI.
 *
 *   MPI = 100 * saturate( W * T * Phi ) * prodotto delle penalita' * H
 *
 * dove W e' la disponibilita' idrica, T l'idoneita' termica, Phi la stagionalita' corretta per
 * l'anomalia climatica e H il bosco della zona (`src/lib/model/forest.ts`), che moltiplica fuori
 * dalla saturazione perche' e' una proprieta' del posto e non del giorno. Le penalita' sono moltiplicatori **limitati inferiormente**: una gelata
 * riduce fortemente ma non annulla, perche' danneggia i carpofori esistenti piu' di quanto
 * azzeri il potenziale del micelio.
 *
 * E' la differenza principale rispetto al modello baseline, che moltiplica fattori azzeranti: li'
 * un solo termine fuori intervallo butta via tutto il resto del calcolo e rende il punteggio non
 * spiegabile. Sui dati reali del 17 settembre 2026 il baseline assegnava esattamente 0.0 a
 * Casentino e Pratomagno, e lo stesso 67.4 a Garfagnana e Appennino pistoiese nonostante 147 mm
 * contro 95 mm su 26 giorni.
 *
 * Funzione pura: nessun accesso a rete o database. E' cio' che rende banali il backtest e il
 * simulatore del pannello admin.
 */

import { ALGORITHM_V1, type AlgorithmConfig } from '@/lib/config/algorithm'
import type { CellContext, CellFeatures } from '@/lib/model/features'
import { habitatSuitability, type HabitatResult } from '@/lib/model/forest'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Campana normalizzata a 1 nel massimo. */
export function gaussian(value: number, centre: number, sigma: number): number {
  if (sigma <= 0) return value === centre ? 1 : 0
  return Math.exp(-((value - centre) ** 2) / (2 * sigma ** 2))
}

/**
 * Campana asimmetrica: una larghezza sotto il centro, un'altra sopra.
 *
 * Serve per l'idoneita' termica (vedi `thermalSuitability`): la fonte misura la fruttificazione
 * "quasi assente" pochi gradi sotto l'ottimo, quindi li' la campana resta stretta. Sopra l'ottimo
 * la fonte non dice altrettanto — ed e' un bosco di faggio d'Europa centrale, non l'Appennino
 * mediterraneo — quindi la' la campana puo' essere piu' larga senza contraddire la fonte.
 */
export function asymmetricGaussian(
  value: number,
  centre: number,
  sigmaBelow: number,
  sigmaAbove: number,
): number {
  return gaussian(value, centre, value <= centre ? sigmaBelow : sigmaAbove)
}

/** Giorno dell'anno, 1-366. */
export function dayOfYear(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const start = Date.UTC(y, 0, 1)
  const current = Date.UTC(y, m - 1, d)
  return Math.round((current - start) / 86_400_000) + 1
}

/** Distanza circolare fra due giorni dell'anno, per non spezzare la stagione a Capodanno. */
export function circularDayDistance(a: number, b: number): number {
  const raw = Math.abs(a - b)
  return Math.min(raw, 365 - raw)
}

export interface SeasonBlend {
  /** Peso del regime estivo, 0-1. */
  readonly summer: number
  /** Peso del regime autunnale, 0-1. */
  readonly autumn: number
  /** Quanto il contesto e' autunnale rispetto a estivo, 0-1. */
  readonly autumnality: number
  /** Fattore stagionale complessivo, prima del pavimento di configurazione. */
  readonly seasonal: number
}

/**
 * Miscela fra regime estivo e regime autunnale.
 *
 * E' il modo in cui teniamo **un solo indice "Porcino"** senza appiattire una differenza reale:
 * le condizioni favorevoli a giugno a 500 m in cerreta non sono quelle di ottobre a 1100 m in
 * faggeta. All'utente resta un numero solo, ma i parametri si spostano con stagione e quota
 * invece di restare fermi su una media che non descrive nessuno dei due casi.
 *
 * Non e' tassonomia riportata dalla finestra: e' il modello che si adatta al contesto.
 */
export function seasonBlend(
  date: string,
  elevationM: number,
  config: AlgorithmConfig,
): SeasonBlend {
  const p = config.phenology
  const doy = dayOfYear(date)

  const elevationWeight = clamp(
    (elevationM - p.lowElevationM.value) / (p.highElevationM.value - p.lowElevationM.value),
    0,
    1,
  )

  const summerTerm =
    (1 - elevationWeight) *
    gaussian(circularDayDistance(doy, p.summerPeakDay.value), 0, p.summerSigmaDays.value)
  const autumnTerm =
    elevationWeight *
    gaussian(circularDayDistance(doy, p.autumnPeakDay.value), 0, p.autumnSigmaDays.value)

  const total = summerTerm + autumnTerm
  const autumnality = total > 0 ? autumnTerm / total : elevationWeight

  return {
    summer: summerTerm,
    autumn: autumnTerm,
    // Il massimo e non la somma: basta che **un** regime sia favorevole perche' la stagione lo sia.
    seasonal: Math.max(summerTerm, autumnTerm),
    autumnality,
  }
}

export interface ThermalResult {
  readonly score: number
  readonly optimumC: number
  readonly airScore: number
  readonly soilScore: number | null
}

/** Idoneita' termica: campana sull'aria, corretta dalla temperatura del suolo. */
export function thermalSuitability(
  features: CellFeatures,
  blend: SeasonBlend,
  config: AlgorithmConfig,
): ThermalResult {
  const t = config.thermal
  // L'ottimo si sposta con il regime: 13 gradi in autunno d'alta quota (misurato), piu' alto
  // in estate a bassa quota (da calibrare, nessuna fonte).
  const optimumC =
    t.optSummerC.value + (t.optAutumnC.value - t.optSummerC.value) * blend.autumnality

  const airScore =
    features.tMeanWindow === null
      ? 0
      : asymmetricGaussian(features.tMeanWindow, optimumC, t.sigmaC.value, t.sigmaWarmC.value)

  const soilScore =
    features.soilTemperatureMean === null
      ? null
      : gaussian(features.soilTemperatureMean, t.soilOptC.value, t.soilSigmaC.value)

  // Senza il dato di suolo il termine resta quello dell'aria, non viene penalizzato.
  const score =
    soilScore === null
      ? airScore
      : airScore * (1 - t.soilWeight.value + t.soilWeight.value * soilScore)

  return { score, optimumC, airScore, soilScore }
}

export interface PenaltyResult {
  readonly key: string
  /** Moltiplicatore applicato, 1 quando la penalita' non agisce. */
  readonly factor: number
  /** Gravita' rilevata, 0-1, indipendente dal peso. */
  readonly severity: number
  /** `false` quando la penalita' e' calcolata ma disattivata in configurazione. */
  readonly applied: boolean
  readonly detail: string
}

/**
 * L'innesco: la buttata arriva una decina di giorni dopo la pioggia forte.
 *
 * Il bilancio idrico descrive lo stato del suolo, non l'evento. Questo termine aggiunge la
 * tempistica: misurata sull'Amiata, l'effetto positivo della pioggia intensa e' massimo al
 * dodicesimo giorno successivo.
 *
 * Correzione a me stesso: avevo scartato il ritardo di dodici giorni del modello baseline
 * definendolo non supportato, sulla base di uno studio tedesco che misurava un'altra cosa — una
 * finestra di accumulo, non un innesco. I dodici giorni hanno una fonte, ed e' pure toscana.
 */
export function computeTrigger(
  features: CellFeatures,
  config: AlgorithmConfig,
): TriggerResult {
  const t = config.trigger
  const days = features.daysSinceIntenseEvent
  if (days === null) {
    return {
      factor: 1,
      closeness: 0,
      daysSinceEvent: null,
      detail: `nessuna pioggia oltre ${t.intenseEventMm.value} mm in un giorno nella finestra`,
    }
  }
  const closeness = gaussian(days, t.lagDays.value, t.lagSigmaDays.value)
  return {
    factor: 1 + t.weight.value * closeness,
    closeness,
    daysSinceEvent: days,
    detail:
      `ultima pioggia intensa ${days} giorni fa; il massimo atteso è al giorno ` +
      `${t.lagDays.value.toFixed(0)}`,
  }
}

/** Applica il peso: a peso zero la penalita' viene calcolata e registrata ma non agisce. */
function withWeight(severity: number, floor: number, weight: number): number {
  const raw = 1 - (1 - floor) * clamp(severity, 0, 1)
  return 1 - weight * (1 - raw)
}

export function computePenalties(
  features: CellFeatures,
  config: AlgorithmConfig,
): PenaltyResult[] {
  const p = config.penalties
  const out: PenaltyResult[] = []

  // Gelata. Va valutata sulla minima OSSERVATA: sull'Amiata la stazione misura 3.14 gradi meno
  // del modello, perche' sta in una conca e accumula aria fredda di notte. Con la minima
  // modellata si perderebbero tre gradi proprio dove contano.
  const tMin = features.tMinWindow
  const frostSeverity =
    tMin === null ? 0 : clamp((p.frost.threshold.value - tMin) / 5, 0, 1)
  out.push({
    key: 'frost',
    severity: frostSeverity,
    factor: withWeight(frostSeverity, p.frost.floor.value, p.frost.weight.value),
    applied: p.frost.weight.value > 0,
    detail:
      tMin === null
        ? 'minima non disponibile'
        : `minima nella finestra ${tMin.toFixed(1)} °C, soglia ${p.frost.threshold.value} °C`,
  })

  // Caldo: contano i giorni sopra soglia, non il picco isolato.
  const heatSeverity = clamp((features.heatDays - 2) / 5, 0, 1)
  out.push({
    key: 'heat',
    severity: heatSeverity,
    factor: withWeight(heatSeverity, p.heat.floor.value, p.heat.weight.value),
    applied: p.heat.weight.value > 0,
    detail: `${features.heatDays} giorni sopra ${p.heat.threshold.value} °C nella finestra`,
  })

  const vpd = features.vpdMean7d
  const vpdSeverity = vpd === null ? 0 : clamp((vpd - p.vpd.threshold.value) / 1, 0, 1)
  out.push({
    key: 'vpd',
    severity: vpdSeverity,
    factor: withWeight(vpdSeverity, p.vpd.floor.value, p.vpd.weight.value),
    applied: p.vpd.weight.value > 0,
    detail:
      vpd === null ? 'VPD non disponibile' : `VPD medio 7 giorni ${vpd.toFixed(2)} kPa`,
  })

  const wind = features.windMean7d
  const windSeverity = wind === null ? 0 : clamp((wind - p.wind.threshold.value) / 4, 0, 1)
  out.push({
    key: 'wind',
    severity: windSeverity,
    factor: withWeight(windSeverity, p.wind.floor.value, p.wind.weight.value),
    applied: p.wind.weight.value > 0,
    // "Massimi giornalieri", non "medio": vedi il commento su penalties.wind in algorithm.ts.
    detail:
      wind === null ? 'vento non disponibile' : `media dei massimi giornalieri, 7 gg: ${wind.toFixed(1)} m/s`,
  })

  /*
   * Shock di caldo: l'unica penalita' di questo modello con una fonte di campo toscana.
   *
   * Sull'Amiata un'impennata della massima di circa 8 gradi sopra la media del periodo inibisce
   * la produzione, con correlazioni negative al quarto, quattordicesimo e diciannovesimo giorno.
   */
  const rise = features.maxThermalRise
  const heatShockSeverity =
    rise === null ? 0 : clamp((rise - p.heatShock.threshold.value) / 4, 0, 1)
  out.push({
    key: 'heatShock',
    severity: heatShockSeverity,
    factor: withWeight(heatShockSeverity, p.heatShock.floor.value, p.heatShock.weight.value),
    applied: p.heatShock.weight.value > 0,
    detail:
      rise === null
        ? 'andamento della massima non disponibile'
        : `massima salita di ${rise.toFixed(1)} °C sopra la media del periodo, soglia ${p.heatShock.threshold.value} °C`,
  })

  // Shock da raffreddamento: calcolato e registrato anche a peso zero, cosi' quando il diario
  // avra' abbastanza uscite il confronto sara' possibile senza ricalcolare il passato.
  const drop = features.maxThermalDrop
  const shockSeverity =
    drop === null ? 0 : clamp((drop - p.thermalShock.threshold.value) / 4, 0, 1)
  out.push({
    key: 'thermalShock',
    severity: shockSeverity,
    factor: withWeight(shockSeverity, p.thermalShock.floor.value, p.thermalShock.weight.value),
    applied: p.thermalShock.weight.value > 0,
    detail:
      drop === null
        ? 'andamento termico non disponibile'
        : `calo massimo su tre giorni ${drop.toFixed(1)} °C` +
          (p.thermalShock.weight.value === 0 ? ' (fattore disattivato, da validare)' : ''),
  })

  return out
}

export interface TriggerResult {
  /** Moltiplicatore applicato, 1 quando nessun evento intenso e' in finestra. */
  readonly factor: number
  /** Vicinanza al picco atteso, 0-1 (0 senza evento intenso in finestra). */
  readonly closeness: number
  readonly daysSinceEvent: number | null
  readonly detail: string
}

export interface MpiComponents {
  /** Il fattore acqua usato nel punteggio: il bilancio, o il minimo dopo una pioggia intensa. */
  readonly water: number
  /** Il solo bilancio idrico, prima del minimo dopo pioggia intensa (1.5.0). */
  readonly waterBalance: number
  readonly trigger: TriggerResult
  readonly thermal: ThermalResult
  readonly phenology: number
  readonly blend: SeasonBlend
  readonly penalties: readonly PenaltyResult[]
  /** Il bosco della zona. Neutro, con `measured: false`, dove non e' stato misurato. */
  readonly habitat: HabitatResult
  /** Prodotto W * T * Phi prima della saturazione e delle penalita'. */
  readonly core: number
}

export interface MpiResult {
  readonly mpi: number
  /**
   * Lo stesso punteggio **senza il tetto a 100**.
   *
   * Non si mostra e non entra nel modello: serve a ordinare i pari merito. Con sette zone
   * toscane il tetto non si notava; con 1.202 zone italiane, il 21/09/2026, 233 zone segnavano
   * esattamente 100 — e fra due zone appaiate una aveva 63 mm d'acqua utile su 70 richiesti e
   * l'altra il doppio. Per chi deve scegliere dove andare domani non sono la stessa cosa, e un
   * ordinamento alfabetico fra pari merito sarebbe stato una risposta finta.
   */
  readonly rawMpi: number
  readonly algorithmVersion: string
  readonly date: string
  readonly components: MpiComponents
}

export interface MpiInput {
  readonly features: CellFeatures
  readonly cell: CellContext
  /**
   * Anomalia della pioggia rispetto alla normale della cella per quella decade, come scarto
   * normalizzato. `null` quando la climatologia non e' ancora disponibile.
   */
  readonly rainAnomalyZ?: number | null
}

/** Calcola l'MPI per un giorno. */
export function computeMpi(input: MpiInput, config: AlgorithmConfig = ALGORITHM_V1): MpiResult {
  const { features, cell } = input

  const blend = seasonBlend(features.date, cell.elevationM, config)
  const thermal = thermalSuitability(features, blend, config)

  const anomaly = input.rainAnomalyZ ?? null
  const anomalyFactor =
    anomaly === null ? 1 : clamp(1 + config.phenology.anomalyWeight.value * anomaly, 0.5, 1.5)

  const phenology =
    (config.phenology.floor.value + (1 - config.phenology.floor.value) * blend.seasonal) *
    anomalyFactor

  const trigger = computeTrigger(features, config)
  // Nella finestra dopo una pioggia intensa il suolo che si asciuga non azzera il punteggio:
  // vedi `trigger.waterRelief` in `config/algorithm.ts` (versione 1.5.0) per dato e motivo.
  //
  // Si somma alla parte che manca, non si prende il massimo: con un «almeno X» due piogge diverse
  // (25 mm dopo la siccità o su terreno umido, 50 o 120 mm) finivano allo stesso valore, e il
  // bilancio smetteva di distinguerle proprio nei giorni che contano. Così resta monotono.
  const relief = config.trigger.waterRelief.value * trigger.closeness
  const water = features.water.score + (1 - features.water.score) * relief
  const core = water * thermal.score * phenology * trigger.factor
  const penalties = computePenalties(features, config)
  const penaltyProduct = penalties.reduce((acc, p) => acc * p.factor, 1)

  /*
   * Il bosco moltiplica **fuori** dal core, insieme alle penalita' e non insieme ai fattori meteo.
   *
   * Dentro il core sarebbe sparito proprio dove conta: il core satura spesso sopra 1, e un bosco
   * scarso sarebbe stato assorbito dal tetto invece di farsi vedere. Fuori, invece, distingue le
   * zone che altrimenti segnano tutte 100 — che il 21 settembre 2026 erano 230 su 1.202.
   *
   * E' anche la collocazione onesta: la copertura e il tipo di bosco sono proprieta' del posto,
   * non del giorno, e non hanno nulla a che vedere con la disponibilita' idrica o la campana
   * termica che compongono il core.
   */
  const habitat = habitatSuitability(cell.forest, config)

  // La saturazione a 1 e' cio' che permette al tetto idrico sopra 1 di compensare una
  // temperatura leggermente fuori ottimo, senza sfondare la scala.
  const mpi = 100 * clamp(core, 0, 1) * penaltyProduct * habitat.factor
  const rawMpi = 100 * Math.max(core, 0) * penaltyProduct * habitat.factor

  return {
    mpi: Math.round(mpi * 10) / 10,
    rawMpi: Math.round(rawMpi * 10) / 10,
    algorithmVersion: config.version,
    date: features.date,
    components: {
      water,
      waterBalance: features.water.score,
      trigger,
      thermal,
      phenology,
      blend,
      penalties,
      habitat,
      core,
    },
  }
}

/**
 * Scala testuale.
 *
 * Vincolo semantico non negoziabile: l'MPI indica la compatibilita' delle condizioni, **mai** la
 * presenza di funghi. Nessuna etichetta contiene un sostantivo di quantita'. Le stringhe stanno
 * qui e solo qui, cosi' violarle per distrazione e' impossibile e un test di non regressione
 * puo' verificarlo meccanicamente.
 */
export const MPI_LABELS = [
  { max: 20, label: 'condizioni sfavorevoli' },
  { max: 40, label: 'condizioni poco favorevoli' },
  { max: 60, label: 'condizioni discretamente favorevoli' },
  { max: 80, label: 'condizioni favorevoli' },
  { max: 100.01, label: 'condizioni molto favorevoli' },
] as const

export function mpiLabel(mpi: number): string {
  for (const band of MPI_LABELS) {
    if (mpi < band.max) return band.label
  }
  return MPI_LABELS[MPI_LABELS.length - 1]?.label ?? 'condizioni sfavorevoli'
}

/**
 * Solo la parte aggettivale dell'etichetta, per le frasi che hanno gia' il soggetto.
 *
 * Serve per non scrivere "le condizioni diventano condizioni poco favorevoli". Deriva
 * dall'etichetta invece di duplicarla, cosi' la scala resta definita in un posto solo e il
 * vincolo semantico non puo' essere aggirato passando da qui.
 */
export function mpiQualifier(mpi: number): string {
  return mpiLabel(mpi).replace(/^condizioni\s+/, '')
}
