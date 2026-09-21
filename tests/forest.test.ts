/**
 * Test del termine habitat: il bosco dentro il punteggio.
 *
 * Le asserzioni interessanti non sono i numeri, sono le tre regole che il termine deve rispettare
 * e che era facile violare scrivendolo:
 *
 *   1. una zona senza bosco misurato non perde punti rispetto a una misurata;
 *   2. non sapere *che* bosco sia costa confidence, non punteggio;
 *   3. il termine si vede anche dove il punteggio satura, che e' il caso in cui serve.
 */

import { describe, expect, it } from 'vitest'

import { ALGORITHM_V1 } from '@/lib/config/algorithm'
import { addDays } from '@/lib/domain/time'
import { buildFeatures, type CellContext, type DailyWeather } from '@/lib/model/features'
import { habitatSuitability, type ForestHabitat } from '@/lib/model/forest'
import { computeMpi } from '@/lib/model/mpi'
import { explainScore } from '@/lib/model/explain'

/** Serie autunnale con acqua abbondante: il caso in cui il punteggio tende a saturare. */
function wetAutumn(): DailyWeather[] {
  const days: DailyWeather[] = []
  const rain: Readonly<Record<number, number>> = { 20: 30, 19: 22, 14: 26, 13: 14, 8: 24, 7: 18 }
  for (let i = 44; i >= 0; i -= 1) {
    days.push({
      date: addDays('2026-10-10', -i),
      precipitationMm: rain[i] ?? 0,
      temperatureMaxC: 18,
      temperatureMinC: 8,
      et0Mm: 1.8,
      soilMoisture: 0.33,
      soilTemperatureC: 14,
      vpdKpa: 0.5,
      windMs: 2,
      relativeHumidityPercent: 70,
      provenance: 'OBSERVED',
    })
  }
  return days
}

function cellWith(forest: ForestHabitat | null): CellContext {
  return { elevationM: 1000, aspectDeg: null, slopeDeg: null, canopyDensity: null, forest }
}

function scoreWith(forest: ForestHabitat | null): number {
  const cell = cellWith(forest)
  return computeMpi({ features: buildFeatures(wetAutumn(), cell, ALGORITHM_V1), cell }).mpi
}

const BEECH: ForestHabitat = { forestFraction: 0.8, shares: { faggeta: 1 } }
const BARE: ForestHabitat = { forestFraction: 0.02, shares: { faggeta: 1 } }

describe('il bosco nel punteggio', () => {
  it('lascia il termine neutro dove il bosco non e\' misurato', () => {
    const result = habitatSuitability(null, ALGORITHM_V1)
    expect(result.factor).toBe(1)
    expect(result.measured).toBe(false)
    expect(result.certainty).toBe(1)
    // Regola 1: chi non ha il dato non deve risultare peggiore di chi ce l'ha.
    expect(scoreWith(null)).toBe(scoreWith(BEECH))
  })

  it('non toglie nulla a una faggeta estesa', () => {
    const result = habitatSuitability(BEECH, ALGORITHM_V1)
    expect(result.cover).toBe(1)
    expect(result.host).toBe(1)
    expect(result.factor).toBe(1)
  })

  it('distingue due zone che altrimenti segnerebbero lo stesso punteggio', () => {
    // Regola 3: con questa serie il punteggio satura, e prima di questa versione le due zone
    // uscivano identiche. E' il caso delle 230 zone appaiate a 100 del 21 settembre 2026.
    const wooded = scoreWith(BEECH)
    const bare = scoreWith(BARE)
    expect(wooded).toBe(100)
    expect(bare).toBeLessThan(wooded)
    // Il pavimento e' 0.6: una zona spoglia perde al massimo il 40%, non tutto.
    expect(bare).toBeGreaterThanOrEqual(wooded * 0.6 - 0.1)
  })

  it('scala la copertura in modo continuo fino alla soglia di riferimento', () => {
    const at = (fraction: number): number =>
      habitatSuitability({ forestFraction: fraction, shares: { faggeta: 1 } }, ALGORITHM_V1).cover
    expect(at(0)).toBeCloseTo(0.6, 6)
    expect(at(0.2)).toBeCloseTo(0.8, 6)
    expect(at(0.4)).toBeCloseTo(1, 6)
    expect(at(0.9)).toBeCloseTo(1, 6)
  })

  it('mette il lariceto sotto la faggeta a parita\' di meteo e copertura', () => {
    const larch = scoreWith({ forestFraction: 0.8, shares: { lariceto: 1 } })
    expect(larch).toBeLessThan(scoreWith(BEECH))
    expect(larch).toBeCloseTo(70, 0)
  })

  it('pesa i tipi sulla loro estensione, non sul numero di nomi', () => {
    const mixed = habitatSuitability(
      { forestFraction: 0.8, shares: { faggeta: 0.9, lariceto: 0.1 } },
      ALGORITHM_V1,
    )
    expect(mixed.host).toBeCloseTo(0.97, 6)
  })

  it('fa pagare l\'incertezza della mappa alla confidence, non al punteggio', () => {
    // Regola 2, nel caso puro: un tipo che la tabella non conosce resta neutro nel punteggio
    // e si vede solo nella certezza.
    const unknown = habitatSuitability(
      { forestFraction: 0.8, shares: { 'bosco che non esiste': 1 } },
      ALGORITHM_V1,
    )
    expect(unknown.factor).toBe(1)
    expect(unknown.certainty).toBeLessThan(1)

    // E nelle classi generiche della fonte: la certezza scende in proporzione alla loro quota.
    const generic = habitatSuitability(
      { forestFraction: 0.8, shares: { 'altre latifoglie': 1 } },
      ALGORITHM_V1,
    )
    expect(generic.certainty).toBeCloseTo(0.85, 6)
    const half = habitatSuitability(
      { forestFraction: 0.8, shares: { faggeta: 0.5, 'altre latifoglie': 0.5 } },
      ALGORITHM_V1,
    )
    expect(half.certainty).toBeCloseTo(0.925, 6)
    expect(habitatSuitability(BEECH, ALGORITHM_V1).certainty).toBe(1)
  })

  it('regge una zona senza un solo albero senza produrre NaN', () => {
    const none = habitatSuitability({ forestFraction: 0, shares: {} }, ALGORITHM_V1)
    expect(Number.isFinite(none.factor)).toBe(true)
    expect(none.host).toBe(1)
    expect(none.cover).toBeCloseTo(0.6, 6)
    expect(none.certainty).toBe(1)
  })

  it('moltiplica anche il punteggio grezzo, quello che ordina i pari merito', () => {
    const cell = cellWith(BARE)
    const full = cellWith(BEECH)
    const bare = computeMpi({ features: buildFeatures(wetAutumn(), cell, ALGORITHM_V1), cell })
    const wooded = computeMpi({ features: buildFeatures(wetAutumn(), full, ALGORITHM_V1), cell: full })
    expect(bare.rawMpi).toBeLessThan(wooded.rawMpi)
    // Copertura 2% su una soglia del 40%: 0.6 + 0.4 * 0.05 = 0.62, non il pavimento secco.
    expect(bare.rawMpi / wooded.rawMpi).toBeCloseTo(0.62, 2)
  })
})

describe('il bosco nella spiegazione', () => {
  it('compare fra i fattori solo dove e\' misurato, e dice quanto pesa', () => {
    const cell = cellWith(BARE)
    const features = buildFeatures(wetAutumn(), cell, ALGORITHM_V1)
    const result = computeMpi({ features, cell })
    const explained = explainScore(result, features, 70)

    const all = [
      ...explained.positiveFactors,
      ...explained.negativeFactors,
      ...explained.neutralFactors,
    ]
    const habitat = all.find((f) => f.key === 'habitat')
    expect(habitat).toBeDefined()
    expect(habitat?.contribution).toBeLessThan(0)
    expect(habitat?.value).toContain('2%')
    expect(explained.limitingFactor).toBe('Il bosco della zona')

    const blind = cellWith(null)
    const blindFeatures = buildFeatures(wetAutumn(), blind, ALGORITHM_V1)
    const blindExplained = explainScore(
      computeMpi({ features: blindFeatures, cell: blind }),
      blindFeatures,
      70,
    )
    const names = [
      ...blindExplained.positiveFactors,
      ...blindExplained.negativeFactors,
      ...blindExplained.neutralFactors,
    ].map((f) => f.key)
    expect(names).not.toContain('habitat')
    expect(blindExplained.limitingFactor).not.toBe('Il bosco della zona')
  })
})
