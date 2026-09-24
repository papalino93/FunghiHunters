/**
 * Generatore pseudo-casuale con seme, per il backtest.
 *
 * `Math.random` non si puo' seminare: due corse dello stesso backtest sceglierebbero date di
 * controllo diverse, e una differenza di AUC fra due versioni del modello potrebbe venire dal
 * sorteggio invece che dal modello. Con il seme, la stessa riga di comando produce le stesse
 * date, e chi rilegge i risultati puo' rifarli identici.
 *
 * Mulberry32: 32 bit di stato, periodo 2^32, piu' che sufficiente per qualche migliaio di
 * estrazioni. Non e' crittografico e non deve esserlo.
 */

export type Rng = () => number

/** Restituisce una funzione che produce numeri uniformi in [0, 1). */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** Intero uniforme in [min, max], estremi inclusi. */
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

/** Copia mescolata (Fisher-Yates): l'originale non si tocca. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const a = out[i] as T
    out[i] = out[j] as T
    out[j] = a
  }
  return out
}
