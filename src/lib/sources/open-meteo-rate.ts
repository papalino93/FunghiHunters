/**
 * Stimatore di attesa per i limiti di frequenza del piano gratuito di Open-Meteo.
 *
 * **Perche' esiste.** `CallBudget` in `http.ts` conta quanto si e' speso e si ferma quando il
 * totale e' esaurito. Non basta: i limiti di Open-Meteo non sono solo un totale giornaliero ma
 * tre finestre scorrevoli (minuto, ora, giorno), e sfondare quella del minuto non degrada, fa
 * fallire la richiesta con HTTP 429. E' successo davvero il 21/09/2026 al primo tentativo di
 * generare il catalogo nazionale: 600 quote risolte, poi 429 con
 * `"Minutely API request limit exceeded"`. Quella corsa ha anche **misurato** il peso dell'API
 * elevazione, che la documentazione non dichiara: 6 richieste da 100 coordinate hanno esaurito
 * esattamente il minuto, quindi ogni localita' pesa 1, e il multi-localita' non e' uno sconto.
 *
 * Quindi qui non si conta soltanto: si **aspetta**. Chi chiama dichiara il peso, `reserve`
 * restituisce il controllo solo quando quel peso entra in tutte e tre le finestre.
 *
 * Il tempo e l'attesa sono iniettabili apposta: un test che dovesse davvero dormire un'ora per
 * verificare la finestra oraria non verrebbe mai scritto, e la logica resterebbe non verificata.
 */

/** I tre limiti dichiarati dal piano non commerciale, in chiamate pesate. */
export interface RateLimits {
  readonly perMinute: number
  readonly perHour: number
  readonly perDay: number
}

export const OPEN_METEO_FREE_LIMITS: RateLimits = {
  perMinute: 600,
  perHour: 5_000,
  perDay: 10_000,
}

/**
 * Lanciata quando l'attesa necessaria supera quella accettabile.
 *
 * E' un errore distinto da un guasto di rete perche' va trattato diversamente: il job non e'
 * rotto, e' arrivato al suo limite. Chi chiama puo' fermarsi lasciando intatto il dato di ieri
 * invece di ritentare.
 */
export class RateBudgetExhausted extends Error {
  constructor(
    readonly waitMs: number,
    readonly maxWaitMs: number,
  ) {
    super(
      `Per rispettare i limiti di Open-Meteo servirebbero ${Math.round(waitMs / 1000)} s di ` +
        `attesa, oltre il massimo accettato di ${Math.round(maxWaitMs / 1000)} s. ` +
        'Il lavoro va diviso su piu\' esecuzioni o ridotto il numero di localita\'.',
    )
    this.name = 'RateBudgetExhausted'
  }
}

interface Spend {
  readonly at: number
  readonly weight: number
}

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export interface RatePacerOptions {
  readonly limits?: RateLimits
  /** Attesa massima accettata per una singola prenotazione. Oltre, si lancia. */
  readonly maxWaitMs?: number
  readonly now?: () => number
  readonly wait?: (ms: number) => Promise<void>
}

export class RatePacer {
  private readonly spends: Spend[] = []
  private readonly limits: RateLimits
  private readonly maxWaitMs: number
  private readonly now: () => number
  private readonly wait: (ms: number) => Promise<void>

  constructor(options: RatePacerOptions = {}) {
    this.limits = options.limits ?? OPEN_METEO_FREE_LIMITS
    this.maxWaitMs = options.maxWaitMs ?? 20 * MINUTE_MS
    this.now = options.now ?? Date.now
    this.wait = options.wait ?? sleep
  }

  /** Peso gia' speso e ancora dentro la finestra giornaliera. */
  get used(): number {
    const floor = this.now() - DAY_MS
    return this.spends.reduce((total, spend) => (spend.at > floor ? total + spend.weight : total), 0)
  }

  /**
   * Millisecondi da aspettare perche' `weight` entri in tutte e tre le finestre. 0 se entra subito.
   *
   * Un peso che da solo supera un limite non entrera' mai, per quanto si aspetti: e' un errore di
   * dimensionamento del lotto da parte di chi chiama, e va detto subito invece di dormire.
   */
  waitMsFor(weight: number): number {
    if (weight > this.limits.perMinute) {
      throw new Error(
        `Un solo lotto pesa ${weight.toFixed(1)}, oltre il limite al minuto di ` +
          `${this.limits.perMinute}: va spezzato in lotti piu' piccoli.`,
      )
    }
    const now = this.now()
    return Math.max(
      this.windowWait(MINUTE_MS, this.limits.perMinute, weight, now),
      this.windowWait(HOUR_MS, this.limits.perHour, weight, now),
      this.windowWait(DAY_MS, this.limits.perDay, weight, now),
    )
  }

  /** Aspetta il necessario, poi registra la spesa. Restituisce i millisecondi attesi. */
  async reserve(weight: number): Promise<number> {
    const waitMs = this.waitMsFor(weight)
    if (waitMs > this.maxWaitMs) throw new RateBudgetExhausted(waitMs, this.maxWaitMs)
    if (waitMs > 0) await this.wait(waitMs)
    this.prune()
    this.spends.push({ at: this.now(), weight })
    return waitMs
  }

  private windowWait(windowMs: number, limit: number, weight: number, now: number): number {
    const floor = now - windowMs
    const inWindow = this.spends.filter((spend) => spend.at > floor)
    let total = inWindow.reduce((sum, spend) => sum + spend.weight, 0)
    if (total + weight <= limit) return 0

    // Le spese sono in ordine di tempo: si "lasciano cadere" le piu' vecchie una alla volta
    // e si guarda quando la finestra le avra' davvero perse.
    let waitMs = 0
    for (const spend of inWindow) {
      total -= spend.weight
      waitMs = spend.at + windowMs - now
      if (total + weight <= limit) break
    }
    return Math.max(0, waitMs)
  }

  private prune(): void {
    const floor = this.now() - DAY_MS
    while (this.spends.length > 0 && (this.spends[0]?.at ?? 0) <= floor) this.spends.shift()
  }
}
