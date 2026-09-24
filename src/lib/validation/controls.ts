/**
 * Le date di controllo del disegno caso-controllo (Capinha et al. 2019, Int J Biometeorol
 * 63:1015): stessa localita', stesso anno, un giorno in cui **non** risulta una raccolta.
 *
 * Il controllo non e' "un giorno senza porcini" — GBIF e' solo presenza, nessuno registra
 * l'assenza — ma "un giorno qualunque della stagione, lontano da quelli in cui qualcuno li ha
 * trovati li'". Il modello che distingue i due meglio del calendario sta dicendo qualcosa sul
 * meteo; quello che non ci riesce, no.
 */

import { addDays, daysBetween } from '@/lib/domain/time'
import { type Rng, randomInt } from '@/lib/validation/rng'

export interface ControlOptions {
  /** Controlli per localita'-anno. */
  readonly perLocationYear: number
  /** Distanza minima, in giorni, da qualunque caso della localita' nello stesso anno. */
  readonly minGapDays: number
  /** Finestra delle date di controllo, mese-giorno inclusi. */
  readonly fromMonthDay: string
  readonly toMonthDay: string
  /** Tentativi prima di arrendersi: con casi fitti la finestra libera puo' non bastare. */
  readonly maxAttempts: number
}

export const DEFAULT_CONTROLS: ControlOptions = {
  perLocationYear: 3,
  minGapDays: 20,
  fromMonthDay: '06-01',
  toMonthDay: '11-30',
  maxAttempts: 500,
}

/**
 * Date di controllo per una localita'-anno, ordinate.
 *
 * Il numero di controlli puo' essere inferiore a quello richiesto se i casi coprono quasi tutta
 * la finestra: meglio un controllo in meno che uno a dieci giorni da un caso, che sarebbe un
 * "controllo" in piena buttata. Le date sono anche distinte fra loro.
 */
export function sampleControlDates(
  year: number,
  caseDates: readonly string[],
  rng: Rng,
  options: ControlOptions = DEFAULT_CONTROLS,
): string[] {
  const start = `${year}-${options.fromMonthDay}`
  const end = `${year}-${options.toMonthDay}`
  const span = daysBetween(start, end)
  const chosen = new Set<string>()
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    if (chosen.size >= options.perLocationYear) break
    const candidate = addDays(start, randomInt(rng, 0, span))
    if (chosen.has(candidate)) continue
    const farFromCases = caseDates.every(
      (c) => Math.abs(daysBetween(c, candidate)) >= options.minGapDays,
    )
    if (farFromCases) chosen.add(candidate)
  }
  return [...chosen].sort()
}
