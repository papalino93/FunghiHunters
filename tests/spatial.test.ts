/**
 * Test dell'interpolazione spaziale.
 *
 * I casi non sono inventati: sono le configurazioni reali delle zone di taratura in cui il
 * criterio "stazione piu' vicina" sbaglia, misurate sull'anagrafica SIR il 2026-09-17.
 */

import { describe, expect, it } from 'vitest'

import { ALGORITHM_V1 } from '@/lib/config/algorithm'
import {
  type StationSample,
  effectiveDistanceKm,
  fitTrend,
  interpolate,
  selectNeighbours,
} from '@/lib/spatial/interpolate'
import { fitLinear, predictLinear, solveLinearSystem } from '@/lib/spatial/regression'
import { crossValidate, meanNearestDistanceKm } from '@/lib/spatial/validate'

function sample(
  code: string,
  lat: number,
  lon: number,
  elevationM: number,
  value: number,
): StationSample {
  return { stationCode: code, latitude: lat, longitude: lon, elevationM, value, validated: false }
}

describe('algebra lineare', () => {
  it('risolve un sistema ben condizionato', () => {
    const solution = solveLinearSystem(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10],
    )
    expect(solution?.[0]).toBeCloseTo(1, 10)
    expect(solution?.[1]).toBeCloseTo(3, 10)
  })

  it('restituisce null su matrice singolare invece di propagare NaN', () => {
    expect(
      solveLinearSystem(
        [
          [1, 2],
          [2, 4],
        ],
        [3, 6],
      ),
    ).toBeNull()
  })

  it('ritrova una relazione lineare esatta', () => {
    // y = 10 - 0.0065 * quota, che e' il gradiente termico standard.
    const samples = [200, 500, 800, 1100, 1400].map((z) => ({ x: [z], y: 10 - 0.0065 * z }))
    const model = fitLinear(samples, 0)
    expect(model).not.toBeNull()
    expect(model?.coefficients[0]).toBeCloseTo(10, 6)
    expect(model?.coefficients[1]).toBeCloseTo(-0.0065, 8)
    expect(model?.r2).toBeCloseTo(1, 6)
  })

  it('la regolarizzazione evita l esplosione quando i predittori sono collineari', () => {
    // Tutte le stazioni alla stessa quota: la colonna e' costante e il sistema sarebbe singolare.
    const samples = [12, 13, 11, 14].map((y, i) => ({ x: [900, 43 + i * 0.01], y }))
    const model = fitLinear(samples, 1e-6)
    expect(model).not.toBeNull()
    for (const coefficient of model?.coefficients ?? []) {
      expect(Number.isFinite(coefficient)).toBe(true)
      expect(Math.abs(coefficient)).toBeLessThan(1e6)
    }
  })
})

describe('distanza efficace', () => {
  const target = { latitude: 44.1833, longitude: 10.3833, elevationM: 1000 }

  it('penalizza il dislivello quanto la distanza', () => {
    // Con 0.01 km/m, 100 metri di quota valgono un chilometro.
    const sameElevation = effectiveDistanceKm(target, {
      latitude: 44.1833,
      longitude: 10.3833,
      elevationM: 1000,
    })
    const belowBy500 = effectiveDistanceKm(target, {
      latitude: 44.1833,
      longitude: 10.3833,
      elevationM: 500,
    })
    expect(sameElevation).toBe(0)
    expect(belowBy500).toBeCloseTo(5, 6)
  })

  it('il caso Garfagnana: la piu vicina non e la migliore', () => {
    // Villacollemandina (Diga): 2.6 km ma 502 m piu' in basso.
    // Orecchiella: 2.7 km e 169 m di dislivello.
    const diga = sample('TOS10000200', 44.1655, 10.3675, 498, 0)
    const orecchiella = sample('TOS11000097', 44.2005, 10.3985, 1169, 0)

    const dDiga = effectiveDistanceKm(target, diga)
    const dOrecchiella = effectiveDistanceKm(target, orecchiella)

    expect(dOrecchiella).toBeLessThan(dDiga)
    const chosen = selectNeighbours(target, [diga, orecchiella])[0]
    expect(chosen?.sample.stationCode).toBe('TOS11000097')
  })

  it('il caso Appennino pistoiese: 200 metri ma 407 di dislivello', () => {
    const pistoiese = { latitude: 44.1, longitude: 10.75, elevationM: 1000 }
    // Casotti di Cutigliano: praticamente addosso, ma 407 m piu' in basso.
    const casotti = sample('TOS02004215', 44.1015, 10.7515, 593, 0)
    // Melo: 3.7 km e alla stessa quota esatta.
    const melo = sample('TOS02000359', 44.1155, 10.7095, 1000, 0)

    const chosen = selectNeighbours(pistoiese, [casotti, melo])[0]
    expect(chosen?.sample.stationCode).toBe('TOS02000359')
  })
})

describe('stima del trend', () => {
  it('ritrova il gradiente verticale dai dati del giorno', () => {
    const samples = [
      sample('A', 44.0, 10.5, 300, 22),
      sample('B', 44.1, 10.6, 600, 20),
      sample('C', 44.2, 10.7, 900, 18),
      sample('D', 43.9, 10.4, 1200, 16),
      sample('E', 44.05, 10.55, 1500, 14),
      sample('F', 44.15, 10.65, 450, 21),
    ]
    const trend = fitTrend(samples)
    expect(trend).not.toBeNull()
    // Circa -6.7 gradi per chilometro, dedotto e non assunto.
    expect(trend?.coefficients[1]).toBeCloseTo(-0.00667, 3)
    expect(trend?.r2).toBeGreaterThan(0.99)
  })

  it('riconosce anche un inversione termica, che una costante sbaglierebbe', () => {
    // Nelle notti serene il fondovalle e' piu' freddo della costa di mezzo: il gradiente
    // cambia segno, ed e' proprio la situazione che conta per la gelata.
    const samples = [
      sample('A', 44.0, 10.5, 300, 2),
      sample('B', 44.1, 10.6, 600, 5),
      sample('C', 44.2, 10.7, 900, 7),
      sample('D', 43.9, 10.4, 1200, 8),
      sample('E', 44.05, 10.55, 1500, 9),
      sample('F', 44.15, 10.65, 450, 3.5),
    ]
    const trend = fitTrend(samples)
    expect(trend?.coefficients[1]).toBeGreaterThan(0)
  })

  it('non stima il trend con troppe poche stazioni', () => {
    const few = [
      sample('A', 44.0, 10.5, 300, 22),
      sample('B', 44.1, 10.6, 600, 20),
      sample('C', 44.2, 10.7, 900, 18),
    ]
    // Meglio dichiarare un dato modellato che spacciare per osservata una regressione su tre punti.
    expect(fitTrend(few)).toBeNull()
  })
})

describe('interpolazione', () => {
  const grid = [
    sample('A', 44.0, 10.5, 300, 22),
    sample('B', 44.1, 10.6, 600, 20),
    sample('C', 44.2, 10.7, 900, 18),
    sample('D', 43.9, 10.4, 1200, 16),
    sample('E', 44.05, 10.55, 1500, 14),
    sample('F', 44.15, 10.65, 450, 21),
  ]

  it('corregge il valore alla quota reale della cella', () => {
    const high = interpolate({
      variable: 'temperature_max',
      target: { latitude: 44.08, longitude: 10.58, elevationM: 1400 },
      samples: grid,
      modelValue: null,
    })
    const low = interpolate({
      variable: 'temperature_max',
      target: { latitude: 44.08, longitude: 10.58, elevationM: 400 },
      samples: grid,
      modelValue: null,
    })
    expect(high.value).not.toBeNull()
    expect(low.value).not.toBeNull()
    expect(high.value as number).toBeLessThan(low.value as number)
    expect(high.lapseRatePerM).toBeLessThan(0)
    expect(high.method).toBe('regression-idw')
  })

  it('riproduce il valore osservato quando il punto coincide con una stazione', () => {
    const result = interpolate({
      variable: 'temperature_max',
      target: { latitude: 44.1, longitude: 10.6, elevationM: 600 },
      samples: grid,
      modelValue: null,
    })
    expect(result.value).toBeCloseTo(20, 0)
  })

  it('non produce pioggia negativa', () => {
    const rain = [
      sample('A', 44.0, 10.5, 300, 0),
      sample('B', 44.1, 10.6, 600, 0),
      sample('C', 44.2, 10.7, 900, 40),
      sample('D', 43.9, 10.4, 1200, 0),
      sample('E', 44.05, 10.55, 1500, 0),
      sample('F', 44.15, 10.65, 450, 0),
    ]
    const result = interpolate({
      variable: 'precipitation',
      target: { latitude: 43.8, longitude: 10.3, elevationM: 200 },
      samples: rain,
      modelValue: null,
      nonNegative: true,
    })
    expect(result.value).toBeGreaterThanOrEqual(0)
  })

  it('ricade sul modello quando non ci sono stazioni utili', () => {
    const result = interpolate({
      variable: 'temperature_max',
      target: { latitude: 40, longitude: 5, elevationM: 100 },
      samples: grid,
      modelValue: 19.5,
    })
    expect(result.value).toBe(19.5)
    expect(result.method).toBe('model-only')
    expect(result.provenance).toBe('MODELLED')
    expect(result.observedWeight).toBe(0)
  })

  it('la fusione col modello pesa l osservato secondo la distanza', () => {
    const close = interpolate({
      variable: 'temperature_max',
      target: { latitude: 44.1, longitude: 10.6, elevationM: 600 },
      samples: grid,
      modelValue: 30,
    })
    const far = interpolate({
      variable: 'temperature_max',
      target: { latitude: 44.6, longitude: 11.2, elevationM: 600 },
      samples: grid,
      modelValue: 30,
    })
    expect(close.observedWeight).toBeGreaterThan(far.observedWeight)
    // Vicino a una stazione il valore e' sostanzialmente una misura...
    expect(close.provenance).toBe('OBSERVED')
    // ...lontano diventa sostanzialmente un modello, e va dichiarato.
    expect(far.observedWeight).toBeLessThan(close.observedWeight)
  })

  it('riporta le stazioni usate con i loro pesi, per il confidence', () => {
    const result = interpolate({
      variable: 'temperature_max',
      target: { latitude: 44.08, longitude: 10.58, elevationM: 800 },
      samples: grid,
      modelValue: null,
    })
    expect(result.neighbours.length).toBeGreaterThan(0)
    for (const neighbour of result.neighbours) {
      expect(neighbour.effectiveKm).toBeGreaterThanOrEqual(neighbour.distanceKm)
      expect(neighbour.weight).toBeGreaterThan(0)
    }
    // I vicini arrivano ordinati dal piu' rappresentativo.
    const distances = result.neighbours.map((n) => n.effectiveKm)
    expect([...distances].sort((a, b) => a - b)).toEqual(distances)
  })
})

describe('validazione incrociata', () => {
  it('batte la stazione piu vicina su un campo con gradiente verticale', () => {
    // E' la giustificazione dello schema: se non battesse il nearest neighbour, la complessita'
    // in piu' non sarebbe giustificata e sarebbe onesto dirlo.
    const samples = [300, 450, 600, 900, 1100, 1200, 1500, 800].map((z, i) =>
      sample(`S${i}`, 44 + i * 0.02, 10.5 + i * 0.03, z, 22 - 0.0065 * z),
    )
    const report = crossValidate('temperature_max', samples)
    expect(report).not.toBeNull()
    expect(report?.mae).toBeLessThan(report?.nearestMae ?? 0)
    expect(report?.improvementPct).toBeGreaterThan(0)
  })

  it('non si esprime con troppe poche stazioni', () => {
    expect(crossValidate('temperature_max', [sample('A', 44, 10.5, 300, 20)])).toBeNull()
  })

  it('misura la densita della rete', () => {
    const samples = [
      sample('A', 44.0, 10.5, 300, 0),
      sample('B', 44.1, 10.5, 300, 0),
    ]
    // Un decimo di grado di latitudine e' circa 11 km.
    expect(meanNearestDistanceKm(samples)).toBeCloseTo(11.1, 0)
  })
})

describe('coerenza con la configurazione versionata', () => {
  it('i parametri spaziali sono tutti dichiarati da calibrare', () => {
    // Nessuno di questi viene da una fonte: sono scelte operative, e vanno mostrate come tali.
    for (const param of Object.values(ALGORITHM_V1.spatial)) {
      expect(param.provenance).toBe('calibrate')
    }
  })

  it('predictLinear e coerente con i coefficienti stimati', () => {
    const model = fitLinear(
      [200, 500, 800, 1100].map((z) => ({ x: [z], y: 10 - 0.0065 * z })),
      0,
    )
    expect(model).not.toBeNull()
    if (model !== null) {
      expect(predictLinear(model, [1000])).toBeCloseTo(10 - 6.5, 6)
    }
  })
})
