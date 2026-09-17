/**
 * Catalogo delle grandezze SIR: dal codice `IDST` al nostro dominio.
 *
 * Ogni riga riporta la finestra di aggregazione **verificata leggendo gli orari reali della
 * serie**, non dedotta dal nome. E' una distinzione che conta: l'etichetta
 * "TERMOMETRIA - Massima giornaliera" non dice nulla sulla finestra, e la finestra e' 9-9.
 *
 * Verifica eseguita il 2026-09-17 sulla stazione TOS11000114 (Abbadia S.S. - Laghetto Verde),
 * ispezionando gli orari distinti degli ultimi ~400 record di ciascuna serie.
 */

import type { AggregationWindow, Variable } from '@/lib/domain/types'

export interface SirMeasureSpec {
  /** Valore del parametro `IDST` negli URL `dati.php`. */
  readonly idst: string
  /** Chiave con cui la grandezza compare nell'oggetto `Consistenza` dell'anagrafica. */
  readonly consistencyKey: string
  readonly variable: Variable
  readonly window: AggregationWindow
  readonly unit: string
  /** Orario locale osservato nelle etichette `Data` della serie. */
  readonly observedLabelHour: number
}

/**
 * Le dodici grandezze esposte da `dati.php`. Il prompt di progetto ne elencava sei: le altre
 * sei sono emerse contando le chiavi `Consistenza` su tutte le 1411 stazioni.
 */
export const SIR_MEASURES: readonly SirMeasureSpec[] = [
  {
    idst: 'pluvio0_24',
    consistencyKey: 'PLUVIOMETRIA - Aggregazione a 24 ore (0-24)',
    variable: 'precipitation',
    window: '0_24',
    unit: 'mm',
    observedLabelHour: 0,
  },
  {
    idst: 'pluvio',
    consistencyKey: 'PLUVIOMETRIA - Aggregazione a 24 ore (9-9)',
    variable: 'precipitation',
    window: '9_9',
    unit: 'mm',
    observedLabelHour: 9,
  },
  {
    idst: 'termo_max',
    consistencyKey: 'TERMOMETRIA - Massima giornaliera',
    variable: 'temperature_max',
    window: '9_9',
    unit: 'degC',
    observedLabelHour: 9,
  },
  {
    idst: 'termo_min',
    consistencyKey: 'TERMOMETRIA - Minima giornaliera',
    variable: 'temperature_min',
    window: '9_9',
    unit: 'degC',
    observedLabelHour: 9,
  },
  {
    idst: 'igro0_24',
    consistencyKey: 'IGROMETRIA - Media giornaliera (0-24)',
    variable: 'relative_humidity_mean',
    window: '0_24',
    unit: 'percent',
    observedLabelHour: 0,
  },
  {
    idst: 'anemo_vel',
    consistencyKey: 'ANEMOMERIA - Velocita Media Giornaliera',
    variable: 'wind_speed_mean',
    window: '0_24',
    unit: 'm/s',
    observedLabelHour: 0,
  },
  {
    idst: 'anemo_raf',
    consistencyKey: 'ANEMOMERIA - Velocita Raffica Giornaliera',
    variable: 'wind_gust',
    window: '0_24',
    unit: 'm/s',
    observedLabelHour: 0,
  },
  {
    idst: 'anemo_dir',
    consistencyKey: 'ANEMOMERIA - Direzione Media Giornaliera',
    variable: 'wind_direction',
    window: '0_24',
    unit: 'deg',
    observedLabelHour: 0,
  },
]

/**
 * Grandezze presenti nell'anagrafica ma che non alimentano il modello.
 * Le elenchiamo per non doverle riscoprire, e perche' il conteggio delle stazioni attive
 * sull'anagrafica deve saperle ignorare invece di trattarle come sconosciute.
 */
export const SIR_IGNORED_CONSISTENCY_KEYS: readonly string[] = [
  'IDROMETRIA - Aggregazione livello giornaliero',
  'IDROMETRIA - Aggregazione portata giornaliera',
  'IDROMETRIA - Istantaneo giornaliero alle ore 12',
  'FREATIMETRIA - Livello medio giornaliero',
]

const BY_CONSISTENCY_KEY = new Map(SIR_MEASURES.map((m) => [m.consistencyKey, m]))
const BY_IDST = new Map(SIR_MEASURES.map((m) => [m.idst, m]))

export function measureByConsistencyKey(key: string): SirMeasureSpec | undefined {
  return BY_CONSISTENCY_KEY.get(key)
}

export function measureByIdst(idst: string): SirMeasureSpec | undefined {
  return BY_IDST.get(idst)
}

/**
 * Le grandezze che vogliamo davvero ingerire, in ordine di priorita'.
 *
 * `pluvio0_24` viene prima di `pluvio` perche' e' la serie allineata a Open-Meteo. La 9-9 si
 * ingerisce comunque, ma serve solo come controllo incrociato.
 */
export const SIR_PRIMARY_IDSTS: readonly string[] = [
  'pluvio0_24',
  'termo_max',
  'termo_min',
  'igro0_24',
  'anemo_vel',
]

/**
 * Sfasamento in giorni da applicare a una serie SIR per allinearla al calendario 0-24.
 *
 * **Misurato, non dedotto.** Confronto fra la stazione TOS11000114 e Open-Meteo alla stessa
 * quota (910 m), 70 giorni sovrapposti, errore medio assoluto per ogni sfasamento provato:
 *
 * | serie          | shift -1 | shift 0  | shift +1 |
 * |----------------|----------|----------|----------|
 * | pioggia 0-24   | 1.98 mm  | **1.01** | 1.63 mm  |
 * | pioggia 9-9    | 1.47 mm  | **1.17** | 2.02 mm  |
 * | Tmax           | 1.61 C   | **0.95** | 1.70 C   |
 * | Tmin           | 3.20 C   | 3.14 C   | 3.11 C   |
 *
 * Due letture. La prima: nessuna serie va spostata, nemmeno quelle etichettate 9-9 — la fonte
 * attribuisce gia' il valore al giorno giusto. La seconda, piu' interessante: per la Tmin il
 * test **non discrimina**, perche' l'errore e' dominato da un bias di sito, non da uno
 * sfasamento. Vedi `SIR_KNOWN_BIAS_NOTE`.
 */
export function dayShiftToCanonical(spec: SirMeasureSpec): number {
  return DAY_SHIFT_BY_IDST[spec.idst] ?? 0
}

/**
 * Sfasamenti per grandezza. Oggi sono tutti zero, ed e' un risultato misurato, non un'ipotesi.
 * La tabella esiste perche' se una serie cambiasse convenzione la correzione andrebbe scritta
 * qui e in nessun altro punto della pipeline.
 */
const DAY_SHIFT_BY_IDST: Readonly<Record<string, number>> = {
  pluvio0_24: 0,
  pluvio: 0,
  termo_max: 0,
  termo_min: 0,
  igro0_24: 0,
  anemo_vel: 0,
  anemo_raf: 0,
  anemo_dir: 0,
}

/**
 * Nota di calibrazione sul bias stazione-modello, misurata insieme allo sfasamento.
 *
 * Sulla stessa coppia stazione/cella, la differenza media SIR meno Open-Meteo e':
 * Tmax **-0.52 C** (sd 1.16), Tmin **-3.14 C** (sd 1.22). Rimuovendo il bias medio l'errore
 * residuo scende a 0.95 C e 0.99 C rispettivamente: e' quindi un **bias sistematico**, non
 * rumore. La stazione "Laghetto Verde" sta in una conca e accumula aria fredda di notte, cosa
 * che un modello a 9 km non puo' vedere.
 *
 * Conseguenza per il modello: la penalita' da gelata e ogni soglia notturna vanno valutate sulla
 * **Tmin osservata**, non su quella modellata, altrimenti si perdono tre gradi di raffreddamento
 * proprio dove contano. Ed e' la giustificazione quantitativa della correzione del bias
 * per variabile e per stazione prevista in Phase 2.
 */
export const SIR_KNOWN_BIAS_NOTE = {
  station: 'TOS11000114',
  comparedAgainst: 'open-meteo@910m',
  measuredOn: '2026-09-17',
  sampleDays: 70,
  biasDegC: { temperature_max: -0.52, temperature_min: -3.14 },
  residualMaeDegC: { temperature_max: 0.95, temperature_min: 0.99 },
} as const
