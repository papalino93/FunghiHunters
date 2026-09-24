/**
 * Le varianti del modello messe a confronto nel backtest.
 *
 * **Nessuna variante tocca il modello di produzione.** Ognuna e' una configurazione costruita
 * spalmando `ALGORITHM_V1` e cambiando un solo parametro, oppure — dove il cambiamento non e'
 * esprimibile come parametro — un involucro attorno alle stesse funzioni pure `buildFeatures` e
 * `computeMpi`. Dove e' un involucro lo si dice, e si dice esattamente cosa fa: il confronto vale
 * solo se si sa che cosa si sta confrontando.
 *
 * La cella del backtest e' volutamente povera: quota sì, esposizione/pendenza/chioma `null`,
 * bosco non misurato (termine habitat neutro). Il punto GBIF e' dove qualcuno ha trovato un
 * porcino, quindi e' bosco per definizione: misurarne il bosco darebbe ai casi un vantaggio che i
 * controlli, nello stesso punto, avrebbero identico — non cambierebbe l'AUC, costerebbe solo.
 */

import { ALGORITHM_V1, type AlgorithmConfig, type Param } from '@/lib/config/algorithm'
import { buildFeatures, type CellContext, type DailyWeather } from '@/lib/model/features'
import { computeMpi, type MpiResult } from '@/lib/model/mpi'

/** Giorni di storia passati a `buildFeatures`: oltre le finestre del modello (al massimo 30). */
export const HISTORY_DAYS = 60

function withValue(param: Param, value: number): Param {
  return { ...param, value }
}

/** Serie fino al giorno `date` incluso, gli ultimi `keep` giorni. `null` se il giorno manca. */
export function historyUpTo(
  days: readonly DailyWeather[],
  date: string,
  keep = HISTORY_DAYS,
): DailyWeather[] | null {
  const index = days.findIndex((d) => d.date === date)
  if (index < 0) return null
  return days.slice(Math.max(0, index + 1 - keep), index + 1)
}

export function backtestCell(elevationM: number): CellContext {
  return { elevationM, aspectDeg: null, slopeDeg: null, canopyDensity: null, forest: null }
}

/** (a) Equivalente 1.4: senza il sollievo idrico dopo pioggia intensa introdotto nella 1.5. */
export const CONFIG_V14: AlgorithmConfig = {
  ...ALGORITHM_V1,
  version: 'backtest-1.4-equivalente',
  trigger: {
    ...ALGORITHM_V1.trigger,
    waterRelief: withValue(ALGORITHM_V1.trigger.waterRelief, 0),
  },
}

/** Larghezza del lato caldo della campana nelle varianti (d): da 7.5 a 12 gradi. */
export const RELAXED_SIGMA_WARM_C = 12

export const CONFIG_WARM_RELAXED: AlgorithmConfig = {
  ...ALGORITHM_V1,
  version: 'backtest-1.5-sigmaWarm12',
  thermal: {
    ...ALGORITHM_V1.thermal,
    sigmaWarmC: withValue(ALGORITHM_V1.thermal.sigmaWarmC, RELAXED_SIGMA_WARM_C),
  },
}

/** (e) Ottimo autunnale a 15 gradi invece di 13. */
export const CONFIG_OPT15: AlgorithmConfig = {
  ...ALGORITHM_V1,
  version: 'backtest-1.5-optAutumn15',
  thermal: { ...ALGORITHM_V1.thermal, optAutumnC: withValue(ALGORITHM_V1.thermal.optAutumnC, 15) },
}

/** Tetto del peso autunnale per la variante (c). */
export const MAX_ELEVATION_WEIGHT = 0.7

/**
 * Quota "stagionale" della variante (c): la quota vera, ma non oltre il punto in cui il peso del
 * regime autunnale arriva a `maxWeight`.
 *
 * In `seasonBlend` il peso e' `clamp((quota - 700) / (900 - 700), 0, 1)`: sopra 900 m vale 1 e il
 * termine estivo e' moltiplicato per zero, quindi a 1400 m in luglio la stagione e' "chiusa"
 * qualunque cosa faccia il meteo. Non c'e' un parametro di configurazione per mettere un tetto a
 * quel peso, e il modello di produzione non si tocca: si ottiene lo stesso effetto, esatto,
 * passando a `computeMpi` una quota limitata a 700 + 0.7 * 200 = 840 m. In `computeMpi` la quota
 * della cella entra **solo** in `seasonBlend` (lo verifica un test), e il bilancio idrico l'ha gia'
 * vista vera attraverso il meteo di Open-Meteo, corretto per la quota reale.
 *
 * Effetto collaterale, dichiarato: anche l'ottimo termico si sposta, perche' dipende dalla
 * `autumnality` della miscela. In pieno autunno cambia pochissimo (il termine estivo e' gia'
 * piccolo), in luglio l'ottimo sale verso quello estivo — che e' proprio l'ipotesi da provare.
 */
export function seasonalElevation(
  elevationM: number,
  config: AlgorithmConfig = ALGORITHM_V1,
  maxWeight = MAX_ELEVATION_WEIGHT,
  minWeight = 0,
): number {
  const low = config.phenology.lowElevationM.value
  const high = config.phenology.highElevationM.value
  // Senza pavimento la quota vera resta tale anche sotto 700 m (il peso vi e' comunque zero).
  const floor = minWeight > 0 ? low + minWeight * (high - low) : Number.NEGATIVE_INFINITY
  return Math.max(floor, Math.min(elevationM, low + maxWeight * (high - low)))
}

/**
 * Pavimento del peso autunnale per la variante (c2), lo specchio della (c): sotto 700 m il peso
 * autunnale e' zero e un porcino di fine ottobre a 400 m (querceti del Lazio, della Sardegna,
 * della Toscana costiera) prende la stagione solo dalla coda della campana estiva. La (c2) tiene
 * entrambi i regimi sempre possibili: peso autunnale fra 0.3 e 0.7, cioe' quota stagionale fra
 * 760 e 840 m. Aggiunta dopo aver visto i primi casi: dichiarata come ipotesi nata dai dati, da
 * confermare su dati che non l'hanno generata.
 */
export const MIN_ELEVATION_WEIGHT = 0.3

/** Soglia del fattore acqua (bilancio + sollievo 1.5) sopra cui la variante (d) allarga il caldo. */
export const GOOD_WATER_THRESHOLD = 0.5

export interface VariantInput {
  /** Serie gia' tagliata al giorno da valutare (vedi `historyUpTo`). */
  readonly history: readonly DailyWeather[]
  readonly elevationM: number
}

export interface WeatherVariant {
  readonly key: string
  readonly label: string
  /** Cosa cambia rispetto alla 1.5, in una riga. */
  readonly change: string
  readonly score: (input: VariantInput) => MpiResult
}

function scoreWith(config: AlgorithmConfig, input: VariantInput, elevationForSeason?: number): MpiResult {
  const cell = backtestCell(input.elevationM)
  const features = buildFeatures(input.history, cell, config)
  const seasonCell =
    elevationForSeason === undefined ? cell : { ...cell, elevationM: elevationForSeason }
  return computeMpi({ features, cell: seasonCell }, config)
}

/** (g) Autunno anche a bassa quota, senza togliere l'estate: peso minimo dell'autunno. */
export function configLowAutumn(weight: number): AlgorithmConfig {
  return {
    ...ALGORITHM_V1,
    version: `backtest-1.5-autunno-basso-${weight}`,
    phenology: {
      ...ALGORITHM_V1.phenology,
      lowElevationAutumnWeight: withValue(ALGORITHM_V1.phenology.lowElevationAutumnWeight, weight),
    },
  }
}

export const WEATHER_VARIANTS: readonly WeatherVariant[] = [
  {
    key: 'v14',
    label: '(a) 1.4 equivalente',
    change: 'trigger.waterRelief = 0',
    score: (input) => scoreWith(CONFIG_V14, input),
  },
  {
    key: 'v15',
    label: '(b) 1.5 attuale',
    change: 'nessuna (ALGORITHM_V1, 1.5.0-porcino)',
    score: (input) => scoreWith(ALGORITHM_V1, input),
  },
  {
    key: 'v15-estate-quota',
    label: '(c) 1.5 + estate in quota',
    change: `peso autunnale per quota al massimo ${MAX_ELEVATION_WEIGHT} (quota stagionale <= 840 m)`,
    score: (input) =>
      scoreWith(ALGORITHM_V1, input, seasonalElevation(input.elevationM, ALGORITHM_V1)),
  },
  {
    key: 'v15-regimi-misti',
    label: '(c2) 1.5 + entrambi i regimi a ogni quota',
    change:
      `peso autunnale per quota fra ${MIN_ELEVATION_WEIGHT} e ${MAX_ELEVATION_WEIGHT} ` +
      '(quota stagionale 760-840 m)',
    score: (input) =>
      scoreWith(
        ALGORITHM_V1,
        input,
        seasonalElevation(input.elevationM, ALGORITHM_V1, MAX_ELEVATION_WEIGHT, MIN_ELEVATION_WEIGHT),
      ),
  },
  {
    key: 'v15-caldo-se-umido',
    label: '(d) 1.5 + caldo tollerato se c\'e\' acqua',
    change:
      `sigmaWarmC 7.5 -> ${RELAXED_SIGMA_WARM_C} solo nei giorni con fattore acqua 1.5 >= ` +
      `${GOOD_WATER_THRESHOLD}`,
    score: (input) => {
      const base = scoreWith(ALGORITHM_V1, input)
      return base.components.water >= GOOD_WATER_THRESHOLD
        ? scoreWith(CONFIG_WARM_RELAXED, input)
        : base
    },
  },
  {
    key: 'v15-caldo-sempre',
    label: '(d2) 1.5 + caldo tollerato sempre',
    change: `sigmaWarmC 7.5 -> ${RELAXED_SIGMA_WARM_C} in tutti i giorni (controllo della (d))`,
    score: (input) => scoreWith(CONFIG_WARM_RELAXED, input),
  },
  {
    key: 'v15-ottimo15',
    label: '(e) 1.5 + ottimo autunnale 15 °C',
    change: 'thermal.optAutumnC 13 -> 15',
    score: (input) => scoreWith(CONFIG_OPT15, input),
  },
  {
    key: 'v15-autunno-basso-05',
    label: '(g) 1.5 + autunno a bassa quota (0,5)',
    change: 'phenology.lowElevationAutumnWeight = 0.5 (estate invariata)',
    score: (input) => scoreWith(configLowAutumn(0.5), input),
  },
  {
    key: 'v15-autunno-basso-08',
    label: '(g2) 1.5 + autunno a bassa quota (0,8)',
    change: 'phenology.lowElevationAutumnWeight = 0.8 (estate invariata)',
    score: (input) => scoreWith(configLowAutumn(0.8), input),
  },
]
