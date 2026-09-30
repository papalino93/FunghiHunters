/**
 * Un limite di richieste a finestra scorrevole, in memoria. **Solo server.**
 *
 * Per `/api/luoghi`, che gira le ricerche a Photon: il servizio è gratuito e chiede un uso
 * ragionevole, e un solo client impazzito (o un robot) non deve farlo bloccare per tutti. La
 * memoria è quella di un'istanza della funzione: non è un limite esatto su tutto Vercel, è un
 * freno contro le raffiche, che è quello che serve. Le ricerche ripetute, poi, le serve la CDN
 * senza arrivare fin qui.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    /** Oltre questo numero di chiavi si ripulisce: la mappa non cresce senza fine. */
    private readonly maxKeys = 5_000,
  ) {}

  /** `true` se la richiesta passa (e viene contata), `false` se è oltre il limite. */
  allow(key: string, now: number = Date.now()): boolean {
    const since = now - this.windowMs
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since)
    if (recent.length >= this.limit) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > this.maxKeys) this.prune(since)
    return true
  }

  private prune(since: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((t) => t <= since)) this.hits.delete(key)
    }
  }
}

/** L'indirizzo del chiamante dietro il proxy di Vercel: il primo di `x-forwarded-for`. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  return first !== undefined && first !== '' ? first : 'sconosciuto'
}
