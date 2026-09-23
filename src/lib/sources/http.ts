/**
 * Client HTTP per l'ingestione: timeout, retry con backoff, e un budget di chiamate.
 *
 * Il budget non e' burocrazia. Il piano gratuito di Open-Meteo consente 10.000 chiamate
 * **pesate** al giorno, dove il peso cresce con il numero di variabili, di giorni e di localita'.
 * Superarlo non produce un errore chiaro ma un degrado, e il backfill ERA5 e' proprio il job che
 * rischia di bruciare il budget in un burst. Meglio contare noi.
 */

export interface HttpOptions {
  /** Millisecondi prima di abortire la singola richiesta. */
  readonly timeoutMs?: number
  /** Numero di tentativi totali, incluso il primo. */
  readonly attempts?: number
  /** Ritardo iniziale del backoff, raddoppiato a ogni tentativo. */
  readonly backoffMs?: number
  /** Header aggiuntivi. */
  readonly headers?: Readonly<Record<string, string>>
  readonly signal?: AbortSignal
}

const DEFAULTS = {
  timeoutMs: 60_000,
  attempts: 3,
  backoffMs: 1_000,
} as const

/**
 * Identifica la nostra applicazione verso le fonti pubbliche.
 * E' cortesia di base e rende riconoscibile il nostro traffico se qualcuno lo deve diagnosticare.
 */
export const USER_AGENT = 'FungiCast-Toscana/0.1 (+https://github.com/papalino93/FunghiHunters)'

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly bodySnippet: string,
  ) {
    super(`HTTP ${status} su ${url}: ${bodySnippet.slice(0, 200)}`)
    this.name = 'HttpError'
  }
}

/** Gli status su cui ritentare: errori transitori e limitazioni di rate. */
function isRetryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Contatore di peso delle chiamate, per non superare silenziosamente i limiti di una fonte.
 * Il peso e' deciso da chi chiama, perche' dipende dalla semantica dell'endpoint.
 */
export class CallBudget {
  private spent = 0

  constructor(
    readonly label: string,
    readonly limit: number,
  ) {}

  get remaining(): number {
    return Math.max(0, this.limit - this.spent)
  }

  get used(): number {
    return this.spent
  }

  /** Registra una spesa. Lancia se sfonderebbe il budget: meglio fermarsi che degradare. */
  spend(weight: number): void {
    if (this.spent + weight > this.limit) {
      throw new Error(
        `Budget "${this.label}" esaurito: ${this.spent.toFixed(1)}/${this.limit} usati, ` +
          `richiesti altri ${weight.toFixed(1)}. Il job va spezzato su piu' esecuzioni.`,
      )
    }
    this.spent += weight
  }

  /** `true` se c'e' ancora spazio per una spesa di questo peso. */
  canAfford(weight: number): boolean {
    return this.spent + weight <= this.limit
  }
}

/**
 * Il corpo e' arrivato con uno status 2xx ma non e' JSON.
 *
 * Classe a parte, e ritentabile, per un caso misurato e non teorico: Open-Meteo sotto carico
 * risponde a volte **200** con una pagina di testo/HTML ("timeoutReached") al posto del JSON. Lo
 * status dice "tutto bene", il corpo dice il contrario, ed e' transitorio quanto un 503: la corsa
 * GitHub Actions 35805664027 e' morta cosi', al primo tentativo, perche' il parsing stava fuori dal
 * ciclo dei retry e un corpo illeggibile non veniva mai richiesto una seconda volta.
 */
export class NonJsonResponseError extends Error {
  constructor(
    readonly url: string,
    readonly bodySnippet: string,
  ) {
    super(`Risposta non JSON da ${url}: ${bodySnippet.slice(0, 200)}`)
    this.name = 'NonJsonResponseError'
  }
}

/**
 * Il ciclo di tentativi condiviso da `fetchText` e `fetchJson`.
 *
 * `read` trasforma il corpo *dentro* il ciclo: se lancia, il tentativo conta come fallito e si
 * ritenta con lo stesso backoff di un errore di rete. E' l'unico modo perche' "200 ma corpo
 * sbagliato" riceva lo stesso trattamento di "503": dall'esterno sono lo stesso guasto transitorio.
 */
async function requestWithRetry<T>(
  url: string,
  options: HttpOptions,
  read: (text: string) => T,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs
  const attempts = options.attempts ?? DEFAULTS.attempts
  const backoffMs = options.backoffMs ?? DEFAULTS.backoffMs

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
    }, timeoutMs)
    const onOuterAbort = (): void => {
      controller.abort()
    }
    options.signal?.addEventListener('abort', onOuterAbort)

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, ...options.headers },
      })

      if (!response.ok) {
        const snippet = await response.text().catch(() => '')
        const error = new HttpError(url, response.status, snippet)
        if (!isRetryable(response.status) || attempt === attempts) throw error
        lastError = error
      } else {
        return read(await response.text())
      }
    } catch (error) {
      if (error instanceof HttpError && !isRetryable(error.status)) throw error
      lastError = error
      if (attempt === attempts) break
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onOuterAbort)
    }

    await sleep(backoffMs * 2 ** (attempt - 1))
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Richiesta fallita dopo ${attempts} tentativi: ${url}`)
}

/** Esegue una GET con timeout e retry, restituendo il corpo come testo. */
export async function fetchText(url: string, options: HttpOptions = {}): Promise<string> {
  return requestWithRetry(url, options, (text) => text)
}

/**
 * Come `fetchText`, ma con il parsing JSON e un errore leggibile se il corpo non e' JSON.
 *
 * Un corpo non JSON si ritenta come un errore transitorio (vedi `NonJsonResponseError`): solo
 * dopo l'ultimo tentativo arriva a chi chiama.
 */
export async function fetchJson<T = unknown>(url: string, options: HttpOptions = {}): Promise<T> {
  return requestWithRetry(url, options, (text) => {
    try {
      return JSON.parse(text) as T
    } catch {
      throw new NonJsonResponseError(url, text)
    }
  })
}
