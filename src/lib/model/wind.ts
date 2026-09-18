/**
 * Vento: tre livelli separati, mai un unico numero.
 *
 * 1. **Effetto idrico** — non qui: e' gia' dentro ET0 (Penman-Monteith FAO-56 usa il vento come
 *    input diretto), che `src/lib/model/water.ts` consuma tramite `lambdaEt0Coeff`. Il vento non
 *    ha un secondo canale separato nel bilancio idrico — vedi `lambdaWindCoeff` (disattivato) in
 *    `config/algorithm.ts` per il dettaglio di cosa e' stato tolto e perche'.
 * 2. **Effetto microclimatico** — non modellato. Una misura a 10 m in campo aperto non e' il
 *    vento sotto chioma, ma non esiste una fonte o un modello validato per correggerlo: vedi
 *    `microclimateUncertainty()`, che dichiara il limite invece di inventare una correzione.
 * 3. **Sicurezza e praticabilita'** — qui. Due domande diverse rispondono a due funzioni diverse:
 *    `describeWaterWind()` (asciugamento recente, informativo, non abbassa mai il potenziale) e
 *    `describeOutingWind()` (vento previsto per il giorno dell'uscita, prudenza).
 *
 * Nessuna di queste tre funzioni tocca l'MPI. E' deliberato: mescolare "le condizioni ambientali
 * sono compatibili" con "e' prudente uscire oggi" nello stesso numero toglie all'utente la
 * possibilita' di distinguere "aspetto" da "vado ma con attenzione".
 */

export type WindSafetyLevel = 'calma' | 'teso' | 'forte' | 'dati-insufficienti'

export interface WindAssessment {
  readonly level: WindSafetyLevel
  /** Frase pronta per l'utente, mai assoluta ("impedisce", "garantisce"). */
  readonly message: string
  readonly dataQuality: 'sufficient' | 'insufficient'
}

/**
 * Soglie di riferimento: scala di Beaufort dell'Organizzazione Meteorologica Mondiale, non un
 * numero scelto da noi. Non sono calibrate sul porcino — nessuno studio reperito lega una soglia
 * di vento specifica alla fruttificazione o alla sicurezza in bosco — quindi restano un punto di
 * partenza dichiaratamente generico, non una soglia validata.
 *
 *   TESO_MS   = 8  m/s -> inizio Beaufort 5 ("vento teso")
 *   FORTE_MS  = 14 m/s -> inizio Beaufort 7 ("vento forte")
 */
export const WIND_THRESHOLD_TESO_MS = 8
export const WIND_THRESHOLD_FORTE_MS = 14

function classify(ms: number): 'calma' | 'teso' | 'forte' {
  if (ms >= WIND_THRESHOLD_FORTE_MS) return 'forte'
  if (ms >= WIND_THRESHOLD_TESO_MS) return 'teso'
  return 'calma'
}

/**
 * Vento e asciugamento del suolo: legge le condizioni recenti (media dei massimi giornalieri,
 * 7 giorni), non per penalizzare — quello lo fa gia' ET0 — ma per spiegare all'utente perche' il
 * bilancio idrico e' quello che e', quando il vento ne fa parte della ragione.
 */
export function describeWaterWind(recentMaxMs: number | null): WindAssessment {
  if (recentMaxMs === null) {
    return {
      level: 'dati-insufficienti',
      message: 'Dati del vento insufficienti: il quadro sull\'asciugamento del suolo è meno completo.',
      dataQuality: 'insufficient',
    }
  }
  const level = classify(recentMaxMs)
  if (level === 'calma') {
    return {
      level,
      message: 'Vento debole nei giorni scorsi: nessun impatto aggiuntivo rilevante sul bilancio idrico.',
      dataQuality: 'sufficient',
    }
  }
  return {
    level,
    message:
      'Vento persistente negli ultimi giorni: contribuisce, insieme a temperatura e radiazione, ' +
      'a un\'evapotraspirazione più alta — effetto già incluso nel bilancio idrico qui sopra.',
    dataQuality: 'sufficient',
  }
}

/**
 * Vento previsto durante l'uscita: il giorno specifico scelto dall'utente, non la media della
 * settimana. È l'unica delle due funzioni pensata per la prudenza, non per il bilancio idrico.
 */
export function describeOutingWind(forecastMaxMs: number | null): WindAssessment {
  if (forecastMaxMs === null) {
    return {
      level: 'dati-insufficienti',
      message: 'Dati del vento insufficienti per il giorno scelto: valuta il bollettino prima di partire.',
      dataQuality: 'insufficient',
    }
  }
  const level = classify(forecastMaxMs)
  if (level === 'forte') {
    return {
      level,
      message:
        'Raffiche previste: le condizioni ambientali possono essere favorevoli, ma l\'uscita ' +
        'richiede prudenza — rischio di rami e piante instabili sotto vento forte.',
      dataQuality: 'sufficient',
    }
  }
  if (level === 'teso') {
    return {
      level,
      message: 'Vento moderato previsto: nessun impedimento, ma tieni conto delle raffiche in cresta o in radura.',
      dataQuality: 'sufficient',
    }
  }
  return { level, message: 'Vento debole previsto: nessun impatto rilevante sulla praticabilità.', dataQuality: 'sufficient' }
}

/**
 * Effetto microclimatico: dichiarato, non modellato. Vedi il commento in testa al file — nessuna
 * fonte valida oggi una correzione "vento sotto chioma" a partire da una misura a 10 m in campo
 * aperto, quindi la funzione si limita a dire onestamente se quella correzione manca.
 */
export function microclimateUncertainty(canopyDensity: number | null): string {
  if (canopyDensity === null) {
    return 'Copertura forestale non nota per questa cella: il vento resta quello misurato in campo aperto, non sotto chioma.'
  }
  return (
    `Copertura forestale ${Math.round(canopyDensity * 100)}%: riduce probabilmente il vento reale ` +
    'sotto chioma rispetto al dato misurato in campo aperto, ma non esiste un modello validato ' +
    'per quantificare di quanto — il dato resta quello a 10 m, non corretto.'
  )
}

// ============================================================================
// COMPONENTI U/V
// ============================================================================

/**
 * Da velocità/direzione a componenti U (est positivo) / V (nord positivo).
 *
 * Convenzione meteorologica: `directionFromDeg` è la direzione **da cui viene** il vento (0° =
 * da nord, 90° = da est), non verso cui soffia — è quella che ogni servizio meteo pubblica, e
 * usare l'altra convenzione senza dirlo è un errore classico e silenzioso.
 */
export interface WindVector {
  readonly u: number
  readonly v: number
}

export function toComponents(speedMs: number, directionFromDeg: number): WindVector {
  const rad = (directionFromDeg * Math.PI) / 180
  return {
    u: -speedMs * Math.sin(rad),
    v: -speedMs * Math.cos(rad),
  }
}

export interface WindPolar {
  readonly speedMs: number
  /** `null` quando la velocità è ~0: la direzione non è definita. */
  readonly directionFromDeg: number | null
}

export function fromComponents(vector: WindVector): WindPolar {
  const speedMs = Math.hypot(vector.u, vector.v)
  if (speedMs < 1e-9) return { speedMs: 0, directionFromDeg: null }
  const rad = Math.atan2(-vector.u, -vector.v)
  const deg = (rad * 180) / Math.PI
  return { speedMs, directionFromDeg: (deg + 360) % 360 }
}
