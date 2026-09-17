/**
 * Configurazione versionata dell'algoritmo MPI.
 *
 * **Nessun numero del modello vive nel codice.** Soglie, pesi, decadimenti, penalita' e
 * parametri di specie stanno tutti qui, e ogni modifica genera una nuova `version` che viene
 * salvata insieme a ogni punteggio. E' cio' che rende possibile il backtest, il confronto fra
 * versioni e la calibrazione senza toccare il motore.
 *
 * Ogni parametro porta la sua provenienza:
 *   `sourced`    = valore misurato in letteratura, con citazione
 *   `calibrate`  = parametro da calibrare, dichiarato tale anche in UI
 *
 * Un parametro `sourced` senza citazione e' un errore, e lo schema del database lo rifiuta.
 */

/** Provenienza di un parametro del modello. */
export type ParamProvenance = 'sourced' | 'calibrate'

export interface Param {
  readonly value: number
  readonly provenance: ParamProvenance
  /** Obbligatoria quando `provenance` e' `sourced`. */
  readonly source?: string
  readonly note?: string
}

const sourced = (value: number, source: string, note?: string): Param =>
  note === undefined
    ? { value, provenance: 'sourced', source }
    : { value, provenance: 'sourced', source, note }

const calibrate = (value: number, note?: string): Param =>
  note === undefined ? { value, provenance: 'calibrate' } : { value, provenance: 'calibrate', note }

/** Riferimenti bibliografici citati dai parametri. */
export const REFERENCES = {
  brejon2026:
    'Brejon Lamartiniere E., Hoffman J.I. (2026), Predicting porcini: a decade of sporocarp ' +
    'monitoring reveals the meteorological triggers of Boletus edulis fruiting in central ' +
    'European beech forests. bioRxiv 10.64898/2025.12.12.693895 (preprint, non sottoposto a ' +
    'peer review)',
  karavani2018:
    'Karavani A. et al. (2018), Effect of climatic and soil moisture conditions on mushroom ' +
    'productivity and related ecosystem services in Mediterranean pine stands facing climate ' +
    'change. Agricultural and Forest Meteorology 248: 432-440',
} as const

// ============================================================================
// BILANCIO IDRICO
// ============================================================================

export interface WaterConfig {
  /** Giorni di storia considerati nel bilancio. */
  readonly windowDays: Param
  /** Decadimento giornaliero di base, prima dei modulatori. */
  readonly lambdaBase: Param
  /** Sensibilita' del decadimento alla temperatura, per grado sopra il riferimento. */
  readonly lambdaTempCoeff: Param
  /** Temperatura di riferimento del decadimento. */
  readonly lambdaTempRef: Param
  /** Sensibilita' del decadimento a ET0, normalizzata sul valore di riferimento. */
  readonly lambdaEt0Coeff: Param
  readonly lambdaEt0Ref: Param
  /** Sensibilita' del decadimento al vento. */
  readonly lambdaWindCoeff: Param
  readonly lambdaWindRef: Param
  /** Moltiplicatore del decadimento sotto chioma densa (< 1: l'acqua dura di piu'). */
  readonly canopyShelter: Param
  /** Moltiplicatore del decadimento sui versanti esposti a sud (> 1: asciuga prima). */
  readonly southFacingPenalty: Param
  /** Acqua efficace che corrisponde al punteggio pieno, su suolo gia' umido. */
  readonly referenceMm: Param
  /**
   * Esponente della curva idrica. Sopra 1 penalizza la parte bassa della scala, mantenendo
   * la monotonia: piu' acqua da' sempre un punteggio piu' alto, anche fra due situazioni
   * entrambe sfavorevoli.
   */
  readonly shapeExponent: Param
  /** Deficit iniziale massimo, quando il suolo parte completamente secco. */
  readonly maxInitialDeficitMm: Param
  /** Umidita' del suolo (m3/m3) sopra cui il deficit iniziale e' nullo. */
  readonly wetSoilThreshold: Param
  /** Umidita' del suolo sotto cui il deficit iniziale e' massimo. */
  readonly drySoilThreshold: Param
  /**
   * Tetto del termine idrico. Sopra 1 perche' due studi indipendenti non trovano una soglia
   * superiore di precipitazione: piu' pioggia continua ad aiutare, con rendimento decrescente.
   */
  readonly cap: Param
}

// ============================================================================
// IDONEITA' TERMICA
// ============================================================================

export interface ThermalConfig {
  /** Ampiezza della finestra su cui si media la temperatura dell'aria. */
  readonly airWindowDays: Param
  /** Ottimo termico del regime autunnale d'alta quota. */
  readonly optAutumnC: Param
  /** Ottimo termico del regime estivo di bassa quota. */
  readonly optSummerC: Param
  /** Larghezza della campana di idoneita', in gradi. */
  readonly sigmaC: Param
  /** Ampiezza della finestra sulla temperatura del suolo. */
  readonly soilWindowDays: Param
  readonly soilOptC: Param
  readonly soilSigmaC: Param
  /** Peso della temperatura del suolo rispetto a quella dell'aria. */
  readonly soilWeight: Param
}

// ============================================================================
// STAGIONALITA'
// ============================================================================

export interface PhenologyConfig {
  /** Giorno dell'anno del picco estivo. */
  readonly summerPeakDay: Param
  readonly summerSigmaDays: Param
  /** Giorno dell'anno del picco autunnale. */
  readonly autumnPeakDay: Param
  readonly autumnSigmaDays: Param
  /** Quota sotto cui domina il regime estivo. */
  readonly lowElevationM: Param
  /** Quota sopra cui domina il regime autunnale. */
  readonly highElevationM: Param
  /** Valore minimo del fattore stagionale: fuori stagione il potenziale non e' mai esattamente zero. */
  readonly floor: Param
  /** Peso dell'anomalia climatica rispetto alla normale della cella. */
  readonly anomalyWeight: Param
}

// ============================================================================
// PENALITA'
// ============================================================================

export interface PenaltyConfig {
  readonly frost: PenaltySpec
  readonly heat: PenaltySpec
  readonly vpd: PenaltySpec
  readonly wind: PenaltySpec
  readonly thermalShock: PenaltySpec
}

export interface PenaltySpec {
  /** Soglia oltre la quale la penalita' inizia ad agire. */
  readonly threshold: Param
  /** Valore minimo del moltiplicatore: una penalita' riduce, non azzera. */
  readonly floor: Param
  /** Peso complessivo: a 0 la penalita' e' calcolata e registrata ma non applicata. */
  readonly weight: Param
}

// ============================================================================
// CONFIDENCE
// ============================================================================

export interface ConfidenceConfig {
  /** Distanza a cui il contributo di una stazione scende a 1/e, per variabile. */
  readonly distanceScaleKm: Readonly<Record<string, Param>>
  /** Dislivello a cui il contributo scende a 1/e. */
  readonly elevationScaleM: Param
  /** Numero di stazioni a cui il contributo di densita' si considera saturo. */
  readonly densitySaturation: Param
  /** Orizzonte previsionale a cui il contributo scende a 1/e. */
  readonly horizonScaleDays: Param
  /** Fattori di qualita' per provenienza. */
  readonly provenanceQuality: Readonly<Record<string, Param>>
}

export interface AlgorithmConfig {
  readonly version: string
  readonly water: WaterConfig
  readonly thermal: ThermalConfig
  readonly phenology: PhenologyConfig
  readonly penalties: PenaltyConfig
  readonly confidence: ConfidenceConfig
}

/**
 * MPI v1.
 *
 * I due parametri meglio fondati dell'intero modello sono la finestra termica di 20 giorni con
 * ottimo a 13 gradi e la finestra di precipitazione di 26 giorni senza soglia superiore. Vengono
 * da dieci anni di censimento giornaliero di sporocarpi in faggeta, con selezione delle finestre
 * per AIC su tutte le combinazioni fra 2 e 35 giorni.
 *
 * Quasi tutto il resto e' da calibrare, ed e' dichiarato come tale.
 */
export const ALGORITHM_V1: AlgorithmConfig = {
  version: '1.0.0-porcino',

  water: {
    windowDays: sourced(
      26,
      REFERENCES.brejon2026,
      'Finestra selezionata per AIC fra 2 e 35 giorni. Coerente con Karavani 2018, che trova ' +
        'un ritardo fino a un mese fra precipitazione e umidita\' del suolo in ambiente mediterraneo.',
    ),
    lambdaBase: calibrate(
      0.055,
      'Con i modulatori a 1 corrisponde a un tempo di dimezzamento di circa 12-13 giorni, ' +
        'compatibile con una finestra utile di 26 giorni.',
    ),
    lambdaTempCoeff: calibrate(0.045, 'Il decadimento accelera col caldo.'),
    lambdaTempRef: sourced(
      13,
      REFERENCES.brejon2026,
      'Usiamo l\'ottimo termico misurato come riferimento del decadimento, invece di un valore ' +
        'arbitrario: sopra questa soglia il suolo perde acqua piu\' in fretta di quanto il ' +
        'micelio possa sfruttarla.',
    ),
    lambdaEt0Coeff: calibrate(
      0.6,
      'E\' il termine che il modello baseline non ha affatto, e che spiega perche\' una buona ' +
        'pioggia puo\' essere annullata da giorni caldi e ventosi.',
    ),
    lambdaEt0Ref: calibrate(3.5, 'ET0 giornaliera tipica di settembre in Appennino, in mm.'),
    lambdaWindCoeff: calibrate(0.15),
    lambdaWindRef: calibrate(3.0),
    canopyShelter: calibrate(0.8, 'Sotto chioma densa l\'evaporazione e\' ridotta.'),
    southFacingPenalty: calibrate(1.25, 'I versanti a sud asciugano prima.'),
    referenceMm: calibrate(
      55,
      'Acqua efficace che corrisponde al punteggio idrico pieno su suolo gia\' umido. ' +
        'Non e\' una soglia di pioggia: il fabbisogno cresce col deficit iniziale, quindi su ' +
        'terreno secco ne servono un centinaio.',
    ),
    shapeExponent: calibrate(
      1.5,
      'Scelto per mantenere la scala discriminante in basso senza mai azzerarla. Con la ' +
        'sottrazione secca che avevo scritto prima, cinque zone su sette davano esattamente 0.0 ' +
        'il 17 settembre 2026 e diventavano indistinguibili fra loro: e\' lo stesso salto ' +
        'binario che rimprovero al modello baseline.',
    ),
    maxInitialDeficitMm: calibrate(
      45,
      'Quanto in piu\' serve quando il terreno parte secco. E\' il meccanismo che rende la ' +
        'soglia funzione dell\'umidita\' di partenza invece che un numero fisso.',
    ),
    wetSoilThreshold: calibrate(0.32, 'm3/m3 sopra cui il suolo e\' gia\' carico.'),
    drySoilThreshold: calibrate(0.14, 'm3/m3 sotto cui il suolo e\' molto secco.'),
    cap: sourced(
      1.15,
      REFERENCES.brejon2026,
      'La precipitazione ha effetto lineare senza soglia superiore identificata. Il tetto sopra ' +
        '1 riflette che piu\' pioggia continua ad aiutare, con rendimento decrescente.',
    ),
  },

  thermal: {
    airWindowDays: sourced(
      20,
      REFERENCES.brejon2026,
      'Finestra selezionata per AIC. La temperatura e\' il predittore a breve termine principale.',
    ),
    optAutumnC: sourced(
      13,
      REFERENCES.brejon2026,
      'Ottimo della relazione quadratica, stabile entro 0.6 gradi fra tre modelli. Fruttificazione ' +
        'concentrata fra 10 e 15 gradi di media a 20 giorni, quasi assente fra 5 e 10.',
    ),
    optSummerC: calibrate(
      19,
      'Regime estivo di bassa quota. NESSUNA FONTE: lo studio disponibile riguarda la faggeta ' +
        'autunnale d\'Europa centrale, e trasferirne i parametri alle cerrete toscane di giugno ' +
        'sarebbe l\'errore peggiore possibile. Da calibrare col diario uscite.',
    ),
    sigmaC: calibrate(
      4.2,
      'Scelta perche\' riproduce la zona di fruttificazione osservata, 10-15 gradi, come ' +
        'intervallo entro cui il fattore resta sopra 0.75.',
    ),
    soilWindowDays: calibrate(7),
    soilOptC: calibrate(14, 'Leggermente sopra l\'ottimo dell\'aria: il suolo e\' piu\' inerte.'),
    soilSigmaC: calibrate(5),
    soilWeight: calibrate(
      0.35,
      'La temperatura del suolo e\' modellata, non osservata: pesa meno di quella dell\'aria, ' +
        'che sulle zone di taratura viene da stazioni reali.',
    ),
  },

  phenology: {
    summerPeakDay: calibrate(200, 'Circa il 19 luglio.'),
    summerSigmaDays: calibrate(35),
    autumnPeakDay: calibrate(288, 'Circa il 15 ottobre.'),
    autumnSigmaDays: calibrate(30),
    lowElevationM: calibrate(500),
    highElevationM: calibrate(1100),
    floor: calibrate(
      0.05,
      'Fuori stagione il potenziale non e\' esattamente zero: un modello che azzera nasconde ' +
        'le annate anomale, che sono proprio quelle interessanti.',
    ),
    anomalyWeight: calibrate(
      0.2,
      'L\'anomalia rispetto alla normale della cella modula, non sostituisce il bilancio idrico, ' +
        'che gia\' cattura gran parte dell\'effetto tramite il deficit iniziale.',
    ),
  },

  penalties: {
    frost: {
      threshold: calibrate(-1, 'Minima sotto cui la gelata inizia a pesare, in gradi.'),
      floor: calibrate(
        0.25,
        'Una gelata riduce fortemente ma non annulla: danneggia i carpofori esistenti piu\' di ' +
          'quanto azzeri il potenziale del micelio.',
      ),
      weight: calibrate(1),
    },
    heat: {
      threshold: calibrate(30, 'Massime sopra cui si conta lo stress da caldo.'),
      floor: calibrate(0.5),
      weight: calibrate(1),
    },
    vpd: {
      threshold: calibrate(1.6, 'Deficit di pressione di vapore medio a 7 giorni, in kPa.'),
      floor: calibrate(0.7),
      weight: calibrate(1),
    },
    wind: {
      threshold: calibrate(6, 'Vento medio a 7 giorni, in m/s.'),
      floor: calibrate(0.8),
      weight: calibrate(1),
    },
    thermalShock: {
      threshold: calibrate(5, 'Calo termico in gradi su tre giorni, seguito da stabilizzazione.'),
      floor: calibrate(1),
      weight: calibrate(
        0,
        'DISATTIVATA. La specifica di progetto indica lo shock termico come il fattore piu\' ' +
          'discriminante sul porcino autunnale, ma non ho trovato supporto di campo: non compare ' +
          'fra i predittori testati negli studi consultati, e le prove sperimentali riguardano ' +
          'saprotrofi coltivati. Viene calcolata e registrata a peso zero, cosi\' quando il ' +
          'diario avra\' abbastanza uscite il confronto sara\' gia\' possibile senza ricalcolare ' +
          'il passato.',
      ),
    },
  },

  confidence: {
    distanceScaleKm: {
      // La pioggia decorrela molto piu' in fretta della temperatura: un temporale e' locale,
      // un'ondata di calore no.
      precipitation: calibrate(12),
      temperature_max: calibrate(30),
      temperature_min: calibrate(25),
      temperature_mean: calibrate(30),
      relative_humidity_mean: calibrate(20),
      wind_speed_mean: calibrate(15),
      default: calibrate(20),
    },
    elevationScaleM: calibrate(
      250,
      'E\' il parametro che distingue una stazione vicina ma in fondovalle da una piu\' lontana ' +
        'e climaticamente simile.',
    ),
    densitySaturation: calibrate(4),
    horizonScaleDays: calibrate(9),
    provenanceQuality: {
      OBSERVED: calibrate(1),
      REANALYSIS: calibrate(0.85),
      MODELLED: calibrate(0.7),
      FORECAST: calibrate(0.6),
    },
  },
}

/** Tutti i parametri da calibrare, per mostrarli come tali nel pannello admin. */
export function uncalibratedParams(config: AlgorithmConfig = ALGORITHM_V1): string[] {
  const out: string[] = []
  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== 'object') return
    if (isParam(node)) {
      if (node.provenance === 'calibrate') out.push(path)
      return
    }
    for (const [key, child] of Object.entries(node)) {
      walk(child, path === '' ? key : `${path}.${key}`)
    }
  }
  walk(config, '')
  return out
}

function isParam(node: object): node is Param {
  return 'value' in node && 'provenance' in node
}
