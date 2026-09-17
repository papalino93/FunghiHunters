/**
 * Test delle metriche di calibrazione: Brier score contro baseline, classificazione,
 * validazione temporale e geografica separata.
 *
 * Il rischio che questi test coprono non è "la formula è giusta" (sono formule da manuale), è che
 * il codice dichiari onestamente quando non può dire nulla — campione troppo piccolo, tutte le
 * uscite dalla stessa zona — invece di calcolare comunque un numero che sembra un giudizio.
 */

import { describe, expect, it } from 'vitest'

import {
  MIN_ENTRIES_FOR_SPLIT,
  RECOMMENDATION_THRESHOLD,
  calibrate,
} from '@/lib/diary/calibration'
import { materialise } from '@/lib/diary/store'
import type { Abundance, DiaryEntry } from '@/lib/diary/types'
import { toneFor } from '@/lib/recommend/verdict'

function entry(overrides: {
  mpi: number
  abundance: Abundance
  day: number
  zoneName?: string
  algorithmVersionAtEntry?: string | null
}): DiaryEntry {
  return materialise({
    date: `2026-09-${String(overrides.day).padStart(2, '0')}`,
    zoneCode: 'test',
    zoneName: overrides.zoneName ?? 'Garfagnana',
    abundance: overrides.abundance,
    mpiAtEntry: overrides.mpi,
    confidenceAtEntry: 70,
    algorithmVersionAtEntry:
      'algorithmVersionAtEntry' in overrides ? overrides.algorithmVersionAtEntry : '1.1.0-porcino',
  })
}

describe('soglia di raccomandazione allineata al verdetto testuale', () => {
  it('sotto soglia il verdetto non dice ancora "ci sta andare"', () => {
    expect(toneFor(RECOMMENDATION_THRESHOLD - 1)).not.toBe('worth')
    expect(toneFor(RECOMMENDATION_THRESHOLD - 1)).not.toBe('good')
  })

  it('alla soglia il verdetto dice "ci sta andare" o meglio', () => {
    const tone = toneFor(RECOMMENDATION_THRESHOLD)
    expect(['worth', 'good']).toContain(tone)
  })
})

describe('Brier score', () => {
  it('un modello perfetto ha punteggio zero e skill score 1', () => {
    const entries = [
      entry({ mpi: 100, abundance: 'many', day: 1 }),
      entry({ mpi: 100, abundance: 'some', day: 2 }),
      entry({ mpi: 0, abundance: 'none', day: 3 }),
      entry({ mpi: 0, abundance: 'none', day: 4 }),
    ]
    const { brier } = calibrate(entries)
    expect(brier.modelScore).toBeCloseTo(0, 6)
    expect(brier.skillScore).toBeCloseTo(1, 6)
  })

  it('senza uscite utilizzabili tutto è null, non zero', () => {
    const { brier } = calibrate([])
    expect(brier.modelScore).toBeNull()
    expect(brier.baselineScore).toBeNull()
    expect(brier.skillScore).toBeNull()
  })

  it('un modello che prevede sempre il tasso di base non batte il "senza modello"', () => {
    // Metà successi, meta' no: un modello che prevede 50 per tutti ha lo stesso punteggio della
    // baseline costante al tasso osservato (anch'esso 50%), quindi skill score vicino a zero.
    const entries = [
      entry({ mpi: 50, abundance: 'some', day: 1 }),
      entry({ mpi: 50, abundance: 'none', day: 2 }),
      entry({ mpi: 50, abundance: 'some', day: 3 }),
      entry({ mpi: 50, abundance: 'none', day: 4 }),
    ]
    const { brier } = calibrate(entries)
    expect(brier.skillScore).toBeCloseTo(0, 6)
  })
})

describe('classificazione (precisione, richiamo, falsi consigli)', () => {
  it('conta correttamente veri/falsi positivi e negativi', () => {
    const entries = [
      entry({ mpi: 80, abundance: 'many', day: 1 }), // consigliato, successo -> TP
      entry({ mpi: 70, abundance: 'none', day: 2 }), // consigliato, niente -> FP
      entry({ mpi: 10, abundance: 'none', day: 3 }), // non consigliato, niente -> TN
      entry({ mpi: 15, abundance: 'few', day: 4 }), // non consigliato, successo -> FN
    ]
    const { classification: c } = calibrate(entries)
    expect(c).toMatchObject({ truePositive: 1, falsePositive: 1, trueNegative: 1, falseNegative: 1 })
    expect(c.precision).toBeCloseTo(0.5, 6)
    expect(c.recall).toBeCloseTo(0.5, 6)
    expect(c.falseRecommendationRate).toBeCloseTo(0.5, 6)
  })

  it('senza nessun consiglio dato, precisione e tasso di falsi consigli sono null, non zero', () => {
    const entries = [entry({ mpi: 5, abundance: 'none', day: 1 })]
    const { classification: c } = calibrate(entries)
    expect(c.precision).toBeNull()
    expect(c.falseRecommendationRate).toBeNull()
  })
})

describe('validazione temporale', () => {
  it('null sotto la soglia per dividere in due metà', () => {
    const entries = Array.from({ length: MIN_ENTRIES_FOR_SPLIT }, (_, i) =>
      entry({ mpi: 50, abundance: 'some', day: i + 1 }),
    )
    expect(calibrate(entries).temporalSplit).toBeNull()
  })

  it('divide per data, non per ordine di inserimento', () => {
    const entries = [
      entry({ mpi: 90, abundance: 'many', day: 20 }),
      entry({ mpi: 10, abundance: 'none', day: 1 }),
      ...Array.from({ length: (MIN_ENTRIES_FOR_SPLIT - 1) * 2 }, (_, i) =>
        entry({ mpi: 50, abundance: 'some', day: 5 + i }),
      ),
    ]
    const split = calibrate(entries).temporalSplit
    expect(split).not.toBeNull()
    expect(split?.earlier.count).toBe(split?.later.count)
  })
})

describe('validazione geografica', () => {
  it('avvisa quando quasi tutte le uscite vengono dalla stessa zona', () => {
    const entries = [
      ...Array.from({ length: MIN_ENTRIES_FOR_SPLIT + 2 }, (_, i) =>
        entry({ mpi: 50, abundance: 'some', day: i + 1, zoneName: 'Garfagnana' }),
      ),
      entry({ mpi: 50, abundance: 'some', day: 30, zoneName: 'Amiata' }),
    ]
    const report = calibrate(entries)
    expect(report.geographicWarning).toMatch(/Garfagnana/)
  })

  it('non avvisa quando le uscite sono distribuite su più zone', () => {
    const entries = [
      ...Array.from({ length: 4 }, (_, i) => entry({ mpi: 50, abundance: 'some', day: i + 1, zoneName: 'Garfagnana' })),
      ...Array.from({ length: 4 }, (_, i) => entry({ mpi: 50, abundance: 'some', day: i + 10, zoneName: 'Amiata' })),
    ]
    expect(calibrate(entries).geographicWarning).toBeNull()
  })

  it('elenca ogni zona anche con una sola uscita', () => {
    const entries = [entry({ mpi: 50, abundance: 'some', day: 1, zoneName: 'Mugello' })]
    const split = calibrate(entries).geographicSplit
    expect(split.map((s) => s.label)).toContain('Mugello')
  })
})

describe('per versione dell\'algoritmo', () => {
  it('raggruppa per versione, e mette le voci senza versione a parte', () => {
    const entries = [
      entry({ mpi: 50, abundance: 'some', day: 1, algorithmVersionAtEntry: '1.0.0-porcino' }),
      entry({ mpi: 50, abundance: 'some', day: 2, algorithmVersionAtEntry: '1.1.0-porcino' }),
      entry({ mpi: 50, abundance: 'some', day: 3, algorithmVersionAtEntry: null }),
    ]
    const byVersion = calibrate(entries).byAlgorithmVersion
    const labels = byVersion.map((s) => s.label)
    expect(labels).toContain('1.0.0-porcino')
    expect(labels).toContain('1.1.0-porcino')
    expect(labels).toContain('versione non registrata')
  })
})
