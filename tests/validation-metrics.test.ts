/**
 * Test delle metriche del backtest caso-controllo.
 *
 * Le formule sono da manuale; i test coprono i casi limite che il backtest incontra davvero: i
 * pari merito (MPI arrotondato, calendario a gradini), i sottogruppi senza casi o senza controlli,
 * l'anno lasciato fuori che non deve mai vedere se stesso, il bootstrap che deve ricampionare le
 * localita'-anno intere e non le righe.
 */

import { describe, expect, it } from 'vitest'

import {
  aucMannWhitney,
  bandCounts,
  brierScore,
  calendarKernelScores,
  calendarMonthlyScores,
  clusterBootstrapGroupSets,
  clusterBootstrapIndexSets,
  fitLogistic,
  groupSetsToIndices,
  matchedAuc,
  matchedPairStats,
  leaveOneYearOutCalibration,
  leaveOneYearOutPrevalence,
  percentileInterval,
  predictLogistic,
  quantile,
  reliabilityTable,
} from '@/lib/validation/metrics'
import { mulberry32 } from '@/lib/validation/rng'

describe('aucMannWhitney', () => {
  it('vale 1 con separazione perfetta, 0 con separazione rovesciata', () => {
    const labels = [true, true, false, false]
    expect(aucMannWhitney([0.9, 0.8, 0.2, 0.1], labels)).toBe(1)
    expect(aucMannWhitney([0.1, 0.2, 0.8, 0.9], labels)).toBe(0)
  })

  it('conta i pari merito come mezzo', () => {
    expect(aucMannWhitney([5, 5, 5, 5], [true, false, true, false])).toBe(0.5)
    // Un caso a 3, un caso a 1; controlli a 1 e 0: coppie (3>1),(3>0),(1=1 -> 0.5),(1>0) = 3.5/4
    expect(aucMannWhitney([3, 1, 1, 0], [true, true, false, false])).toBeCloseTo(0.875, 10)
  })

  it('coincide con il conteggio diretto delle coppie', () => {
    const rng = mulberry32(7)
    const scores = Array.from({ length: 60 }, () => Math.round(rng() * 10))
    const labels = scores.map(() => rng() < 0.3)
    let wins = 0
    let pairs = 0
    for (const [i, si] of scores.entries()) {
      if (!labels[i]) continue
      for (const [j, sj] of scores.entries()) {
        if (labels[j]) continue
        pairs += 1
        wins += si > sj ? 1 : si === sj ? 0.5 : 0
      }
    }
    expect(aucMannWhitney(scores, labels)).toBeCloseTo(wins / pairs, 12)
  })

  it('non inventa un valore senza casi o senza controlli', () => {
    expect(aucMannWhitney([1, 2], [true, true])).toBeNull()
    expect(aucMannWhitney([1, 2], [false, false])).toBeNull()
    expect(aucMannWhitney([1, 2, 3], [true, false, true], [0, 2])).toBeNull()
  })

  it('rispetta il sottoinsieme di indici, ripetizioni comprese', () => {
    const scores = [1, 0, 2, 3]
    const labels = [true, false, false, true]
    expect(aucMannWhitney(scores, labels, [0, 1])).toBe(1)
    expect(aucMannWhitney(scores, labels, [0, 2])).toBe(0)
    // Indici ripetuti = pesi del bootstrap: il caso 0 due volte contro il controllo 2.
    expect(aucMannWhitney(scores, labels, [0, 0, 2, 3])).toBeCloseTo(1 / 3, 12)
  })
})

describe('clusterBootstrapIndexSets', () => {
  it('ricampiona i gruppi interi, con lo stesso numero di gruppi', () => {
    const groups = ['a', 'a', 'a', 'b', 'c', 'c']
    const sets = clusterBootstrapIndexSets(groups, 200, mulberry32(1))
    expect(sets).toHaveLength(200)
    for (const set of sets) {
      // Ogni gruppo entra con tutte le sue righe o con nessuna: le righe di "a" vanno a tre a tre.
      const countA = set.filter((i) => i <= 2).length
      expect(countA % 3).toBe(0)
      const countC = set.filter((i) => i >= 4).length
      expect(countC % 2).toBe(0)
      const draws = countA / 3 + set.filter((i) => i === 3).length + countC / 2
      expect(draws).toBe(3)
    }
  })

  it('e\' riproducibile con lo stesso seme', () => {
    const groups = ['x', 'y', 'z', 'x']
    expect(clusterBootstrapIndexSets(groups, 5, mulberry32(3))).toEqual(
      clusterBootstrapIndexSets(groups, 5, mulberry32(3)),
    )
  })
})

describe('AUC appaiata dentro la localita\'-anno', () => {
  it('confronta solo casi e controlli dello stesso gruppo', () => {
    // Il gruppo "a" ha punteggi alti per tutti, il gruppo "b" bassi: l'AUC complessiva premia la
    // geografia (il controllo di "a" batte il caso di "b"), quella appaiata no.
    const scores = [90, 80, 20, 10]
    const labels = [true, false, true, false]
    const groups = ['a', 'a', 'b', 'b']
    expect(matchedAuc(matchedPairStats(scores, labels, groups))).toBe(1)
    expect(aucMannWhitney(scores, labels)).toBe(0.75)
  })

  it('pesa i gruppi ripetuti del bootstrap e ignora quelli senza coppie', () => {
    const stats = matchedPairStats(
      [5, 1, 1, 5, 3],
      [true, false, true, false, true],
      ['a', 'a', 'b', 'b', 'c'],
    )
    expect(matchedAuc(stats, ['a', 'a', 'b'])).toBeCloseTo(2 / 3, 12)
    expect(matchedAuc(stats, ['c'])).toBeNull()
    expect(matchedAuc(matchedPairStats([2, 2], [true, false], ['x', 'x']))).toBe(0.5)
  })

  it('i replicati per gruppi e per indici sono lo stesso ricampionamento', () => {
    const groups = ['a', 'a', 'b', 'c']
    const sets = clusterBootstrapGroupSets(groups, 3, mulberry32(4))
    expect(groupSetsToIndices(groups, sets)).toEqual(
      clusterBootstrapIndexSets(groups, 3, mulberry32(4)),
    )
  })
})

describe('quantili e intervalli', () => {
  it('interpola come R tipo 7', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([10, 0, 5], 0)).toBe(0)
    expect(quantile([10, 0, 5], 1)).toBe(10)
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2)
  })

  it('ignora i replicati non definiti', () => {
    const ci = percentileInterval([null, 0.5, 0.6, 0.7, null, 0.8, 0.9])
    expect(ci.low).toBeCloseTo(0.51, 10)
    expect(ci.high).toBeCloseTo(0.89, 10)
  })
})

describe('logistica e Brier', () => {
  it('ritrova i coefficienti di un modello noto', () => {
    const rng = mulberry32(11)
    const x: number[] = []
    const y: boolean[] = []
    for (let i = 0; i < 4000; i += 1) {
      const xi = rng() * 4 - 2
      x.push(xi)
      y.push(rng() < 1 / (1 + Math.exp(-(-0.5 + 1.5 * xi))))
    }
    const fit = fitLogistic(x, y)
    expect(fit.intercept).toBeCloseTo(-0.5, 0)
    expect(fit.slope).toBeCloseTo(1.5, 0)
    expect(predictLogistic(fit, 0)).toBeGreaterThan(0.3)
    expect(predictLogistic(fit, 0)).toBeLessThan(0.45)
  })

  it('resta finita con dati separabili', () => {
    const fit = fitLogistic([0, 0.1, 0.9, 1], [false, false, true, true])
    expect(Number.isFinite(fit.slope)).toBe(true)
    expect(fit.slope).toBeGreaterThan(0)
  })

  it('senza informazione nel predittore restituisce la prevalenza', () => {
    const fit = fitLogistic([1, 1, 1, 1], [true, false, false, false])
    expect(predictLogistic(fit, 1)).toBeCloseTo(0.25, 3)
  })

  it('calcola il Brier', () => {
    expect(brierScore([1, 0], [true, false])).toBe(0)
    expect(brierScore([0.5, 0.5], [true, false])).toBe(0.25)
    expect(brierScore([0.2], [true])).toBeCloseTo(0.64, 12)
  })
})

describe('leave-one-year-out', () => {
  it('non usa mai l\'anno previsto per stimare il modello', () => {
    // Nel 2020 il punteggio e' rovesciato rispetto agli altri anni: se il 2020 entrasse nella
    // propria stima, la pendenza sarebbe piu' piatta. Fuori, la previsione resta quella degli altri.
    const scores = [0.9, 0.1, 0.8, 0.2, 0.1, 0.9]
    const labels = [true, false, true, false, true, false]
    const years = [2019, 2019, 2021, 2021, 2020, 2020]
    const p = leaveOneYearOutCalibration(scores, labels, years)
    expect(p[4]).toBeLessThan(0.5)
    expect(p[5]).toBeGreaterThan(0.5)
    expect(p.every((v) => Number.isFinite(v))).toBe(true)
  })

  it('prevalenza dagli altri anni', () => {
    const labels = [true, false, false, true, true, true]
    const years = [1, 1, 1, 2, 2, 2]
    const p = leaveOneYearOutPrevalence(labels, years)
    expect(p[0]).toBe(1)
    expect(p[3]).toBeCloseTo(1 / 3, 12)
  })
})

describe('reliabilityTable', () => {
  it('divide in gruppi di numerosita\' uguale e riporta le frequenze osservate', () => {
    const p = Array.from({ length: 20 }, (_, i) => i / 20)
    const y = p.map((v) => v >= 0.5)
    const table = reliabilityTable(p, y, 4)
    expect(table.map((b) => b.n)).toEqual([5, 5, 5, 5])
    expect(table.map((b) => b.observedRate)).toEqual([0, 0, 1, 1])
    expect(table[0]?.meanPredicted).toBeCloseTo(0.1, 12)
  })
})

describe('modelli nulli di calendario', () => {
  it('mensile: frazione dei casi degli altri anni nello stesso mese', () => {
    const months = [9, 9, 10, 9, 7]
    const labels = [true, false, true, true, false]
    const years = [2019, 2019, 2020, 2021, 2021]
    const s = calendarMonthlyScores(months, labels, years)
    // Riga 0 (2019): casi degli altri anni = mese 10 (2020) e 9 (2021) -> meta' a settembre.
    expect(s[0]).toBe(0.5)
    // Riga 3 (2021, settembre): casi degli altri anni = 9 (2019) e 10 (2020) -> 0.5.
    expect(s[3]).toBe(0.5)
    // Riga 4 (2021, luglio): nessun caso di luglio altrove.
    expect(s[4]).toBe(0)
  })

  it('a nucleo: piu\' alto vicino ai giorni dei casi degli altri anni', () => {
    const doys = [270, 180, 270, 272]
    const labels = [false, false, true, true]
    const years = [2019, 2019, 2020, 2021]
    const s = calendarKernelScores(doys, labels, years)
    expect(s[0]).toBeGreaterThan(s[1] ?? 1)
    // La riga 2 (2020) non vede se stessa, solo il caso del 2021 a due giorni.
    expect(s[2]).toBeCloseTo(Math.exp(-4 / 200), 12)
  })
})

describe('bandCounts', () => {
  it('assegna gli estremi alla fascia superiore', () => {
    expect(bandCounts([0, 19.9, 20, 55, 80, 100], [20, 40, 60, 80])).toEqual([2, 1, 1, 0, 2])
  })
})
