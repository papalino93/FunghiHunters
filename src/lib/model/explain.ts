/**
 * explainScore(): nessuna scatola nera.
 *
 * Il contributo di ogni fattore e' calcolato come **differenza rispetto al modello con quel
 * fattore neutralizzato**. In un modello moltiplicativo e' l'unica decomposizione onesta: dire
 * "l'acqua vale il 40 % del punteggio" sarebbe una ripartizione inventata, mentre "senza il
 * limite idrico saresti a 71 invece che a 43" e' una frase verificabile.
 *
 * Ogni fattore dichiara anche da dove viene il numero e quale fonte lo giustifica. Un parametro
 * senza fonte e' visibilmente marcato come da calibrare: e' la stessa disciplina che impedisce
 * di inventare soglie biologiche.
 */

import { ALGORITHM_V1, userCautionForSource, type AlgorithmConfig, type Param } from '@/lib/config/algorithm'
import type { CellFeatures } from '@/lib/model/features'
import { mpiLabel, type MpiResult } from '@/lib/model/mpi'

export interface Factor {
  readonly key: string
  readonly label: string
  /** Punti di MPI guadagnati (positivo) o persi (negativo) rispetto al fattore neutro. */
  readonly contribution: number
  /** Il valore misurato che ha prodotto il contributo. */
  readonly value: string
  readonly provenance: 'sourced' | 'calibrate'
  readonly source?: string
  /**
   * Presente solo quando la fonte del parametro non e' pienamente trasferibile alla Toscana
   * (es. studiata altrove, o su un'altra specie/habitat): il motivo, in una frase, cosi' il
   * limite compare esattamente dove influenza il punteggio che l'utente sta guardando.
   */
  readonly transferabilityCaution?: string
}

export interface ConfidenceFactor {
  readonly key: string
  readonly label: string
  readonly value: string
  readonly impact: number
}

export interface MpiExplanation {
  readonly mpi: number
  readonly confidence: number
  readonly algorithmVersion: string
  readonly label: string
  readonly positiveFactors: readonly Factor[]
  readonly negativeFactors: readonly Factor[]
  readonly neutralFactors: readonly Factor[]
  readonly confidenceFactors: readonly ConfidenceFactor[]
  /** Il singolo fattore che sta abbassando di piu' il punteggio. */
  readonly limitingFactor: string | null
}

const POSITIVE_THRESHOLD = 2
const NEGATIVE_THRESHOLD = -2

function provenanceOf(
  param: Param,
): { provenance: 'sourced' | 'calibrate'; source?: string; transferabilityCaution?: string } {
  if (param.source === undefined) return { provenance: param.provenance }
  // La riga breve per l'utente, non `transferability`: quest'ultima e' il ragionamento completo
  // per chi rivede il modello, e finisce nello snapshot pubblicato e poi nella scheda "Perche'".
  const caution = userCautionForSource(param.source)
  return caution === undefined
    ? { provenance: param.provenance, source: param.source }
    : { provenance: param.provenance, source: param.source, transferabilityCaution: caution }
}

/**
 * Decompone un punteggio gia' calcolato.
 *
 * @param result output di `computeMpi`
 * @param features le stesse feature usate per calcolarlo
 * @param confidence confidence 0-100 gia' calcolata
 */
export function explainScore(
  result: MpiResult,
  features: CellFeatures,
  confidence: number,
  confidenceFactors: readonly ConfidenceFactor[] = [],
  config: AlgorithmConfig = ALGORITHM_V1,
): MpiExplanation {
  const c = result.components
  const penaltyProduct = c.penalties.reduce((acc, p) => acc * p.factor, 1)
  const clamped = Math.min(1, Math.max(0, c.core))

  // Punteggio che si otterrebbe neutralizzando un singolo fattore, tenendo fermi gli altri. Il
  // core vero è water * thermal * phenology * trigger.factor (vedi computeMpi in mpi.ts): ogni
  // neutralizzazione deve tenere fermo anche trigger.factor, altrimenti su un giorno con innesco
  // attivo il confronto userebbe un moltiplicatore diverso da quello del punteggio reale.
  // Il bosco moltiplica il punteggio fuori dalla saturazione (vedi computeMpi): resta fermo in
  // ogni neutralizzazione degli altri fattori, altrimenti i contributi non sommerebbero al
  // punteggio vero di una zona con poco bosco.
  const habitat = c.habitat.factor
  const withoutWater =
    100 * Math.min(1, c.thermal.score * c.phenology * c.trigger.factor) * penaltyProduct * habitat
  const withoutThermal =
    100 * Math.min(1, c.water * c.phenology * c.trigger.factor) * penaltyProduct * habitat
  const withoutPhenology =
    100 * Math.min(1, c.water * c.thermal.score * c.trigger.factor) * penaltyProduct * habitat
  const withoutTrigger =
    100 * Math.min(1, c.water * c.thermal.score * c.phenology) * penaltyProduct * habitat
  const withoutPenalties = 100 * clamped * habitat
  const withoutHabitat = 100 * clamped * penaltyProduct

  const factors: Factor[] = [
    {
      key: 'water',
      label: 'Acqua disponibile nel suolo',
      contribution: result.mpi - withoutWater,
      value:
        `${features.water.effectiveMm.toFixed(0)} mm efficaci su ` +
        `${features.water.rawMm.toFixed(0)} mm caduti in ${config.water.windowDays.value} giorni` +
        (features.water.initialDeficitMm > 1
          ? `; il terreno partiva secco, quindi il fabbisogno sale a ` +
            `${(config.water.referenceMm.value + features.water.initialDeficitMm).toFixed(0)} mm`
          : '') +
        (c.water > c.waterBalance + 0.005
          ? `; conta di più la pioggia intensa di ${c.trigger.daysSinceEvent ?? '?'} giorni fa, ` +
            `nei giorni in cui ci si aspetta la fruttificazione`
          : ''),
      ...provenanceOf(config.water.windowDays),
    },
    {
      key: 'thermal',
      label: 'Temperatura',
      contribution: result.mpi - withoutThermal,
      value:
        features.tMeanWindow === null
          ? 'media termica non disponibile'
          : `${features.tMeanWindow.toFixed(1)} °C di media su ` +
            `${config.thermal.airWindowDays.value} giorni, contro un ottimo di ` +
            `${c.thermal.optimumC.toFixed(1)} °C`,
      ...provenanceOf(config.thermal.optAutumnC),
    },
    {
      key: 'phenology',
      label: 'Stagione e quota',
      contribution: result.mpi - withoutPhenology,
      value:
        c.blend.autumnality > 0.6
          ? 'regime autunnale d’alta quota'
          : c.blend.autumnality < 0.4
            ? 'regime estivo di bassa quota'
            : 'fra regime estivo e autunnale',
      ...provenanceOf(config.phenology.autumnPeakDay),
    },
    {
      key: 'trigger',
      label: 'Innesco da pioggia intensa',
      contribution: result.mpi - withoutTrigger,
      value: c.trigger.detail,
      ...provenanceOf(config.trigger.lagDays),
    },
  ]

  /*
   * Il bosco si mostra solo dove e' stato misurato.
   *
   * Una zona senza misura ha il termine neutro per scelta (vedi forest.ts): elencarlo lo stesso
   * scriverebbe "Bosco: 0 punti" accanto a un dato che non esiste, e l'utente leggerebbe "qui il
   * bosco non conta" invece di "qui non lo sappiamo".
   */
  if (c.habitat.measured) {
    factors.push({
      key: 'habitat',
      label: 'Il bosco della zona',
      contribution: result.mpi - withoutHabitat,
      value: c.habitat.detail,
      ...provenanceOf(config.habitat.coverReference),
    })
  }

  for (const penalty of c.penalties) {
    if (!penalty.applied) continue
    const others = c.penalties.reduce((acc, p) => (p.key === penalty.key ? acc : acc * p.factor), 1)
    const without = 100 * clamped * others * habitat
    factors.push({
      key: `penalty.${penalty.key}`,
      label: penaltyLabel(penalty.key),
      contribution: result.mpi - without,
      value: penalty.detail,
      ...provenanceOf(penaltyParam(penalty.key, config)),
    })
  }

  // Le penalita' disattivate si mostrano come neutre e dichiarate tali: nascondere un fattore
  // che il modello calcola ma non applica sarebbe meno onesto che mostrarlo a zero.
  for (const penalty of c.penalties) {
    if (penalty.applied) continue
    factors.push({
      key: `penalty.${penalty.key}`,
      label: `${penaltyLabel(penalty.key)} (non applicato)`,
      contribution: 0,
      value: penalty.detail,
      ...provenanceOf(penaltyParam(penalty.key, config)),
    })
  }

  const positive = factors
    .filter((f) => f.contribution > POSITIVE_THRESHOLD)
    .sort((a, b) => b.contribution - a.contribution)
  const negative = factors
    .filter((f) => f.contribution < NEGATIVE_THRESHOLD)
    .sort((a, b) => a.contribution - b.contribution)
  const neutral = factors.filter(
    (f) => f.contribution >= NEGATIVE_THRESHOLD && f.contribution <= POSITIVE_THRESHOLD,
  )

  return {
    mpi: result.mpi,
    confidence,
    algorithmVersion: result.algorithmVersion,
    label: mpiLabel(result.mpi),
    positiveFactors: positive,
    negativeFactors: negative,
    neutralFactors: neutral,
    confidenceFactors,
    limitingFactor: limitingFactorOf(
      {
        withoutWater,
        withoutThermal,
        withoutPhenology,
        withoutPenalties,
        ...(c.habitat.measured ? { withoutHabitat } : {}),
      },
      result.mpi,
    ),
  }
}

/**
 * Il fattore che, se fosse ideale, farebbe salire di piu' il punteggio.
 * E' cio' che l'utente vuole sapere davvero: non "quanto vale l'acqua", ma "cosa mi manca".
 */
function limitingFactorOf(
  neutralised: {
    withoutWater: number
    withoutThermal: number
    withoutPhenology: number
    withoutPenalties: number
    /** Assente quando il bosco della zona non e' misurato: non si nomina cio' che non si sa. */
    withoutHabitat?: number
  },
  mpi: number,
): string | null {
  const gaps = [
    { key: 'Acqua disponibile nel suolo', gap: neutralised.withoutWater - mpi },
    { key: 'Temperatura', gap: neutralised.withoutThermal - mpi },
    { key: 'Stagione e quota', gap: neutralised.withoutPhenology - mpi },
    { key: 'Penalità meteorologiche', gap: neutralised.withoutPenalties - mpi },
    ...(neutralised.withoutHabitat === undefined
      ? []
      : [{ key: 'Il bosco della zona', gap: neutralised.withoutHabitat - mpi }]),
  ] as const
  const worst = gaps.reduce((acc, g) => (g.gap > acc.gap ? g : acc), gaps[0])
  return worst.gap > 1 ? worst.key : null
}

function penaltyLabel(key: string): string {
  switch (key) {
    case 'frost':
      return 'Gelata'
    case 'heat':
      return 'Stress da caldo'
    case 'vpd':
      return 'Aria secca (VPD)'
    case 'wind':
      return 'Vento'
    case 'heatShock':
      return 'Impennata di caldo'
    case 'thermalShock':
      return 'Shock termico'
    default:
      return key
  }
}

function penaltyParam(key: string, config: AlgorithmConfig): Param {
  const penalties = config.penalties
  switch (key) {
    case 'frost':
      return penalties.frost.threshold
    case 'heat':
      return penalties.heat.threshold
    case 'vpd':
      return penalties.vpd.threshold
    case 'wind':
      return penalties.wind.threshold
    case 'heatShock':
      return penalties.heatShock.threshold
    case 'thermalShock':
      return penalties.thermalShock.threshold
    default:
      return penalties.frost.threshold
  }
}

