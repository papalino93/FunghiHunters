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

/**
 * La 1.5.0 congelata, base di tutte le varianti storiche. Le varianti erano scritte come «1.5 +
 * una modifica» spalmando `ALGORITHM_V1`; dalla 1.6.0 `ALGORITHM_V1` contiene già due di quelle
 * modifiche, e i risultati pubblicati in `docs/VALIDAZIONE.md` non sarebbero più riproducibili.
 */
export const CONFIG_V15: AlgorithmConfig = {
  ...ALGORITHM_V1,
  version: 'backtest-1.5.0',
  thermal: { ...ALGORITHM_V1.thermal, optAutumnC: withValue(ALGORITHM_V1.thermal.optAutumnC, 13) },
  phenology: {
    ...ALGORITHM_V1.phenology,
    lowElevationAutumnWeight: withValue(ALGORITHM_V1.phenology.lowElevationAutumnWeight, 0),
  },
}

/** (a) Equivalente 1.4: senza il sollievo idrico dopo pioggia intensa introdotto nella 1.5. */
export const CONFIG_V14: AlgorithmConfig = {
  ...CONFIG_V15,
  version: 'backtest-1.4-equivalente',
  trigger: {
    ...CONFIG_V15.trigger,
    waterRelief: withValue(CONFIG_V15.trigger.waterRelief, 0),
  },
}

/** Larghezza del lato caldo della campana nelle varianti (d): da 7.5 a 12 gradi. */
export const RELAXED_SIGMA_WARM_C = 12

export const CONFIG_WARM_RELAXED: AlgorithmConfig = {
  ...CONFIG_V15,
  version: 'backtest-1.5-sigmaWarm12',
  thermal: {
    ...CONFIG_V15.thermal,
    sigmaWarmC: withValue(CONFIG_V15.thermal.sigmaWarmC, RELAXED_SIGMA_WARM_C),
  },
}

/** (e) Ottimo autunnale a 15 gradi invece di 13. */
export const CONFIG_OPT15: AlgorithmConfig = {
  ...CONFIG_V15,
  version: 'backtest-1.5-optAutumn15',
  thermal: { ...CONFIG_V15.thermal, optAutumnC: withValue(CONFIG_V15.thermal.optAutumnC, 15) },
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
    ...CONFIG_V15,
    version: `backtest-1.5-autunno-basso-${weight}`,
    phenology: {
      ...CONFIG_V15.phenology,
      lowElevationAutumnWeight: withValue(CONFIG_V15.phenology.lowElevationAutumnWeight, weight),
    },
  }
}

/** (h) Ottimo autunnale 15 °C insieme all'autunno a bassa quota. */
export function configOpt15LowAutumn(weight: number): AlgorithmConfig {
  const low = configLowAutumn(weight)
  return {
    ...low,
    version: `backtest-1.5-opt15-autunno-basso-${weight}`,
    thermal: { ...low.thermal, optAutumnC: withValue(low.thermal.optAutumnC, 15) },
  }
}

/**
 * (j) Il caldo a bassa quota, sul modello in produzione (25/09/2026).
 *
 * Porcini a Roveta e Chiesanuova (Scandicci / San Casciano, ~250 m, querceti) con 21,6 °C di media
 * a 20 giorni, dove il modello mette l'ottimo a 15,6 e toglie 23 punti. Le specie di collina (porcino
 * nero ed estivo) tollerano più caldo di quello di faggeta, e settembre è il mese in cui il banco di
 * prova distingue peggio. Le varianti agiscono solo sotto `phenology.lowElevationM`, sfumando fino a
 * `highElevationM`: sopra, identiche alla produzione.
 */
function lowElevationShare(elevationM: number, config: AlgorithmConfig = ALGORITHM_V1): number {
  const low = config.phenology.lowElevationM.value
  const high = config.phenology.highElevationM.value
  if (elevationM <= low) return 1
  if (elevationM >= high) return 0
  return (high - elevationM) / (high - low)
}

export function configWarmLow(
  elevationM: number,
  lowOptAutumnC: number | null,
  lowSigmaWarmC: number | null,
): AlgorithmConfig {
  const share = lowElevationShare(elevationM)
  const t = ALGORITHM_V1.thermal
  const opt = lowOptAutumnC === null ? t.optAutumnC.value : t.optAutumnC.value + (lowOptAutumnC - t.optAutumnC.value) * share
  const sigma = lowSigmaWarmC === null ? t.sigmaWarmC.value : t.sigmaWarmC.value + (lowSigmaWarmC - t.sigmaWarmC.value) * share
  return {
    ...ALGORITHM_V1,
    version: `backtest-caldo-basso-${String(lowOptAutumnC)}-${String(lowSigmaWarmC)}`,
    thermal: { ...t, optAutumnC: withValue(t.optAutumnC, opt), sigmaWarmC: withValue(t.sigmaWarmC, sigma) },
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
    change: 'la 1.5.0 congelata (CONFIG_V15)',
    score: (input) => scoreWith(CONFIG_V15, input),
  },
  {
    key: 'v15-estate-quota',
    label: '(c) 1.5 + estate in quota',
    change: `peso autunnale per quota al massimo ${MAX_ELEVATION_WEIGHT} (quota stagionale <= 840 m)`,
    score: (input) =>
      scoreWith(CONFIG_V15, input, seasonalElevation(input.elevationM, ALGORITHM_V1)),
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
      const base = scoreWith(CONFIG_V15, input)
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
  {
    key: 'v15-opt15-autunno-basso-05',
    label: '(h) ottimo 15 °C + autunno a bassa quota (0,5)',
    change: 'thermal.optAutumnC = 15 e phenology.lowElevationAutumnWeight = 0.5',
    score: (input) => scoreWith(configOpt15LowAutumn(0.5), input),
  },
  {
    key: 'v15-opt15-autunno-basso-08',
    label: '(h2) ottimo 15 °C + autunno a bassa quota (0,8)',
    change: 'thermal.optAutumnC = 15 e phenology.lowElevationAutumnWeight = 0.8',
    score: (input) => scoreWith(configOpt15LowAutumn(0.8), input),
  },
  {
    key: 'p-ottimo-basso-17',
    label: '(j1) produzione + ottimo autunnale 17 °C in basso',
    change: 'thermal.optAutumnC 15 -> 17 sotto 700 m, sfumato fino a 900 m',
    score: (input) => scoreWith(configWarmLow(input.elevationM, 17, null), input),
  },
  {
    key: 'p-ottimo-basso-19',
    label: '(j2) produzione + ottimo autunnale 19 °C in basso',
    change: 'thermal.optAutumnC 15 -> 19 sotto 700 m, sfumato fino a 900 m',
    score: (input) => scoreWith(configWarmLow(input.elevationM, 19, null), input),
  },
  {
    key: 'p-caldo-basso-10',
    label: '(j3) produzione + caldo tollerato in basso',
    change: 'thermal.sigmaWarmC 7.5 -> 10 sotto 700 m, sfumato fino a 900 m',
    score: (input) => scoreWith(configWarmLow(input.elevationM, null, 10), input),
  },
  {
    key: 'p-ottimo17-caldo10',
    label: '(j4) produzione + ottimo 17 °C e caldo tollerato in basso',
    change: 'optAutumnC 17 e sigmaWarmC 10 sotto 700 m, sfumati fino a 900 m',
    score: (input) => scoreWith(configWarmLow(input.elevationM, 17, 10), input),
  },
  {
    key: 'produzione',
    label: '(p) modello in produzione',
    change: `ALGORITHM_V1 (${ALGORITHM_V1.version})`,
    score: (input) => scoreWith(ALGORITHM_V1, input),
  },
]
