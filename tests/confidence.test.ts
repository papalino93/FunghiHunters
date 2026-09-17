/**
 * Test della confidence.
 *
 * Il caso piu' importante e' una proprieta' logica: fondere il modello con delle osservazioni non
 * puo' rendere la stima meno affidabile del modello da solo. La prima versione lo permetteva, e
 * sui dati reali una stazione a 3 km faceva scendere la confidence da 63 a 42.
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_VARIABLE_WEIGHTS,
  aggregateConfidence,
  ensembleAgreement,
  variableConfidence,
  type StationContribution,
} from '@/lib/model/confidence'

function station(distanceKm: number, elevationDiffM: number, validated = false): StationContribution {
  return { stationCode: `S${distanceKm}`, distanceKm, elevationDiffM, validated }
}

const BASE = {
  variable: 'precipitation',
  provenance: 'OBSERVED',
  horizonDays: 0,
  ensembleAgreement: null,
  coverage: 1,
} as const

describe('confidence di una variabile', () => {
  it('una stazione sul posto da la confidence piu alta', () => {
    const onSite = variableConfidence({ ...BASE, stations: [station(0, 0)] })
    const far = variableConfidence({ ...BASE, stations: [station(35, 0)] })
    expect(onSite.score).toBeGreaterThan(far.score)
    expect(onSite.score).toBeGreaterThan(80)
  })

  it('avere una stazione non puo mai valere meno del non averne nessuna', () => {
    // E' la proprieta' che mancava: il valore fuso e' una combinazione del modello e
    // dell'osservazione, quindi non puo' essere peggio del modello preso da solo.
    const modelOnly = variableConfidence({
      ...BASE,
      provenance: 'MODELLED',
      stations: [],
    })
    for (const distance of [1, 5, 15, 30, 55]) {
      for (const elevation of [0, 200, 500, 900]) {
        const withStation = variableConfidence({
          ...BASE,
          stations: [station(distance, elevation)],
        })
        expect(withStation.score).toBeGreaterThanOrEqual(modelOnly.score - 1e-9)
      }
    }
  })

  it('penalizza il dislivello meno di quanto lo penalizzi la scelta delle stazioni', () => {
    // Il trend della regressione corregge gia' la quota: penalizzarla di nuovo nel confidence
    // sarebbe contarla due volte.
    const sameElevation = variableConfidence({ ...BASE, stations: [station(3, 0)] })
    const higher = variableConfidence({ ...BASE, stations: [station(3, 300)] })
    expect(higher.score).toBeLessThan(sameElevation.score)
    expect(higher.score).toBeGreaterThan(sameElevation.score * 0.7)
  })

  it('piu stazioni alzano la confidence, con rendimento decrescente', () => {
    const one = variableConfidence({ ...BASE, stations: [station(4, 50)] })
    const four = variableConfidence({
      ...BASE,
      stations: [station(4, 50), station(6, 80), station(9, 120), station(12, 60)],
    })
    const eight = variableConfidence({
      ...BASE,
      stations: Array.from({ length: 8 }, (_, i) => station(4 + i, 50 + i * 10)),
    })
    expect(four.score).toBeGreaterThan(one.score)
    expect(eight.score).toBeGreaterThan(four.score)
    expect(eight.score - four.score).toBeLessThan(four.score - one.score)
  })

  it('la previsione lontana nel tempo vale meno di quella di oggi', () => {
    const today = variableConfidence({ ...BASE, provenance: 'FORECAST', stations: [], horizonDays: 0 })
    const inAWeek = variableConfidence({
      ...BASE,
      provenance: 'FORECAST',
      stations: [],
      horizonDays: 7,
    })
    expect(inAWeek.score).toBeLessThan(today.score)
  })

  it('il disaccordo fra i modelli abbassa la confidence', () => {
    const agreeing = variableConfidence({
      ...BASE,
      provenance: 'FORECAST',
      stations: [],
      ensembleAgreement: 1,
    })
    const disagreeing = variableConfidence({
      ...BASE,
      provenance: 'FORECAST',
      stations: [],
      ensembleAgreement: 0,
    })
    expect(disagreeing.score).toBeLessThan(agreeing.score / 1.5)
  })

  it('una finestra incompleta abbassa la confidence', () => {
    const complete = variableConfidence({ ...BASE, stations: [station(3, 0)], coverage: 1 })
    const partial = variableConfidence({ ...BASE, stations: [station(3, 0)], coverage: 0.3 })
    expect(partial.score).toBeLessThan(complete.score)
  })

  it('il dato validato dalla fonte vale piu di quello non validato', () => {
    const provisional = variableConfidence({ ...BASE, stations: [station(2, 0, false)] })
    const validated = variableConfidence({ ...BASE, stations: [station(2, 0, true)] })
    expect(validated.score).toBeGreaterThan(provisional.score)
  })
})

describe('accordo dell ensemble', () => {
  it('vale 1 quando i membri concordano', () => {
    // Caso reale: 122 membri sull'Amiata a +3 giorni, da 0 a 3.8 mm con mediana 0.
    expect(ensembleAgreement(0, 0, 20)).toBe(1)
    expect(ensembleAgreement(0, 3.8, 20)).toBeCloseTo(0.81, 2)
  })

  it('crolla quando i membri divergono', () => {
    expect(ensembleAgreement(0, 40, 20)).toBe(0)
  })
})

describe('aggregazione', () => {
  it('pesa le variabili per il contributo al punteggio, non in media semplice', () => {
    // Non sapere il vento quando il vento non morde non e' un problema; non sapere la pioggia si'.
    const goodRainBadWind = aggregateConfidence({
      variables: [
        { variable: 'precipitation', score: 90, components: {} },
        { variable: 'wind_speed_mean', score: 10, components: {} },
      ],
      weights: DEFAULT_VARIABLE_WEIGHTS,
    })
    const badRainGoodWind = aggregateConfidence({
      variables: [
        { variable: 'precipitation', score: 10, components: {} },
        { variable: 'wind_speed_mean', score: 90, components: {} },
      ],
      weights: DEFAULT_VARIABLE_WEIGHTS,
    })
    expect(goodRainBadWind.score).toBeGreaterThan(badRainGoodWind.score)
  })

  it('spiega quale componente sta abbassando la confidence', () => {
    const result = aggregateConfidence({
      variables: [
        { variable: 'precipitation', score: 30, components: { geometry: 0.3, horizon: 1 } },
      ],
      weights: DEFAULT_VARIABLE_WEIGHTS,
    })
    const explained = result.factors.map((f) => f.label).join(' | ')
    expect(explained).toContain('Pioggia')
    expect(explained).toMatch(/stazioni lontane/)
  })

  it('senza variabili pesate restituisce zero invece di NaN', () => {
    expect(aggregateConfidence({ variables: [], weights: {} }).score).toBe(0)
  })
})
