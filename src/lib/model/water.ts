/**
 * Bilancio idrico: il cuore del modello.
 *
 * Non conta i millimetri, stima **l'acqua effettivamente rimasta disponibile**. Ogni pioggia
 * decade nel tempo, ma il decadimento non e' costante: dipende da quanto fa caldo, quanta acqua
 * l'atmosfera sta chiedendo al suolo (ET0), quanto tira vento, se la cella e' sotto chioma e
 * come e' esposta.
 *
 *   S(t) = somma su i di  P(t-i) * exp( -somma dei lambda dei giorni successivi alla pioggia )
 *
 * La forma esponenziale non e' copiata acriticamente: e' la soluzione di un serbatoio che si
 * svuota proporzionalmente al proprio contenuto, che e' una descrizione grossolana ma
 * difendibile di un suolo che cede acqua per evapotraspirazione. Cio' che aggiungiamo rispetto
 * alla forma classica e' che il tasso di svuotamento varia giorno per giorno con le condizioni,
 * invece di essere una costante scelta a tavolino.
 *
 * La finestra e' di 26 giorni, che non e' un numero tondo scelto da noi: e' la lunghezza
 * selezionata per AIC su dieci anni di censimento giornaliero di sporocarpi.
 */

import type { AlgorithmConfig } from '@/lib/config/algorithm'

/** Condizioni di un singolo giorno che influenzano il decadimento. */
export interface DecayInputs {
  /** Temperatura media dell'aria del giorno. */
  readonly temperatureC: number | null
  /** Evapotraspirazione di riferimento del giorno, in mm. */
  readonly et0Mm: number | null
  /** Vento medio del giorno, in m/s. */
  readonly windMs: number | null
}

/** Caratteristiche della cella che modulano il decadimento, costanti nel tempo. */
export interface CellModifiers {
  /** Densita' di chioma 0-1. `null` quando non la conosciamo: nessuna correzione. */
  readonly canopyDensity: number | null
  /** Esposizione in gradi (0 = nord, 180 = sud). `null` in pianura o dove non la conosciamo. */
  readonly aspectDeg: number | null
}

const NO_MODIFIERS: CellModifiers = { canopyDensity: null, aspectDeg: null }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Quanto un versante e' esposto a sud, da 0 (pieno nord) a 1 (pieno sud).
 * Si usa il coseno perche' est e ovest devono stare a meta' strada, non agli estremi.
 */
export function southness(aspectDeg: number): number {
  return (1 - Math.cos((aspectDeg * Math.PI) / 180)) / 2
}

/**
 * Tasso di decadimento di un singolo giorno.
 *
 * I modulatori sono moltiplicativi e ciascuno e' limitato, perche' un giorno molto caldo e molto
 * ventoso non deve poter azzerare in un colpo l'acqua di tre settimane.
 */
export function dailyDecay(
  day: DecayInputs,
  config: AlgorithmConfig,
  modifiers: CellModifiers = NO_MODIFIERS,
): number {
  const w = config.water
  let lambda = w.lambdaBase.value

  if (day.temperatureC !== null) {
    const excess = day.temperatureC - w.lambdaTempRef.value
    lambda *= clamp(Math.exp(w.lambdaTempCoeff.value * excess), 0.4, 3)
  }

  if (day.et0Mm !== null && w.lambdaEt0Ref.value > 0) {
    const ratio = day.et0Mm / w.lambdaEt0Ref.value
    lambda *= clamp(1 + w.lambdaEt0Coeff.value * (ratio - 1), 0.4, 2.5)
  }

  if (day.windMs !== null && w.lambdaWindRef.value > 0) {
    const ratio = day.windMs / w.lambdaWindRef.value
    lambda *= clamp(1 + w.lambdaWindCoeff.value * (ratio - 1), 0.7, 1.6)
  }

  if (modifiers.canopyDensity !== null) {
    // Interpola fra nessuna correzione (radura) e la protezione piena (chioma chiusa).
    const shelter = 1 + (w.canopyShelter.value - 1) * clamp(modifiers.canopyDensity, 0, 1)
    lambda *= shelter
  }

  if (modifiers.aspectDeg !== null) {
    const exposure = 1 + (w.southFacingPenalty.value - 1) * southness(modifiers.aspectDeg)
    lambda *= exposure
  }

  return Math.max(0, lambda)
}

/** Serie giornaliera in ingresso al bilancio, dal piu' vecchio al piu' recente. */
export interface WaterDay extends DecayInputs {
  readonly date: string
  /** Pioggia del giorno in mm. `null` conta come assenza di dato, non come zero. */
  readonly precipitationMm: number | null
}

export interface WaterBalanceResult {
  /** Acqua efficace residua, in millimetri equivalenti. */
  readonly effectiveMm: number
  /** Pioggia grezza cumulata sulla stessa finestra, per il confronto. */
  readonly rawMm: number
  /** Deficit iniziale imposto dal suolo secco, in mm. */
  readonly initialDeficitMm: number
  /** Termine idrico normalizzato, 0 al tetto di configurazione. */
  readonly score: number
  /** Decadimento medio applicato, utile da mostrare nel pannello admin. */
  readonly meanDecay: number
  /** Giorni della finestra effettivamente coperti da un dato di pioggia. */
  readonly coveredDays: number
}

/**
 * Deficit iniziale imposto dallo stato del suolo a inizio finestra.
 *
 * E' il meccanismo che risponde alla richiesta di non fissare una soglia di pioggia rigida: con
 * suolo gia' carico il deficit e' nullo e bastano trenta millimetri, dopo settimane secche il
 * deficit e' massimo e ne servono settanta. La soglia non e' scritta da nessuna parte, emerge.
 */
export function initialDeficit(
  soilMoistureAtStart: number | null,
  config: AlgorithmConfig,
): number {
  const w = config.water
  if (soilMoistureAtStart === null) {
    // Senza il dato assumiamo una condizione intermedia invece del caso migliore: sbagliare per
    // eccesso di ottimismo qui significa mandare qualcuno a camminare per niente.
    return w.maxInitialDeficitMm.value / 2
  }
  const span = w.wetSoilThreshold.value - w.drySoilThreshold.value
  if (span <= 0) return 0
  const dryness = clamp((w.wetSoilThreshold.value - soilMoistureAtStart) / span, 0, 1)
  return w.maxInitialDeficitMm.value * dryness
}

/**
 * Calcola il bilancio idrico sulla finestra che termina con l'ultimo giorno della serie.
 *
 * @param days serie giornaliera ordinata dal piu' vecchio al piu' recente
 * @param soilMoistureAtStart umidita' volumetrica del suolo a inizio finestra (m3/m3)
 */
export function waterBalance(
  days: readonly WaterDay[],
  soilMoistureAtStart: number | null,
  config: AlgorithmConfig,
  modifiers: CellModifiers = NO_MODIFIERS,
): WaterBalanceResult {
  const windowDays = Math.round(config.water.windowDays.value)
  const window = days.slice(-windowDays)

  if (window.length === 0) {
    return {
      effectiveMm: 0,
      rawMm: 0,
      initialDeficitMm: initialDeficit(soilMoistureAtStart, config),
      score: 0,
      meanDecay: 0,
      coveredDays: 0,
    }
  }

  // Decadimento di ogni giorno della finestra, calcolato una volta sola.
  const decays = window.map((day) => dailyDecay(day, config, modifiers))

  let effective = 0
  let raw = 0
  let covered = 0

  for (const [index, day] of window.entries()) {
    if (day.precipitationMm === null) continue
    covered += 1
    raw += day.precipitationMm
    if (day.precipitationMm === 0) continue

    // La pioggia del giorno `index` subisce il decadimento di tutti i giorni successivi.
    // Il giorno stesso non decade: e' appena caduta.
    let accumulated = 0
    for (let k = index + 1; k < window.length; k += 1) {
      accumulated += decays[k] ?? 0
    }
    effective += day.precipitationMm * Math.exp(-accumulated)
  }

  const deficit = initialDeficit(soilMoistureAtStart, config)

  /*
   * Il deficit alza il **fabbisogno**, non si sottrae dall'offerta.
   *
   * La prima versione sottraeva il deficit dall'acqua efficace e tagliava a zero. Sui dati reali
   * del 17 settembre 2026 dava esattamente 0.0 a cinque zone su sette, rendendo indistinguibili
   * l'Amiata con 37 mm in 26 giorni e il Casentino con 0.4: lo stesso salto binario che rende
   * poco utile il modello baseline.
   *
   * La forma a potenza e' strettamente monotona e non tocca mai lo zero: fra due situazioni
   * entrambe sfavorevoli, quella con piu' acqua resta piu' alta. Conta, perche' e' da li' che si
   * legge se le condizioni stanno migliorando.
   */
  const requirement = config.water.referenceMm.value + deficit
  const score =
    requirement <= 0
      ? 0
      : clamp(
          Math.pow(effective / requirement, config.water.shapeExponent.value),
          0,
          config.water.cap.value,
        )

  const meanDecay = decays.reduce((a, b) => a + b, 0) / decays.length

  return {
    effectiveMm: effective,
    rawMm: raw,
    initialDeficitMm: deficit,
    score,
    meanDecay,
    coveredDays: covered,
  }
}
