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
  /**
   * Uscite utilizzabili che hanno anche la durata della ricerca: solo per queste uno "zero" è
   * interpretabile — senza sapere quanto si è cercato, un esito nullo può voler dire "non c'era
   * niente" o "sono state cinque minuti distratti", e sono due informazioni diverse.
   */
  readonly contextual: number
  readonly hasSignal: boolean
  readonly bands: readonly BandStat[]
  /**
   * Correlazione di rango fra punteggio previsto ed esito osservato (Spearman).
   * `null` quando i dati non bastano o non c'è variabilità.
   */
  readonly rankCorrelation: number | null
  /** Frase leggibile su cosa dicono i dati finora. */
  readonly verdict: string

  readonly brier: BrierReport
  readonly classification: ClassificationReport
  /** `null` sotto la soglia minima per dividere il campione in due metà temporali. */
  readonly temporalSplit: { readonly earlier: SplitStat; readonly later: SplitStat } | null
  /** Una riga per zona che compare nel diario, anche con pochissime uscite. */
  readonly geographicSplit: readonly SplitStat[]
  /** Non nullo se troppe uscite vengono dalla stessa zona per generalizzare. */
  readonly geographicWarning: string | null
  readonly byAlgorithmVersion: readonly SplitStat[]
  /**
   * Non nullo quando esistono uscite senza niente trovato e senza durata registrata: quegli zeri
   * non si possono distinguere da una ricerca lunga e vuota o da una capatina di cinque minuti.
   * Un avviso di qualità del dato, non una statistica — compare a prescindere dalla soglia minima.
   */
  readonly shortSearchCaveat: string | null
  /**
   * Direzione dell'errore sistematico, solo quando il campione basta a dirla (`hasSignal`):
   * confronta la probabilità media che il modello assegna (`mpiAtEntry / 100`) con il tasso di
   * successo osservato davvero. `null` sotto soglia — non una mancanza di segnale, ma la stessa
   * cautela di ogni altra statistica qui: con poche uscite la direzione può ribaltarsi da sola.
   */
  readonly biasDirection: 'sovrastima' | 'sottostima' | 'nessuna' | null
}

/** Soglia sotto cui una metà di uno split (temporale, geografico, di versione) non dice nulla. */
export const MIN_ENTRIES_FOR_SPLIT = 6

/**
 * Soglia di punteggio da cui in su il verdetto testuale (`src/lib/recommend/verdict.ts`,
 * `toneFor`) inizia a dire "ci sta andare" invece di "si può tentare". Duplicata qui invece che
 * importata per non far dipendere il modulo di calibrazione da quello di raccomandazione — sono
 * due cose diverse (uno guarda al passato, l'altro consiglia il futuro) che non devono avere un
 * ciclo di dipendenza fra loro. Se cambia lì, deve cambiare anche qui: c'è un test che lo verifica.
 */
export const RECOMMENDATION_THRESHOLD = 40

export interface BrierReport {
  /** Media di (previsto/100 − esito)², esito = 1 se trovato qualcosa. `null` senza dati. */
  readonly modelScore: number | null
  /**
   * Stesso punteggio per una previsione costante, pari al tasso di successo osservato — il
   * confronto "senza modello" richiesto esplicitamente. Più basso è meglio, come per il modello.
   */
  readonly baselineScore: number | null
  /** 1 − modello/baseline. Positivo: il modello batte il non-modello. Negativo: lo peggiora. */
  readonly skillScore: number | null
  readonly baseRate: number | null
}

export interface ClassificationReport {
  readonly threshold: number
  readonly truePositive: number
  readonly falsePositive: number
  readonly trueNegative: number
  readonly falseNegative: number
  readonly precision: number | null
  readonly recall: number | null
  /** Quota di uscite consigliate (punteggio sopra soglia) che non hanno dato nulla. */
  readonly falseRecommendationRate: number | null
}

export interface SplitStat {
  readonly label: string
  readonly count: number
  readonly hasSignal: boolean
  readonly rankCorrelation: number | null
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

function isSuccess(entry: DiaryEntry): boolean {
  return rankOf(entry.abundance) > 0
}

function splitStat(label: string, entries: readonly (DiaryEntry & { mpiAtEntry: number })[]): SplitStat {
  const correlation = spearman(entries.map((e) => e.mpiAtEntry), entries.map((e) => rankOf(e.abundance)))
  return {
    label,
    count: entries.length,
    hasSignal: entries.length >= MIN_ENTRIES_FOR_SPLIT,
    rankCorrelation: correlation,
  }
}

/**
 * Brier score: media di (previsto − osservato)². Tratta `mpiAtEntry / 100` come la probabilità
 * che il modello assegna a "trovi qualcosa" — coerente con cosa l'MPI dichiara di essere, un
 * indice di compatibilità, non una cifra a caso.
 *
 * Il confronto che conta non è il numero da solo, ma contro una previsione costante pari al tasso
 * di successo osservato: è il modello "senza modello" più onesto possibile, e batterlo è la barra
 * minima perché l'MPI valga qualcosa in più di guardare quante volte in media si trova qualcosa.
 */
function brierReport(usable: readonly (DiaryEntry & { mpiAtEntry: number })[]): BrierReport {
  if (usable.length === 0) {
    return { modelScore: null, baselineScore: null, skillScore: null, baseRate: null }
  }
  const outcomes: number[] = usable.map((e) => (isSuccess(e) ? 1 : 0))
  const baseRate = outcomes.reduce((a, b) => a + b, 0) / outcomes.length

  const modelScore =
    usable.reduce((acc, e, i) => acc + ((e.mpiAtEntry / 100) - (outcomes[i] ?? 0)) ** 2, 0) / usable.length
  const baselineScore = outcomes.reduce((acc, o) => acc + (baseRate - o) ** 2, 0) / outcomes.length

  return {
    modelScore,
    baselineScore,
    skillScore: baselineScore === 0 ? null : 1 - modelScore / baselineScore,
    baseRate,
  }
}

/**
 * Precisione, richiamo e tasso di falsi consigli, con la stessa soglia che il verdetto testuale
 * usa per dire "ci sta andare" — vedi `RECOMMENDATION_THRESHOLD`.
 */
function classificationReport(
  usable: readonly (DiaryEntry & { mpiAtEntry: number })[],
): ClassificationReport {
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  for (const entry of usable) {
    const recommended = entry.mpiAtEntry >= RECOMMENDATION_THRESHOLD
    const success = isSuccess(entry)
    if (recommended && success) tp += 1
    else if (recommended && !success) fp += 1
    else if (!recommended && success) fn += 1
    else tn += 1
  }
  return {
    threshold: RECOMMENDATION_THRESHOLD,
    truePositive: tp,
    falsePositive: fp,
    trueNegative: tn,
    falseNegative: fn,
    precision: tp + fp === 0 ? null : tp / (tp + fp),
    recall: tp + fn === 0 ? null : tp / (tp + fn),
    falseRecommendationRate: tp + fp === 0 ? null : fp / (tp + fp),
  }
}

/**
 * Prima metà contro seconda metà per data: è validazione temporale, non solo una correlazione
 * unica che potrebbe nascondere un modello che ha smesso di funzionare (o ha iniziato) a metà
 * strada. `null` se non c'è abbastanza per dividere in due metà entrambe sopra soglia.
 */
function temporalSplit(
  usable: readonly (DiaryEntry & { mpiAtEntry: number })[],
): { earlier: SplitStat; later: SplitStat } | null {
  if (usable.length < MIN_ENTRIES_FOR_SPLIT * 2) return null
  const sorted = [...usable].sort((a, b) => a.date.localeCompare(b.date))
  const mid = Math.floor(sorted.length / 2)
  return {
    earlier: splitStat('prima metà', sorted.slice(0, mid)),
    later: splitStat('seconda metà', sorted.slice(mid)),
  }
}

/**
 * Una riga per zona, anche con una sola uscita: il conteggio da solo dice già se il campione è
 * concentrato in un posto — non serve aspettare `hasSignal` per mostrarlo.
 *
 * Raggruppa per `zoneCode`, non per `zoneName`: il codice è stabile e univoco, il nome è solo
 * l'etichetta congelata al momento dell'uscita e può ripetersi. Con la copertura ora nazionale
 * (20 regioni, oltre 1200 zone) toponimi identici in regioni diverse sono plausibili ("Poggio",
 * "Pieve", "Il Monte" ricorrono in più province): raggruppare per nome fonderebbe in un'unica
 * riga due zone fisicamente diverse, falsando sia la correlazione mostrata sia l'avviso di
 * concentrazione geografica qui sotto.
 */
function geographicSplit(usable: readonly (DiaryEntry & { mpiAtEntry: number })[]): SplitStat[] {
  const byZone = new Map<string, { readonly zoneName: string; entries: (DiaryEntry & { mpiAtEntry: number })[] }>()
  for (const entry of usable) {
    const group = byZone.get(entry.zoneCode)
    if (group === undefined) byZone.set(entry.zoneCode, { zoneName: entry.zoneName, entries: [entry] })
    else group.entries.push(entry)
  }
  return [...byZone.values()]
    .map(({ zoneName, entries }) => splitStat(zoneName, entries))
    .sort((a, b) => b.count - a.count)
}

function geographicWarningFor(usable: readonly DiaryEntry[], split: readonly SplitStat[]): string | null {
  if (usable.length < MIN_ENTRIES_FOR_SPLIT || split.length === 0) return null
  const top = split[0]
  if (top === undefined) return null
  const share = top.count / usable.length
  if (share < 0.8) return null
  return (
    `${Math.round(share * 100)}% delle uscite utilizzabili vengono da ${top.label}: qualunque ` +
    'correlazione qui sopra descrive quella zona, non "la Toscana" — serve diario da altre zone ' +
    'prima di generalizzare.'
  )
}

function byAlgorithmVersion(usable: readonly (DiaryEntry & { mpiAtEntry: number })[]): SplitStat[] {
  const byVersion = new Map<string, (DiaryEntry & { mpiAtEntry: number })[]>()
  for (const entry of usable) {
    const version = entry.algorithmVersionAtEntry ?? 'versione non registrata'
    const list = byVersion.get(version) ?? []
    list.push(entry)
    byVersion.set(version, list)
  }
  return [...byVersion.entries()].map(([version, list]) => splitStat(version, list))
}

/**
 * Soglia di "sbilanciamento", in punti di probabilità (0-1). Sotto, la differenza fra previsto e
 * osservato è nel rumore che un campione piccolo produce comunque; sopra, vale la pena dirla.
 */
const BIAS_THRESHOLD = 0.1

function biasDirectionFor(
  usable: readonly (DiaryEntry & { mpiAtEntry: number })[],
  hasSignal: boolean,
): 'sovrastima' | 'sottostima' | 'nessuna' | null {
  if (!hasSignal || usable.length === 0) return null
  const meanPredicted = usable.reduce((acc, e) => acc + e.mpiAtEntry / 100, 0) / usable.length
  const observedRate = usable.filter(isSuccess).length / usable.length
  const gap = meanPredicted - observedRate
  if (gap > BIAS_THRESHOLD) return 'sovrastima'
  if (gap < -BIAS_THRESHOLD) return 'sottostima'
  return 'nessuna'
}

function shortSearchCaveatFor(usable: readonly DiaryEntry[]): string | null {
  const emptyWithoutDuration = usable.filter(
    (e) => rankOf(e.abundance) === 0 && e.durationMinutes === null,
  )
  if (emptyWithoutDuration.length === 0) return null
  // Singolare e plurale su tutta la frase, non solo sul sostantivo: "1 uscita ... non hanno"
  // si legge come un errore dell'app, e un'app che sbaglia l'italiano sembra sbagliare anche i conti.
  const one = emptyWithoutDuration.length === 1
  return (
    `${emptyWithoutDuration.length} ${one ? 'uscita' : 'uscite'} senza niente trovato ` +
    `${one ? 'non ha' : 'non hanno'} la durata della ricerca: uno zero dopo dieci minuti e uno ` +
    'zero dopo mezza giornata non dicono la stessa cosa, ma qui non si possono distinguere. ' +
    'Indicarla nelle prossime uscite rende questi numeri più leggibili.'
  )
}

export function calibrate(entries: readonly DiaryEntry[]): CalibrationReport {
  const usable = entries.filter(
    (e): e is DiaryEntry & { mpiAtEntry: number } => e.mpiAtEntry !== null,
  )
  const contextual = usable.filter((e) => e.durationMinutes !== null).length

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
  const geoSplit = geographicSplit(usable)

  return {
    total: entries.length,
    usable: usable.length,
    contextual,
    hasSignal,
    bands,
    rankCorrelation: correlation,
    verdict: verdictFor(usable.length, correlation, hasSignal),
    brier: brierReport(usable),
    classification: classificationReport(usable),
    temporalSplit: temporalSplit(usable),
    geographicSplit: geoSplit,
    geographicWarning: geographicWarningFor(usable, geoSplit),
    byAlgorithmVersion: byAlgorithmVersion(usable),
    shortSearchCaveat: shortSearchCaveatFor(usable),
    biasDirection: biasDirectionFor(usable, hasSignal),
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
