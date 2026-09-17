/**
 * Calibrazione: il modello ci prende?
 *
 * Confronta il punteggio che il modello aveva previsto — congelato al momento dell'inserimento —
 * con l'esito che hai registrato. È l'unico modo per rispondere alla domanda che conta davvero:
 * **questo numero predice qualcosa?**
 *
 * Il metodo è volutamente modesto. Con poche uscite non si calibra nulla, e dichiararlo è più
 * utile di una regressione su otto punti che sembra scienza. Per questo ogni statistica porta il
 * numero di osservazioni su cui è calcolata, e sotto una soglia minima l'interfaccia dice che non
 * c'è ancora abbastanza e basta.
 */

import { ABUNDANCE_RANK, type Abundance, type DiaryEntry } from '@/lib/diary/types'

/** Sotto questo numero di uscite qualunque statistica è rumore. */
export const MIN_ENTRIES_FOR_SIGNAL = 12

export interface BandStat {
  /** Estremi del punteggio previsto. */
  readonly from: number
  readonly to: number
  readonly label: string
  readonly count: number
  /** Media del rango di abbondanza osservato, 0-4. */
  readonly meanRank: number
  /** Quota di uscite con almeno "pochi". */
  readonly successRate: number
}

export interface CalibrationReport {
  readonly total: number
  /** Uscite utilizzabili: quelle che hanno il punteggio congelato. */
  readonly usable: number
  readonly hasSignal: boolean
  readonly bands: readonly BandStat[]
  /**
   * Correlazione di rango fra punteggio previsto ed esito osservato (Spearman).
   * `null` quando i dati non bastano o non c'è variabilità.
   */
  readonly rankCorrelation: number | null
  /** Frase leggibile su cosa dicono i dati finora. */
  readonly verdict: string
}

const BANDS: ReadonlyArray<{ from: number; to: number; label: string }> = [
  { from: 0, to: 20, label: 'sfavorevoli' },
  { from: 20, to: 40, label: 'poco favorevoli' },
  { from: 40, to: 60, label: 'discrete' },
  { from: 60, to: 80, label: 'favorevoli' },
  { from: 80, to: 101, label: 'molto favorevoli' },
]

function rankOf(abundance: Abundance): number {
  return ABUNDANCE_RANK[abundance]
}

/**
 * Correlazione di rango di Spearman.
 * Di rango e non di Pearson perché l'abbondanza è un ordinamento — "molti" non è il doppio di
 * "discreti" — e trattarla come una misura darebbe alla correlazione una precisione inventata.
 */
export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null

  const rank = (values: readonly number[]): number[] => {
    const indexed = values.map((value, index) => ({ value, index }))
    indexed.sort((a, b) => a.value - b.value)
    const ranks = new Array<number>(values.length).fill(0)
    let i = 0
    while (i < indexed.length) {
      // I pari merito prendono il rango medio, altrimenti l'ordine di inserimento
      // influenzerebbe il risultato.
      let j = i
      while (j + 1 < indexed.length && indexed[j + 1]?.value === indexed[i]?.value) j += 1
      const average = (i + j) / 2 + 1
      for (let k = i; k <= j; k += 1) {
        const entry = indexed[k]
        if (entry !== undefined) ranks[entry.index] = average
      }
      i = j + 1
    }
    return ranks
  }

  const rx = rank(xs)
  const ry = rank(ys)
  const n = xs.length
  const mean = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / n

  const mx = mean(rx)
  const my = mean(ry)
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i += 1) {
    const a = (rx[i] ?? 0) - mx
    const b = (ry[i] ?? 0) - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

export function calibrate(entries: readonly DiaryEntry[]): CalibrationReport {
  const usable = entries.filter(
    (e): e is DiaryEntry & { mpiAtEntry: number } => e.mpiAtEntry !== null,
  )

  const bands: BandStat[] = BANDS.map((band) => {
    const inBand = usable.filter((e) => e.mpiAtEntry >= band.from && e.mpiAtEntry < band.to)
    const ranks = inBand.map((e) => rankOf(e.abundance))
    return {
      ...band,
      count: inBand.length,
      meanRank: ranks.length === 0 ? 0 : ranks.reduce((a, b) => a + b, 0) / ranks.length,
      successRate:
        inBand.length === 0 ? 0 : inBand.filter((e) => rankOf(e.abundance) > 0).length / inBand.length,
    }
  })

  const correlation = spearman(
    usable.map((e) => e.mpiAtEntry),
    usable.map((e) => rankOf(e.abundance)),
  )

  const hasSignal = usable.length >= MIN_ENTRIES_FOR_SIGNAL

  return {
    total: entries.length,
    usable: usable.length,
    hasSignal,
    bands,
    rankCorrelation: correlation,
    verdict: verdictFor(usable.length, correlation, hasSignal),
  }
}

function verdictFor(usable: number, correlation: number | null, hasSignal: boolean): string {
  if (usable === 0) {
    return 'Nessuna uscita registrata: il modello non ha ancora nulla con cui confrontarsi.'
  }
  if (!hasSignal) {
    const missing = MIN_ENTRIES_FOR_SIGNAL - usable
    return (
      `${usable} ${usable === 1 ? 'uscita registrata' : 'uscite registrate'}. ` +
      `Ne servono almeno ${MIN_ENTRIES_FOR_SIGNAL} perché il confronto dica qualcosa: ` +
      `ne mancano ${missing}. Fino ad allora qui trovi solo il registro, non un giudizio.`
    )
  }
  if (correlation === null) {
    return `${usable} uscite, ma tutte con lo stesso esito o lo stesso punteggio: non si può ancora misurare una relazione.`
  }
  if (correlation >= 0.5) {
    return `Su ${usable} uscite il punteggio previsto ordina bene gli esiti reali (correlazione di rango ${correlation.toFixed(2)}). È un segnale incoraggiante, non una prova.`
  }
  if (correlation >= 0.2) {
    return `Su ${usable} uscite si intravede una relazione debole fra punteggio ed esito (${correlation.toFixed(2)}). Serve altro materiale prima di fidarsi.`
  }
  if (correlation > -0.2) {
    return `Su ${usable} uscite il punteggio non mostra relazione con l'esito (${correlation.toFixed(2)}). Se il quadro resta questo, il modello va rivisto.`
  }
  return `Su ${usable} uscite la relazione è invertita (${correlation.toFixed(2)}): il modello sta sbagliando sistematicamente e va ricalibrato.`
}
