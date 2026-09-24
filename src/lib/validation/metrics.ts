/**
 * Metriche del backtest caso-controllo. Funzioni pure, da manuale, testate.
 *
 * Il rischio che coprono i test non e' la formula — sono formule note — ma i casi limite che nel
 * backtest capitano davvero: pari merito (l'MPI arrotondato a un decimale, il calendario mensile
 * che da' lo stesso valore a tutto settembre), un sottogruppo senza casi o senza controlli (una
 * fascia di quota, un mese), un anno intero da lasciare fuori.
 */

import { type Rng } from '@/lib/validation/rng'

/**
 * AUC come statistica di Mann-Whitney: la probabilita' che un caso preso a caso abbia un
 * punteggio piu' alto di un controllo preso a caso, con i pari merito contati mezzo.
 *
 * 0.5 e' il lancio della moneta. `null` quando mancano i casi o i controlli: un'AUC su un solo
 * gruppo non esiste, e restituire 0.5 la farebbe sembrare una misura.
 */
export function aucMannWhitney(
  scores: readonly number[],
  labels: readonly boolean[],
  indices?: readonly number[],
): number | null {
  const idx = indices ?? scores.map((_, i) => i)
  const items = idx.map((i) => ({ s: scores[i] ?? 0, y: labels[i] === true }))
  const nPos = items.filter((it) => it.y).length
  const nNeg = items.length - nPos
  if (nPos === 0 || nNeg === 0) return null
  items.sort((a, b) => a.s - b.s)
  // Ranghi medi sui pari merito.
  let rankSumPos = 0
  let i = 0
  while (i < items.length) {
    let j = i
    while (j + 1 < items.length && items[j + 1]?.s === items[i]?.s) j += 1
    const averageRank = (i + j + 2) / 2
    for (let k = i; k <= j; k += 1) if (items[k]?.y === true) rankSumPos += averageRank
    i = j + 1
  }
  return (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg)
}

/**
 * Replicati di un bootstrap **a grappoli**: si ricampionano con reinserimento i gruppi (le
 * localita'-anno), non le righe. Casi e controlli della stessa localita'-anno condividono la serie
 * meteo, e ricampionarli separatamente farebbe l'intervallo piu' stretto del vero.
 *
 * Restituisce, per ogni replicato, l'elenco dei gruppi estratti (con le ripetizioni).
 */
export function clusterBootstrapGroupSets(
  groups: readonly string[],
  replicates: number,
  rng: Rng,
): string[][] {
  const keys = [...new Set(groups)].sort()
  const out: string[][] = []
  for (let r = 0; r < replicates; r += 1) {
    const set: string[] = []
    for (let c = 0; c < keys.length; c += 1) {
      const pick = keys[Math.floor(rng() * keys.length)]
      if (pick !== undefined) set.push(pick)
    }
    out.push(set)
  }
  return out
}

/** Gli stessi replicati come indici di riga: ogni gruppo estratto porta tutte le sue righe. */
export function groupSetsToIndices(
  groups: readonly string[],
  sets: readonly (readonly string[])[],
): number[][] {
  const byGroup = new Map<string, number[]>()
  for (const [i, g] of groups.entries()) {
    const list = byGroup.get(g) ?? []
    list.push(i)
    byGroup.set(g, list)
  }
  return sets.map((set) => set.flatMap((g) => byGroup.get(g) ?? []))
}

export function clusterBootstrapIndexSets(
  groups: readonly string[],
  replicates: number,
  rng: Rng,
): number[][] {
  return groupSetsToIndices(groups, clusterBootstrapGroupSets(groups, replicates, rng))
}

export interface PairStats {
  /** Coppie caso-controllo in cui il caso ha il punteggio piu' alto (pari merito = mezzo). */
  readonly wins: number
  readonly pairs: number
}

/**
 * Confronti caso-controllo **dentro** ogni localita'-anno.
 *
 * E' la lettura fedele al disegno appaiato: stesso punto, stesso anno, stessa quota, cambia solo
 * il giorno. L'AUC complessiva mescola anche il confronto fra un caso in Sardegna e un controllo
 * in Trentino, dove conta la geografia prima del meteo; questa no.
 */
export function matchedPairStats(
  scores: readonly number[],
  labels: readonly boolean[],
  groups: readonly string[],
): Map<string, PairStats> {
  const byGroup = new Map<string, { cases: number[]; controls: number[] }>()
  for (const [i, g] of groups.entries()) {
    const entry = byGroup.get(g) ?? { cases: [], controls: [] }
    if (labels[i] === true) entry.cases.push(scores[i] ?? 0)
    else entry.controls.push(scores[i] ?? 0)
    byGroup.set(g, entry)
  }
  const out = new Map<string, PairStats>()
  for (const [g, { cases, controls }] of byGroup) {
    let wins = 0
    for (const c of cases) for (const k of controls) wins += c > k ? 1 : c === k ? 0.5 : 0
    out.set(g, { wins, pairs: cases.length * controls.length })
  }
  return out
}

/** AUC appaiata su un insieme di gruppi: tutti, o quelli (ripetuti) di un replicato bootstrap. */
export function matchedAuc(
  stats: ReadonlyMap<string, PairStats>,
  groupSet?: readonly string[],
): number | null {
  let wins = 0
  let pairs = 0
  for (const g of groupSet ?? [...stats.keys()]) {
    const s = stats.get(g)
    if (s === undefined) continue
    wins += s.wins
    pairs += s.pairs
  }
  return pairs === 0 ? null : wins / pairs
}

/** Quantile per interpolazione lineare (tipo 7, quello di R e NumPy). */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  const a = sorted[lo] ?? Number.NaN
  const b = sorted[hi] ?? Number.NaN
  return a + (b - a) * (pos - lo)
}

export interface Interval {
  readonly low: number
  readonly high: number
}

/** Intervallo percentile, ignorando i replicati in cui la statistica non era definita. */
export function percentileInterval(values: readonly (number | null)[], level = 0.95): Interval {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v))
  const tail = (1 - level) / 2
  return { low: quantile(present, tail), high: quantile(present, 1 - tail) }
}

function sigmoid(z: number): number {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z))
}

export interface LogisticFit {
  readonly intercept: number
  readonly slope: number
}

/**
 * Regressione logistica a una variabile, Newton-Raphson con una piccola cresta.
 *
 * La cresta c'e' per un caso concreto: un anno lasciato fuori puo' rendere il resto quasi
 * separabile (tutti i casi sopra 50, tutti i controlli sotto), e senza regolarizzazione la
 * pendenza andrebbe all'infinito invece di fermarsi a un valore grande.
 */
export function fitLogistic(
  x: readonly number[],
  y: readonly boolean[],
  ridge = 1e-4,
  iterations = 50,
): LogisticFit {
  let a = 0
  let b = 0
  for (let it = 0; it < iterations; it += 1) {
    let ga = 0
    let gb = 0
    let haa = ridge
    let hab = 0
    let hbb = ridge
    for (const [i, xi] of x.entries()) {
      const p = sigmoid(a + b * xi)
      const r = (y[i] === true ? 1 : 0) - p
      ga += r
      gb += r * xi
      const w = p * (1 - p)
      haa += w
      hab += w * xi
      hbb += w * xi * xi
    }
    gb -= ridge * b
    ga -= ridge * a
    const det = haa * hbb - hab * hab
    if (det <= 0 || !Number.isFinite(det)) break
    const da = (hbb * ga - hab * gb) / det
    const db = (haa * gb - hab * ga) / det
    a += da
    b += db
    if (Math.abs(da) < 1e-10 && Math.abs(db) < 1e-10) break
  }
  return { intercept: a, slope: b }
}

export function predictLogistic(fit: LogisticFit, x: number): number {
  return sigmoid(fit.intercept + fit.slope * x)
}

/**
 * Probabilita' calibrate lasciando fuori un anno alla volta: per ogni anno si stima la logistica
 * sugli altri anni e la si applica a quello. Nessuna riga e' mai prevista da un modello che l'ha
 * vista, quindi il Brier che ne esce non e' ottimista.
 */
export function leaveOneYearOutCalibration(
  scores: readonly number[],
  labels: readonly boolean[],
  years: readonly number[],
): number[] {
  const out = new Array<number>(scores.length).fill(Number.NaN)
  for (const year of [...new Set(years)]) {
    const trainX: number[] = []
    const trainY: boolean[] = []
    for (const [i, s] of scores.entries()) {
      if (years[i] !== year) {
        trainX.push(s)
        trainY.push(labels[i] === true)
      }
    }
    const fit = fitLogistic(trainX, trainY)
    for (const [i, s] of scores.entries()) if (years[i] === year) out[i] = predictLogistic(fit, s)
  }
  return out
}

/** Prevalenza dei casi negli altri anni: la previsione "senza modello" per il Brier skill score. */
export function leaveOneYearOutPrevalence(
  labels: readonly boolean[],
  years: readonly number[],
): number[] {
  return labels.map((_, i) => {
    let pos = 0
    let n = 0
    for (const [j, y] of labels.entries()) {
      if (years[j] === years[i]) continue
      n += 1
      if (y) pos += 1
    }
    return n === 0 ? Number.NaN : pos / n
  })
}

export function brierScore(probabilities: readonly number[], labels: readonly boolean[]): number {
  if (probabilities.length === 0) return Number.NaN
  let total = 0
  for (const [i, p] of probabilities.entries()) total += (p - (labels[i] === true ? 1 : 0)) ** 2
  return total / probabilities.length
}

export interface ReliabilityBin {
  readonly n: number
  readonly meanPredicted: number
  readonly observedRate: number
  readonly minPredicted: number
  readonly maxPredicted: number
}

/**
 * Tabella di affidabilita' a quantili: `bins` gruppi di numerosita' (quasi) uguale in ordine di
 * probabilita' prevista. Con predittori a gradini — il calendario mensile — alcuni gruppi possono
 * contenere lo stesso valore previsto: e' corretto cosi', il gruppo dice comunque quanto spesso
 * quella previsione si e' avverata.
 */
export function reliabilityTable(
  probabilities: readonly number[],
  labels: readonly boolean[],
  bins = 10,
): ReliabilityBin[] {
  const order = probabilities.map((p, i) => ({ p, y: labels[i] === true })).sort((a, b) => a.p - b.p)
  const out: ReliabilityBin[] = []
  for (let b = 0; b < bins; b += 1) {
    const from = Math.floor((b * order.length) / bins)
    const to = Math.floor(((b + 1) * order.length) / bins)
    const slice = order.slice(from, to)
    if (slice.length === 0) continue
    out.push({
      n: slice.length,
      meanPredicted: slice.reduce((acc, it) => acc + it.p, 0) / slice.length,
      observedRate: slice.filter((it) => it.y).length / slice.length,
      minPredicted: slice[0]?.p ?? Number.NaN,
      maxPredicted: slice[slice.length - 1]?.p ?? Number.NaN,
    })
  }
  return out
}

/**
 * Il modello nullo: il calendario e basta.
 *
 * Per ogni riga, la frazione dei casi **degli altri anni** caduta nello stesso mese. Non sa
 * niente di meteo ne' di quota: sa solo che a settembre si trovano piu' porcini che a giugno. Un
 * modello meteo che non lo batte sta ripetendo il calendario con piu' passaggi.
 */
export function calendarMonthlyScores(
  months: readonly number[],
  labels: readonly boolean[],
  years: readonly number[],
): number[] {
  return months.map((month, i) => {
    let inMonth = 0
    let cases = 0
    for (const [j, y] of labels.entries()) {
      if (!y || years[j] === years[i]) continue
      cases += 1
      if (months[j] === month) inMonth += 1
    }
    return cases === 0 ? 0 : inMonth / cases
  })
}

/**
 * Variante piu' fine del calendario: densita' a nucleo gaussiano dei giorni dell'anno dei casi
 * degli altri anni. Non ha il gradino a fine mese, quindi e' un avversario piu' duro del
 * calendario mensile: se il modello batte questo, il vantaggio non viene dalla risoluzione.
 */
export function calendarKernelScores(
  daysOfYear: readonly number[],
  labels: readonly boolean[],
  years: readonly number[],
  bandwidthDays = 10,
): number[] {
  return daysOfYear.map((doy, i) => {
    let density = 0
    let cases = 0
    for (const [j, y] of labels.entries()) {
      if (!y || years[j] === years[i]) continue
      cases += 1
      const other = daysOfYear[j] ?? 0
      density += Math.exp(-((doy - other) ** 2) / (2 * bandwidthDays ** 2))
    }
    return cases === 0 ? 0 : density / cases
  })
}

/** Conteggio in fasce con estremi `[e_k, e_k+1)`: quante volte l'MPI cade in ciascuna. */
export function bandCounts(values: readonly number[], edges: readonly number[]): number[] {
  const counts = new Array<number>(edges.length + 1).fill(0)
  for (const v of values) {
    let band = edges.findIndex((edge) => v < edge)
    if (band < 0) band = edges.length
    counts[band] = (counts[band] ?? 0) + 1
  }
  return counts
}
