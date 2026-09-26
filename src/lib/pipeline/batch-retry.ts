/**
 * Lotti Open-Meteo con un secondo giro per quelli falliti.
 *
 * **Perche' esiste.** Il 26/09/2026 la corsa delle 11:40 ha perso tre regioni per due guasti che
 * un minuto dopo non c'erano piu':
 *
 * - la Toscana completa: Open-Meteo ha troncato a meta' due risposte enormi («Unexpected error
 *   while streaming data: timeoutReached»), 0 zone su 219, e resta il file di ieri;
 * - Abruzzo e Basilicata: il primo lotto nazionale e' partito tre secondi dopo la Toscana e ha
 *   preso HTTP 429 «Minutely API request limit exceeded».
 *
 * I tentativi di `fetchJson` non bastano per nessuno dei due: ritentano dopo 1 e 2 secondi, e il
 * limite al minuto si libera solo dopo un minuto, mentre un server sotto carico ha bisogno di
 * respiro. Qui i lotti falliti si rimettono in coda e si riprovano **una volta**, dopo una pausa,
 * quando tutti gli altri sono finiti. Una volta sola: un guasto che dura oltre la pausa non e'
 * transitorio, e insistere costerebbe quota del giorno dopo per niente.
 */

export interface BatchFailure<T> {
  readonly index: number
  readonly chunk: T
  readonly error: unknown
}

/** Pausa prima del secondo giro: poco oltre il minuto, la finestra piu' corta di Open-Meteo. */
export const RETRY_DELAY_MS = 65_000

export interface RunBatchesOptions {
  /** Pausa prima del secondo giro; `RETRY_DELAY_MS` se manca. */
  readonly retryDelayMs?: number
  /**
   * Errori che fermano tutto, senza secondo giro: il budget del giorno finito. I lotti rimasti
   * fallirebbero allo stesso modo, e riprovarli vorrebbe dire solo aspettare per niente.
   */
  readonly isFatal?: (error: unknown) => boolean
  readonly wait?: (ms: number) => Promise<void>
  /** Avvisato prima del secondo giro, con il numero di lotti da riprovare e la pausa. */
  readonly onRetry?: (count: number, delayMs: number) => void
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Esegue `run` su ogni lotto, in ordine; i falliti si riprovano una volta alla fine.
 *
 * Restituisce i lotti persi anche dopo il secondo giro, con l'ultimo errore di ciascuno. `run`
 * riceve il numero del tentativo, 1 o 2, per i messaggi.
 */
export async function runBatches<T>(
  chunks: readonly T[],
  run: (chunk: T, index: number, attempt: 1 | 2) => Promise<void>,
  options: RunBatchesOptions,
): Promise<BatchFailure<T>[]> {
  const isFatal = options.isFatal ?? (() => false)
  const wait = options.wait ?? sleep
  const retry: BatchFailure<T>[] = []

  const lostFrom = (list: readonly { index: number; chunk: T }[], error: unknown): BatchFailure<T>[] =>
    list.map(({ index, chunk }) => ({ index, chunk, error }))

  for (const [index, chunk] of chunks.entries()) {
    try {
      await run(chunk, index, 1)
    } catch (error) {
      if (isFatal(error)) {
        const rest = chunks.slice(index).map((c, k) => ({ index: index + k, chunk: c }))
        return [...retry, ...lostFrom(rest, error)].sort((a, b) => a.index - b.index)
      }
      retry.push({ index, chunk, error })
    }
  }

  if (retry.length === 0) return []
  const delayMs = options.retryDelayMs ?? RETRY_DELAY_MS
  options.onRetry?.(retry.length, delayMs)
  await wait(delayMs)

  const failures: BatchFailure<T>[] = []
  for (const [k, item] of retry.entries()) {
    try {
      await run(item.chunk, item.index, 2)
    } catch (error) {
      if (isFatal(error)) {
        failures.push(...lostFrom(retry.slice(k), error))
        break
      }
      failures.push({ index: item.index, chunk: item.chunk, error })
    }
  }
  return failures
}
