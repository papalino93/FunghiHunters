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

/** Esegue una GET con timeout e retry, restituendo il corpo come testo. */
export async function fetchText(url: string, options: HttpOptions = {}): Promise<string> {
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
        return await response.text()
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

/** Come `fetchText`, ma con il parsing JSON e un errore leggibile se il corpo non e' JSON. */
export async function fetchJson<T = unknown>(url: string, options: HttpOptions = {}): Promise<T> {
  const text = await fetchText(url, options)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Risposta non JSON da ${url}: ${text.slice(0, 200)}`)
  }
}
