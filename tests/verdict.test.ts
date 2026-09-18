/**
 * Test del verdetto.
 *
 * La proprietà da proteggere è una sola: la risposta deve stare nelle parole, non nei numeri.
 * Un utente che legge solo il titolo e la frase deve sapere se uscire.
 */

import { describe, expect, it } from 'vitest'

import type { SnapshotZone } from '@/lib/snapshot/types'
import { rankZones } from '@/lib/recommend/rank'
import { bandNameFor, buildVerdict, dominantLimit, zoneFacts } from '@/lib/recommend/verdict'

const TODAY = '2026-09-17'
const fmt = (d: string): string => d

function zone(
  code: string,
  o: {
    mpi?: number
    tMean?: number | null
    optimum?: number
    water?: number
    rain26d?: number
    limit?: string | null
    series?: Array<{ date: string; mpi: number }>
  } = {},
): SnapshotZone {
  const mpi = o.mpi ?? 10
  const series = (o.series ?? [{ date: TODAY, mpi }, { date: '2026-09-18', mpi }]).map((p) => ({
    date: p.date, mpi: p.mpi, confidence: 70, dataQuality: 70, forecastCertainty: 100,
    provenance: 'MODELLED' as const, rainMm: 0, tMinC: 10, tMaxC: 20, windMs: null,
  }))
  return {
    code, name: code, reference: code, province: 'LU', municipality: null,
    latitude: 44, longitude: 10.4, elevationM: 1000, forest: ['faggeta'], stationNotes: '',
    mpi, confidence: 70, dataQuality: 70, forecastCertainty: 100,
    label: bandNameFor(mpi), limitingFactor: o.limit === undefined ? 'Temperatura' : o.limit,
    development: 0, series,
    weather: {
      rain24h: 0, rain72h: 0, rain7d: 0, rain14d: 0, rain26d: o.rain26d ?? 120,
      effectiveWaterMm: o.water ?? 100, initialDeficitMm: 0, et0_7d: 0, et0_14d: 0,
      tMean20d: o.tMean === undefined ? 19 : o.tMean, tMinWindow: 8, tMaxWindow: 24,
      soilTemperatureMean: 15, soilMoisture: 0.25, vpdMean7d: 0.6, windMean7d: 2,
    },
    positiveFactors: [], negativeFactors: [], neutralFactors: [], stations: [],
    bestWindow: null, observedDays: 60, windowDays: 61, lastObservedDate: '2026-09-16',
    thermalOptimumC: o.optimum ?? 13, lapseRateCPerKm: null,
  }
}

function verdictFor(zones: SnapshotZone[], date = TODAY) {
  return buildVerdict({
    zones,
    suggestions: rankZones(zones, { date, from: null }),
    date,
    today: TODAY,
    formatDate: fmt,
  })
}

describe('il verdetto risponde in parole', () => {
  it('dice di no quando non è giornata, e spiega quanti gradi mancano', () => {
    const v = verdictFor([zone('a', { mpi: 12, tMean: 19, optimum: 13 })])
    expect(v.tone).toBe('no')
    expect(v.headline).toBe('Oggi no.')
    expect(v.reason).toContain('troppo caldo')
    expect(v.reason).toContain('19 °C')
    expect(v.reason).toContain('6 gradi di troppo')
  })

  it('dice che il caldo è ovunque solo se lo è davvero', () => {
    const tutte = verdictFor([zone('a', { mpi: 12 }), zone('b', { mpi: 8 })])
    expect(tutte.reason).toContain('In tutta la Toscana')

    const una = verdictFor([zone('a', { mpi: 12 }), zone('b', { mpi: 45 })])
    expect(una.reason).not.toContain('In tutta la Toscana')
  })

  it('cambia tono quando le condizioni migliorano', () => {
    expect(verdictFor([zone('a', { mpi: 30 })]).tone).toBe('weak')
    expect(verdictFor([zone('a', { mpi: 50 })]).tone).toBe('worth')
    expect(verdictFor([zone('a', { mpi: 70 })]).tone).toBe('good')
    expect(verdictFor([zone('a', { mpi: 70 })]).headline).toBe('Oggi sì.')
  })

  it('quando manca acqua lo dice invece di parlare di temperatura', () => {
    const v = verdictFor([
      zone('a', { mpi: 5, limit: 'Acqua disponibile nel suolo', water: 12, rain26d: 20 }),
    ])
    expect(v.reason).toContain('Manca acqua')
    expect(v.reason).toContain('12 mm')
    expect(v.reason).not.toContain('troppo caldo')
  })

  it('suggerisce dove andare anche quando dice di no', () => {
    const v = verdictFor([zone('garfagnana', { mpi: 24, water: 113 }), zone('amiata', { mpi: 1 })])
    expect(v.advice).toContain('garfagnana')
    expect(v.advice).toContain('113 mm')
  })
})

describe('prospettiva', () => {
  it('annuncia un miglioramento solo se cambia banda', () => {
    const migliora = verdictFor([
      zone('a', {
        mpi: 15,
        series: [{ date: TODAY, mpi: 15 }, { date: '2026-09-20', mpi: 48 }],
      }),
    ])
    expect(migliora.outlook).toContain('2026-09-20')
    expect(migliora.outlook).toContain('discrete')
  })

  it('non annuncia un miglioramento che resta nella stessa banda', () => {
    // Passare da 12 a 18 non cambia la decisione di nessuno.
    const piatto = verdictFor([
      zone('a', {
        mpi: 12,
        series: [{ date: TODAY, mpi: 12 }, { date: '2026-09-20', mpi: 18 }],
      }),
    ])
    expect(piatto.outlook).toMatch(/non cambia|non si vede/)
  })
})

describe('fattore limitante condiviso', () => {
  it('lo riconosce quando riguarda la maggioranza', () => {
    expect(dominantLimit([zone('a'), zone('b'), zone('c')])).toBe('Temperatura')
  })

  it('non lo dichiara quando le zone non concordano', () => {
    expect(
      dominantLimit([
        zone('a', { limit: 'Temperatura' }),
        zone('b', { limit: 'Acqua disponibile nel suolo' }),
      ]),
    ).toBeNull()
  })
})

describe('fatti della zona, in parole', () => {
  it('separa cosa funziona da cosa manca', () => {
    const facts = zoneFacts(zone('a', { water: 113, tMean: 19.5, optimum: 13.4 }))
    expect(facts.good).toContain("L'acqua c'è")
    expect(facts.good).toContain('113 mm')
    expect(facts.bad).toContain('Manca il fresco')
    expect(facts.bad).toContain('19')
  })

  it('quando va tutto bene non inventa un difetto', () => {
    const facts = zoneFacts(zone('a', { water: 90, tMean: 13, optimum: 13 }))
    expect(facts.good).not.toBeNull()
    expect(facts.bad).toBeNull()
  })

  it('quando manca l acqua non dichiara un punto di forza falso', () => {
    const facts = zoneFacts(zone('a', { water: 10, tMean: 13, optimum: 13 }))
    expect(facts.bad).toContain('Manca acqua')
  })
})

describe('nomi delle bande', () => {
  it('coprono tutta la scala senza buchi', () => {
    expect(bandNameFor(0)).toBe('sfavorevoli')
    expect(bandNameFor(19.9)).toBe('sfavorevoli')
    expect(bandNameFor(20)).toBe('poco favorevoli')
    expect(bandNameFor(59)).toBe('discrete')
    expect(bandNameFor(100)).toBe('molto favorevoli')
  })

  it('nessun nome suggerisce la presenza di funghi', () => {
    const forbidden = /fungh|porcin|trover|garantit|abbondan/i
    for (let mpi = 0; mpi <= 100; mpi += 5) {
      expect(bandNameFor(mpi)).not.toMatch(forbidden)
    }
  })
})

describe('coerenza fra verdetto e schede', () => {
  it('non dice "manca acqua" di una zona che l acqua ce l ha', () => {
    // Caso reale del 17 settembre: la Garfagnana era la zona migliore, limitata dalla
    // temperatura, mentre la maggioranza delle zone era limitata dall'acqua. Usando il fattore
    // della maggioranza il verdetto scriveva «manca acqua: 97 mm» e la scheda subito sotto
    // «l'acqua c'è: 97 mm». Due frasi opposte sullo stesso numero.
    const zones = [
      zone('garfagnana', { mpi: 24, water: 97, tMean: 19.3, optimum: 13.4, limit: 'Temperatura' }),
      zone('amiata', { mpi: 1, water: 10, limit: 'Acqua disponibile nel suolo' }),
      zone('metallifere', { mpi: 1, water: 8, limit: 'Acqua disponibile nel suolo' }),
    ]
    const v = verdictFor(zones)
    const facts = zoneFacts(zones[0] as SnapshotZone)

    expect(v.reason).not.toContain('Manca acqua')
    expect(v.reason).toContain('troppo caldo')
    expect(facts.good).toContain("L'acqua c'è")
    // E il verdetto non generalizza a tutta la regione un limite che non è condiviso.
    expect(v.reason).not.toContain('In tutta la Toscana')
  })

  it('generalizza solo quando il limite è davvero lo stesso ovunque', () => {
    const v = verdictFor([
      zone('a', { mpi: 8, limit: 'Temperatura', tMean: 21 }),
      zone('b', { mpi: 6, limit: 'Temperatura', tMean: 22 }),
    ])
    expect(v.reason).toContain('In tutta la Toscana')
  })
})
