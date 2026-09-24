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
    negativeFactors?: Array<{ key: string; label: string; contribution: number }>
    forest?: readonly string[]
    forestFraction?: number
    /** `true` per una zona tarata sulle stazioni (le sette toscane), `false` per solo modello. */
    withStations?: boolean
  } = {},
): SnapshotZone {
  const mpi = o.mpi ?? 10
  const series = (o.series ?? [{ date: TODAY, mpi }, { date: '2026-09-18', mpi }]).map((p) => ({
    date: p.date, mpi: p.mpi, confidence: 70, dataQuality: 70, forecastCertainty: 100,
    provenance: 'MODELLED' as const, rainMm: 0, tMinC: 10, tMaxC: 20, windMs: null,
  }))
  return {
    code, name: code, reference: code, province: 'LU', municipality: null,
    latitude: 44, longitude: 10.4, elevationM: 1000, forest: o.forest ?? ['faggeta'], stationNotes: '',
    ...(o.forestFraction === undefined ? {} : { forestFraction: o.forestFraction }),
    mpi, confidence: 70, dataQuality: 70, forecastCertainty: 100,
    label: bandNameFor(mpi), limitingFactor: o.limit === undefined ? 'Temperatura' : o.limit,
    development: 0, series, nearbyMunicipalities: [],
    weather: {
      rain24h: 0, rain72h: 0, rain7d: 0, rain14d: 0, rain26d: o.rain26d ?? 120,
      effectiveWaterMm: o.water ?? 100, initialDeficitMm: 0, et0_7d: 0, et0_14d: 0,
      tMean20d: o.tMean === undefined ? 19 : o.tMean, tMinWindow: 8, tMaxWindow: 24,
      soilTemperatureMean: 15, soilMoisture: 0.25, vpdMean7d: 0.6, windMean7d: 2, humidityMean7d: 70,
    },
    positiveFactors: [],
    negativeFactors: (o.negativeFactors ?? []).map((f) => ({
      ...f,
      value: '',
      provenance: 'calibrate' as const,
    })),
    neutralFactors: [],
    stations: o.withStations === true
      ? [{ code: 's1', name: 'Stazione', latitude: 44, longitude: 10.4, elevationM: 900, distanceKm: 3,
          elevationDiffM: 100, effectiveKm: 4, variable: 'pioggia' }]
      : [],
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

  it('sotto l ottimo parla di freddo, non di caldo che manca', () => {
    /*
     * Novembre in quota: la media a 20 giorni scende sotto l'ottimo. Prima usciva «fa ancora
     * troppo caldo: 5 °C ... Sono -8 gradi di troppo», cioè il contrario del numero citato nella
     * stessa frase — ed è la coda della stagione dei porcini, non un caso di laboratorio.
     */
    const v = verdictFor([zone('gelo', { mpi: 12, tMean: 5, optimum: 13 })])
    expect(v.reason).toContain('troppo freddo')
    expect(v.reason).not.toContain('troppo caldo')
    expect(v.reason).toContain('8 gradi sotto')
    expect(v.reason).not.toContain('-8')
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
    expect(verdictFor([zone('a', { mpi: 70, withStations: true })]).headline).toBe('Oggi sì.')
  })

  it('senza stazioni un verdetto positivo dice che viene dal solo modello', () => {
    const good = verdictFor([zone('a', { mpi: 98 })])
    expect(good.tone).toBe('good')
    expect(good.modelOnly).toBe(true)
    expect(good.headline).toBe('Oggi buone condizioni, secondo il modello.')
    expect(verdictFor([zone('a', { mpi: 50 })]).headline).toContain('secondo il modello')
    // Un no resta un no: non serve ammorbidirlo.
    expect(verdictFor([zone('a', { mpi: 10 })]).headline).toBe('Oggi no.')
    expect(verdictFor([zone('a', { mpi: 70, withStations: true })]).modelOnly).toBe(false)
  })

  it('non propone come giorno migliore il giorno stesso di cui parla', () => {
    // Serie piatta a 98 da oggi: il vecchio confronto con il primo giorno di storia diceva
    // «meglio 2026-09-17» proprio il 17.
    const flat = zone('carrega', {
      mpi: 98,
      series: [
        { date: '2026-08-01', mpi: 20 },
        { date: TODAY, mpi: 98 },
        { date: '2026-09-18', mpi: 98 },
      ],
    })
    expect(verdictFor([flat]).advice).toBe('Il posto più indicato è carrega.')
    const later = zone('carrega', {
      mpi: 60,
      series: [
        { date: TODAY, mpi: 60 },
        { date: '2026-09-18', mpi: 80 },
      ],
    })
    expect(verdictFor([later]).advice).toBe('Il posto più indicato è carrega, meglio 2026-09-18.')
  })

  it('un verdetto positivo spiega cosa lo rende positivo e non si contraddice', () => {
    const z = zone('mugello', { mpi: 64, tMean: 19, optimum: 13, withStations: true })
    const withRain = {
      ...z,
      series: [
        { ...z.series[0]!, date: '2026-09-03', rainMm: 36 },
        { ...z.series[0]!, date: TODAY, mpi: 64 },
      ],
    }
    const v = verdictFor([withRain])
    expect(v.headline).toBe('Oggi sì.')
    expect(v.reason).toContain('pioggia forte di 14 giorni fa')
    expect(v.reason).toContain('Il freno è la temperatura')
    expect(v.reason).not.toContain('troppo caldo')
  })

  it('annuncia il calo quando la finestra si chiude, invece di «il quadro non cambia»', () => {
    const z = zone('mugello', {
      mpi: 64,
      withStations: true,
      series: [
        { date: TODAY, mpi: 64 },
        { date: '2026-09-18', mpi: 60 },
        { date: '2026-09-19', mpi: 40 },
        { date: '2026-09-20', mpi: 30 },
      ],
    })
    expect(verdictFor([z]).outlook).toBe('Da 2026-09-19 cala a condizioni discrete, se non torna a piovere.')
  })

  it('con due zone quasi pari non dice che una è l unica', () => {
    const v = verdictFor([zone('pratomagno', { mpi: 19, water: 42 }), zone('garfagnana', { mpi: 18 })])
    expect(v.advice).not.toContain("l'unica")
    expect(v.advice).toContain('messa meglio')
  })

  it('quando manca acqua lo dice invece di parlare di temperatura', () => {
    const v = verdictFor([
      zone('a', { mpi: 5, limit: 'Acqua disponibile nel suolo', water: 12, rain26d: 20 }),
    ])
    expect(v.reason).toContain('Manca acqua')
    expect(v.reason).toContain('12 mm')
    expect(v.reason).not.toContain('troppo caldo')
  })

  it('nomina un secondo fattore quando pesa quasi quanto il primo', () => {
    const v = verdictFor([
      zone('a', {
        mpi: 12,
        tMean: 19,
        optimum: 13,
        negativeFactors: [
          { key: 'thermal', label: 'Temperatura', contribution: -20 },
          { key: 'water', label: 'Acqua disponibile nel suolo', contribution: -12 },
        ],
      }),
    ])
    expect(v.reason).toContain('troppo caldo')
    expect(v.reason).toContain('Pesa anche acqua disponibile nel suolo')
  })

  it('non nomina un secondo fattore quando il primo non è nella lista dei negativi', () => {
    // `negativeFactors` usa una soglia più stretta di `limitingFactor`: può non contenere affatto
    // il fattore nominato dalla frase. Senza un fattore "primario" vero da confrontare, la frase
    // non deve inventare un secondo motivo prendendo il primo della lista a caso.
    const v = verdictFor([
      zone('a', {
        mpi: 12,
        tMean: 19,
        optimum: 13,
        negativeFactors: [{ key: 'wind', label: 'Vento', contribution: -20 }],
      }),
    ])
    expect(v.reason).toContain('troppo caldo')
    expect(v.reason).not.toContain('Pesa anche')
  })

  it('non nomina un secondo fattore che è solo una nota a margine', () => {
    const v = verdictFor([
      zone('a', {
        mpi: 12,
        tMean: 19,
        optimum: 13,
        negativeFactors: [
          { key: 'thermal', label: 'Temperatura', contribution: -20 },
          { key: 'wind', label: 'Vento', contribution: -3 },
        ],
      }),
    ])
    expect(v.reason).not.toContain('Pesa anche')
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

  it('sotto l ottimo il difetto è il freddo, non il fresco che manca', () => {
    const facts = zoneFacts(zone('a', { water: 113, tMean: 4.5, optimum: 13.4 }))
    expect(facts.bad).toContain('Troppo freddo')
    expect(facts.bad).not.toContain('Manca il fresco')
    expect(facts.bad).toContain('4,5')
  })

  it('quando acqua e temperatura sono entrambe scomode, nomina quella che il modello dice davvero limitante', () => {
    // Caso reale di Garfagnana, 21/9: acqua sotto soglia (43mm) e temperatura sopra soglia
    // (18.9°C contro ottimo 13°C, diff 5.9°C) capitano insieme, ma la campana asimmetrica
    // (sigmaWarmC=7.5) fa sì che il modello consideri l'acqua il vero limite. Prima del fix
    // questa frase diceva sempre "Manca il fresco", mentre "Perché" sotto diceva "il limite
    // principale resta acqua disponibile nel suolo" — due risposte opposte alla stessa domanda.
    const facts = zoneFacts(
      zone('garfagnana', {
        water: 43,
        tMean: 18.9,
        optimum: 13,
        limit: 'Acqua disponibile nel suolo',
      }),
    )
    expect(facts.bad).toContain('Manca acqua')
    expect(facts.bad).not.toContain('Manca il fresco')
  })

  it('quando entrambe sono scomode ma il modello dice temperatura, resta la temperatura', () => {
    const facts = zoneFacts(
      zone('a', { water: 10, tMean: 19, optimum: 13, limit: 'Temperatura' }),
    )
    expect(facts.bad).toContain('Manca il fresco')
  })

  it('dice che il limite è il bosco quando il bosco è poco', () => {
    // Acqua e temperatura a posto: senza questa riga la scheda avrebbe detto solo "L'acqua c'è",
    // con "Limite: Bosco" scritto sotto e nessuna spiegazione.
    const facts = zoneFacts(
      zone('bormio', {
        water: 90,
        tMean: 13,
        optimum: 13,
        limit: 'Il bosco della zona',
        forestFraction: 0.12,
      }),
    )
    expect(facts.good).toContain("L'acqua c'è")
    expect(facts.bad).toContain('Poco bosco')
    expect(facts.bad).toContain('12%')
  })

  it('distingue il bosco poco esteso dal bosco poco adatto', () => {
    const facts = zoneFacts(
      zone('lariceto', {
        water: 90,
        tMean: 13,
        optimum: 13,
        limit: 'Il bosco della zona',
        forestFraction: 0.85,
        forest: ['lariceto'],
      }),
    )
    expect(facts.bad).toContain('poco adatto')
    expect(facts.bad).toContain('lariceto')
    expect(facts.bad).not.toContain('Poco bosco')
  })

  it('non nomina il bosco dove non è lui il limite', () => {
    const facts = zoneFacts(
      zone('a', { water: 10, tMean: 13, optimum: 13, forestFraction: 0.05 }),
    )
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

describe('il bosco come limite, solo quando lo è davvero', () => {
  it('non chiama «poco adatta» una faggeta estesa', () => {
    const facts = zoneFacts(
      zone('moggio', {
        water: 61,
        tMean: 15,
        optimum: 15,
        limit: 'Il bosco della zona',
        forestFraction: 0.84,
        forest: ['faggeta'],
      }),
    )
    expect(facts.bad).toBeNull()
  })

  it('nomina solo i tipi di bosco che il modello pesa meno', () => {
    const facts = zoneFacts(
      zone('misto', {
        water: 90,
        tMean: 13,
        optimum: 13,
        limit: 'Il bosco della zona',
        forestFraction: 0.8,
        forest: ['faggeta', 'lariceto'],
      }),
    )
    expect(facts.bad).toBe('Bosco poco adatto al porcino: lariceto')
  })
})
