/**
 * Test del motore MPI con fixture meteorologiche costruite.
 *
 * Sono sintetiche per necessita': servono scenari controllati in cui una sola cosa cambia alla
 * volta, e il meteo reale non li offre mai puliti. Gli ordini di grandezza sono pero' quelli
 * dell'Appennino toscano, e gli scenari sono quelli richiesti dalla specifica: molta pioggia con
 * temperatura ottimale, molta pioggia con caldo estremo, assenza di pioggia, pioggia dopo lunga
 * siccita', pioggia con vento forte, gelata precoce.
 */

import { describe, expect, it } from 'vitest'

import { ALGORITHM_V1, uncalibratedParams } from '@/lib/config/algorithm'
import { addDays } from '@/lib/domain/time'
import { buildFeatures, detectRainEvents, maxThermalDrop, type CellContext, type DailyWeather } from '@/lib/model/features'
import { computeMpi, dayOfYear, gaussian, mpiLabel, seasonBlend, MPI_LABELS } from '@/lib/model/mpi'
import { explainScore } from '@/lib/model/explain'
import { dailyDecay, initialDeficit, southness, waterBalance } from '@/lib/model/water'

const AUTUMN_CELL: CellContext = {
  elevationM: 1000,
  aspectDeg: null,
  slopeDeg: null,
  canopyDensity: null,
}

interface ScenarioOptions {
  readonly endDate?: string
  readonly days?: number
  readonly tMax?: number
  readonly tMin?: number
  readonly et0?: number
  readonly wind?: number
  readonly vpd?: number
  readonly soilMoisture?: number
  readonly soilTemperature?: number
  /** Pioggia per giorno, indicizzata da quanti giorni fa. */
  readonly rainByDaysAgo?: Readonly<Record<number, number>>
  readonly baseRain?: number
}

/** Costruisce una serie giornaliera sintetica che termina a `endDate`. */
function scenario(options: ScenarioOptions = {}): DailyWeather[] {
  const endDate = options.endDate ?? '2026-10-10'
  const length = options.days ?? 45
  const days: DailyWeather[] = []
  for (let i = length - 1; i >= 0; i -= 1) {
    days.push({
      date: addDays(endDate, -i),
      precipitationMm: options.rainByDaysAgo?.[i] ?? options.baseRain ?? 0,
      temperatureMaxC: options.tMax ?? 17,
      temperatureMinC: options.tMin ?? 9,
      et0Mm: options.et0 ?? 2.2,
      soilMoisture: options.soilMoisture ?? 0.3,
      soilTemperatureC: options.soilTemperature ?? 14,
      vpdKpa: options.vpd ?? 0.5,
      windMs: options.wind ?? 2,
      provenance: 'OBSERVED',
    })
  }
  return days
}

function mpiOf(days: DailyWeather[], cell: CellContext = AUTUMN_CELL): number {
  return computeMpi({ features: buildFeatures(days, cell, ALGORITHM_V1), cell }).mpi
}

/** Scenario di riferimento: buona pioggia distribuita, temperature ottimali, autunno in quota. */
function idealScenario(): DailyWeather[] {
  return scenario({
    // Circa 90 mm distribuiti nella finestra, che e' la zona 2-4 mm/giorno su 26 giorni
    // osservata in letteratura come quella dove la fruttificazione si concentra.
    rainByDaysAgo: { 20: 22, 19: 14, 14: 18, 13: 9, 8: 16, 7: 11 },
    // Media a 20 giorni pari a 13 gradi: l'ottimo misurato.
    tMax: 18,
    tMin: 8,
    et0: 1.8,
    soilMoisture: 0.33,
    soilTemperature: 14,
  })
}

describe('funzioni di base', () => {
  it('la campana vale 1 nel massimo e decresce simmetricamente', () => {
    expect(gaussian(13, 13, 4)).toBe(1)
    expect(gaussian(9, 13, 4)).toBeCloseTo(gaussian(17, 13, 4), 10)
    expect(gaussian(30, 13, 4)).toBeLessThan(0.001)
  })

  it('calcola il giorno dell anno', () => {
    expect(dayOfYear('2026-01-01')).toBe(1)
    expect(dayOfYear('2026-09-17')).toBe(260)
    expect(dayOfYear('2026-12-31')).toBe(365)
  })

  it('misura l esposizione a sud', () => {
    expect(southness(0)).toBe(0)
    expect(southness(180)).toBe(1)
    expect(southness(90)).toBeCloseTo(0.5, 6)
    expect(southness(270)).toBeCloseTo(0.5, 6)
  })
})

describe('decadimento dell acqua', () => {
  it('accelera col caldo', () => {
    const cold = dailyDecay({ temperatureC: 8, et0Mm: 2, windMs: 2 }, ALGORITHM_V1)
    const hot = dailyDecay({ temperatureC: 28, et0Mm: 2, windMs: 2 }, ALGORITHM_V1)
    expect(hot).toBeGreaterThan(cold)
  })

  it('accelera con ET0 alta: e il termine che il baseline non ha affatto', () => {
    const calm = dailyDecay({ temperatureC: 15, et0Mm: 1, windMs: 2 }, ALGORITHM_V1)
    const thirsty = dailyDecay({ temperatureC: 15, et0Mm: 6, windMs: 2 }, ALGORITHM_V1)
    expect(thirsty).toBeGreaterThan(calm * 1.3)
  })

  it('rallenta sotto chioma densa e accelera sui versanti a sud', () => {
    const open = dailyDecay({ temperatureC: 15, et0Mm: 2, windMs: 2 }, ALGORITHM_V1)
    const sheltered = dailyDecay({ temperatureC: 15, et0Mm: 2, windMs: 2 }, ALGORITHM_V1, {
      canopyDensity: 1,
      aspectDeg: null,
    })
    const southFacing = dailyDecay({ temperatureC: 15, et0Mm: 2, windMs: 2 }, ALGORITHM_V1, {
      canopyDensity: null,
      aspectDeg: 180,
    })
    expect(sheltered).toBeLessThan(open)
    expect(southFacing).toBeGreaterThan(open)
  })

  it('resta limitato anche in condizioni estreme', () => {
    // Un giorno torrido e ventoso non deve azzerare l acqua di tre settimane.
    const extreme = dailyDecay({ temperatureC: 45, et0Mm: 15, windMs: 25 }, ALGORITHM_V1)
    // I tre modulatori sono limitati a 3, 2.5 e 1.6: il prodotto non puo' superare 12 volte
    // il decadimento di base, qualunque cosa faccia il meteo.
    expect(extreme).toBeCloseTo(ALGORITHM_V1.water.lambdaBase.value * 12, 10)
  })
})

describe('bilancio idrico', () => {
  it('l acqua efficace e sempre minore della pioggia caduta', () => {
    const result = waterBalance(
      scenario({ rainByDaysAgo: { 20: 40 } }).map((d) => ({
        date: d.date,
        precipitationMm: d.precipitationMm,
        temperatureC: 15,
        et0Mm: 2.5,
        windMs: 2,
      })),
      0.3,
      ALGORITHM_V1,
    )
    expect(result.rawMm).toBe(40)
    expect(result.effectiveMm).toBeLessThan(result.rawMm)
    expect(result.effectiveMm).toBeGreaterThan(0)
  })

  it('la pioggia recente conta piu di quella vecchia', () => {
    const toWaterDays = (days: DailyWeather[]) =>
      days.map((d) => ({
        date: d.date,
        precipitationMm: d.precipitationMm,
        temperatureC: 15,
        et0Mm: 2.5,
        windMs: 2,
      }))
    const recent = waterBalance(toWaterDays(scenario({ rainByDaysAgo: { 3: 40 } })), 0.3, ALGORITHM_V1)
    const old = waterBalance(toWaterDays(scenario({ rainByDaysAgo: { 24: 40 } })), 0.3, ALGORITHM_V1)
    expect(recent.effectiveMm).toBeGreaterThan(old.effectiveMm)
  })

  it('la soglia di pioggia dipende dall umidita di partenza, e non e scritta da nessuna parte', () => {
    // E' la richiesta esplicita della specifica: niente soglia rigida tipo "servono 50-80 mm".
    const wet = initialDeficit(0.35, ALGORITHM_V1)
    const mid = initialDeficit(0.23, ALGORITHM_V1)
    const dry = initialDeficit(0.1, ALGORITHM_V1)
    expect(wet).toBe(0)
    expect(mid).toBeGreaterThan(0)
    expect(dry).toBeGreaterThan(mid)
    expect(dry).toBe(ALGORITHM_V1.water.maxInitialDeficitMm.value)
  })

  it('senza il dato di umidita assume una condizione intermedia, non la migliore', () => {
    const unknown = initialDeficit(null, ALGORITHM_V1)
    expect(unknown).toBeGreaterThan(0)
    expect(unknown).toBeLessThan(ALGORITHM_V1.water.maxInitialDeficitMm.value)
  })

  it('il punteggio idrico e strettamente monotono e non tocca mai lo zero secco', () => {
    // La prima versione sottraeva il deficit e tagliava a zero: cinque zone su sette davano
    // 0.0 e diventavano indistinguibili. E' lo stesso salto binario del modello baseline.
    const scores = [5, 15, 30, 60, 120].map((mm) => {
      const days = scenario({ rainByDaysAgo: { 10: mm }, soilMoisture: 0.12 })
      return buildFeatures(days, AUTUMN_CELL, ALGORITHM_V1).water.score
    })
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1] as number)
    }
    expect(scores[0]).toBeGreaterThan(0)
  })
})

describe('stagionalita e quota', () => {
  it('lo stesso meteo non da lo stesso indice a giugno e a ottobre', () => {
    const june = mpiOf(idealScenarioOn('2026-06-20'))
    const october = mpiOf(idealScenarioOn('2026-10-10'))
    expect(october).toBeGreaterThan(june)
  })

  it('in quota domina il regime autunnale, in basso quello estivo', () => {
    const highAutumn = seasonBlend('2026-10-15', 1200, ALGORITHM_V1)
    const lowSummer = seasonBlend('2026-07-20', 450, ALGORITHM_V1)
    expect(highAutumn.autumnality).toBeGreaterThan(0.9)
    expect(lowSummer.autumnality).toBeLessThan(0.1)
  })

  it('l ottimo termico si sposta col regime senza esporre specie diverse', () => {
    // Un solo indice "Porcino", ma i parametri seguono stagione e quota: a giugno a 450 m
    // l ottimo e piu alto che a ottobre a 1200 m.
    const summer = computeMpi({
      features: buildFeatures(idealScenarioOn('2026-07-20'), { ...AUTUMN_CELL, elevationM: 450 }, ALGORITHM_V1),
      cell: { ...AUTUMN_CELL, elevationM: 450 },
    })
    const autumn = computeMpi({
      features: buildFeatures(idealScenarioOn('2026-10-15'), { ...AUTUMN_CELL, elevationM: 1200 }, ALGORITHM_V1),
      cell: { ...AUTUMN_CELL, elevationM: 1200 },
    })
    expect(summer.components.thermal.optimumC).toBeGreaterThan(
      autumn.components.thermal.optimumC + 3,
    )
    expect(autumn.components.thermal.optimumC).toBeCloseTo(ALGORITHM_V1.thermal.optAutumnC.value, 0)
  })

  it('fuori stagione il potenziale scende ma non si azzera', () => {
    const february = mpiOf(idealScenarioOn('2026-02-10'))
    expect(february).toBeGreaterThanOrEqual(0)
    expect(february).toBeLessThan(mpiOf(idealScenarioOn('2026-10-10')))
  })
})

function idealScenarioOn(endDate: string): DailyWeather[] {
  return scenario({
    endDate,
    rainByDaysAgo: { 20: 22, 19: 14, 14: 18, 13: 9, 8: 16, 7: 11 },
    tMax: 18,
    tMin: 8,
    et0: 1.8,
    soilMoisture: 0.33,
    soilTemperature: 14,
  })
}

describe('scenari meteorologici richiesti dalla specifica', () => {
  it('molta pioggia con temperatura ottimale da condizioni molto favorevoli', () => {
    const mpi = mpiOf(idealScenario())
    /*
     * Lo scenario ideale ora arriva vicino al fondo scala, dove prima si fermava a 81.
     *
     * Non e' un allentamento: sono cambiati i riferimenti. La fascia altimetrica del regime
     * autunnale e il picco stagionale ora vengono dalla letteratura sull'habitat italiano
     * invece che da valori scelti da me, e una faggeta a 1000 m il 10 ottobre risulta in pieno
     * regime autunnale invece che a meta' strada. In piu' agisce l'innesco: 90 mm ben distribuiti
     * con un evento intenso nella finestra giusta valgono piu' della stessa acqua arrivata a caso.
     *
     * Sui dati reali il fondo scala resta lontanissimo: il 17 settembre 2026 le sette zone
     * stavano fra 0 e 24.
     */
    expect(mpi).toBeGreaterThan(85)
    expect(mpiLabel(mpi)).toBe('condizioni molto favorevoli')
  })

  it('la stessa pioggia con caldo estremo crolla', () => {
    const hot = scenario({
      rainByDaysAgo: { 20: 22, 19: 14, 14: 18, 13: 9, 8: 16, 7: 11 },
      tMax: 34,
      tMin: 21,
      et0: 6.5,
      vpd: 2.4,
      soilMoisture: 0.33,
      soilTemperature: 24,
    })
    expect(mpiOf(hot)).toBeLessThan(mpiOf(idealScenario()) / 3)
  })

  it('assenza di pioggia da condizioni sfavorevoli', () => {
    const dry = scenario({ baseRain: 0, soilMoisture: 0.12 })
    expect(mpiOf(dry)).toBeLessThan(5)
  })

  it('pioggia recente dopo lunga siccita vale meno della stessa pioggia su terreno umido', () => {
    // 25 mm dopo mesi secchi non equivalgono a 25 mm su terreno gia umido.
    const afterDrought = scenario({ rainByDaysAgo: { 10: 25 }, soilMoisture: 0.1 })
    const onWetSoil = scenario({ rainByDaysAgo: { 10: 25 }, soilMoisture: 0.34 })
    expect(mpiOf(afterDrought)).toBeLessThan(mpiOf(onWetSoil))
  })

  it('il vento forte riduce il punteggio', () => {
    const windy = scenario({
      rainByDaysAgo: { 20: 22, 19: 14, 14: 18, 13: 9, 8: 16, 7: 11 },
      tMax: 18,
      tMin: 8,
      et0: 1.8,
      wind: 11,
      soilMoisture: 0.33,
    })
    expect(mpiOf(windy)).toBeLessThan(mpiOf(idealScenario()))
  })

  it('la gelata precoce riduce fortemente ma non annulla', () => {
    // Una gelata danneggia i carpofori esistenti piu di quanto azzeri il potenziale del micelio.
    const frosty = scenario({
      rainByDaysAgo: { 20: 22, 19: 14, 14: 18, 13: 9, 8: 16, 7: 11 },
      tMax: 10,
      tMin: -6,
      et0: 1.2,
      soilMoisture: 0.33,
      soilTemperature: 6,
    })
    const mpi = mpiOf(frosty)
    expect(mpi).toBeGreaterThan(0)
    expect(mpi).toBeLessThan(mpiOf(idealScenario()) / 2)
  })

  it('distingue una pioggia forte da una debole, senza saturare', () => {
    // Il baseline satura a 45 mm e assegnava lo stesso 67.4 a 147 mm e a 95 mm su 26 giorni.
    const moderate = mpiOf(scenario({ rainByDaysAgo: { 12: 50 }, tMax: 18, tMin: 8, et0: 1.8, soilMoisture: 0.3 }))
    const heavy = mpiOf(scenario({ rainByDaysAgo: { 12: 120 }, tMax: 18, tMin: 8, et0: 1.8, soilMoisture: 0.3 }))
    expect(heavy).toBeGreaterThan(moderate)
  })
})

describe('eventi di pioggia', () => {
  it('2 mm isolati e 35 mm in due giorni non sono la stessa cosa', () => {
    const drizzle = detectRainEvents(scenario({ rainByDaysAgo: { 5: 2 } }), '2026-10-10')
    const real = detectRainEvents(scenario({ rainByDaysAgo: { 5: 20, 4: 15 } }), '2026-10-10')
    expect(drizzle).toHaveLength(0)
    expect(real).toHaveLength(1)
    expect(real[0]?.totalMm).toBe(35)
    expect(real[0]?.durationDays).toBe(2)
  })

  it('misura i giorni trascorsi dalla fine dell evento e la siccita precedente', () => {
    const events = detectRainEvents(scenario({ rainByDaysAgo: { 10: 30 } }), '2026-10-10')
    expect(events[0]?.daysSinceEnd).toBe(10)
    expect(events[0]?.priorDryDays).toBeGreaterThan(20)
  })

  it('separa due eventi distinti', () => {
    const events = detectRainEvents(
      scenario({ rainByDaysAgo: { 20: 25, 19: 10, 6: 30 } }),
      '2026-10-10',
    )
    expect(events).toHaveLength(2)
    expect(events[0]?.totalMm).toBe(35)
    expect(events[1]?.totalMm).toBe(30)
  })
})

describe('shock termico', () => {
  it('misura il calo su tre giorni', () => {
    expect(maxThermalDrop([20, 19, 18, 12])).toBe(8)
    expect(maxThermalDrop([12, 13, 14, 15])).toBe(-3)
    expect(maxThermalDrop([20, null, 18, null])).toBeNull()
  })

  it('e calcolato e registrato ma non applicato', () => {
    // Non ho trovato supporto di campo per questo fattore: entra a peso zero e si valida col
    // diario uscite. Ma va calcolato da subito, altrimenti non si potra confrontare il passato.
    const days = scenario({ rainByDaysAgo: { 15: 40 } })
    const result = computeMpi({ features: buildFeatures(days, AUTUMN_CELL, ALGORITHM_V1), cell: AUTUMN_CELL })
    const shock = result.components.penalties.find((p) => p.key === 'thermalShock')
    expect(shock).toBeDefined()
    expect(shock?.applied).toBe(false)
    expect(shock?.factor).toBe(1)
  })
})

describe('explainScore', () => {
  const days = idealScenario()
  const features = buildFeatures(days, AUTUMN_CELL, ALGORITHM_V1)
  const result = computeMpi({ features, cell: AUTUMN_CELL })
  const explanation = explainScore(result, features, 78)

  it('non e una scatola nera: ogni fattore ha un contributo e un valore', () => {
    const all = [
      ...explanation.positiveFactors,
      ...explanation.negativeFactors,
      ...explanation.neutralFactors,
    ]
    expect(all.length).toBeGreaterThan(4)
    for (const factor of all) {
      expect(factor.label).not.toBe('')
      expect(factor.value).not.toBe('')
      expect(Number.isFinite(factor.contribution)).toBe(true)
    }
  })

  it('marca i parametri privi di fonte come da calibrare', () => {
    const all = [
      ...explanation.positiveFactors,
      ...explanation.negativeFactors,
      ...explanation.neutralFactors,
    ]
    const sourced = all.filter((f) => f.provenance === 'sourced')
    expect(sourced.length).toBeGreaterThan(0)
    for (const factor of sourced) {
      expect(factor.source).toBeDefined()
    }
  })

  it('indica il fattore limitante', () => {
    const dry = scenario({ baseRain: 0, soilMoisture: 0.12 })
    const dryFeatures = buildFeatures(dry, AUTUMN_CELL, ALGORITHM_V1)
    const dryResult = computeMpi({ features: dryFeatures, cell: AUTUMN_CELL })
    const dryExplanation = explainScore(dryResult, dryFeatures, 60)
    expect(dryExplanation.limitingFactor).toContain('Acqua')
  })
})

describe('vincolo semantico', () => {
  it('nessuna etichetta suggerisce la presenza di funghi', () => {
    // L MPI indica la compatibilita delle condizioni, mai la presenza. Il test e meccanico
    // proprio perche il vincolo e dichiarato non negoziabile e non va affidato alla disciplina.
    const forbidden = /fungh|porcin|trover|garantit|sicur|abbondan|molti\b|tanti\b|raccolt/i
    for (const band of MPI_LABELS) {
      expect(band.label).not.toMatch(forbidden)
      expect(band.label).toMatch(/condizioni/)
    }
    for (const value of [0, 10, 25, 50, 75, 95, 100]) {
      expect(mpiLabel(value)).not.toMatch(forbidden)
    }
  })
})

describe('governance dei parametri', () => {
  it('i parametri con fonte la dichiarano davvero', () => {
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== 'object') return
      if ('value' in node && 'provenance' in node) {
        const param = node as { provenance: string; source?: string }
        if (param.provenance === 'sourced') expect(param.source).toBeDefined()
        return
      }
      for (const child of Object.values(node)) walk(child)
    }
    walk(ALGORITHM_V1)
  })

  it('elenca i parametri da calibrare per mostrarli come tali', () => {
    const toCalibrate = uncalibratedParams()
    expect(toCalibrate.length).toBeGreaterThan(10)
    // L ottimo termico e la finestra di precipitazione sono gli unici davvero fondati.
    expect(toCalibrate).not.toContain('thermal.optAutumnC')
    expect(toCalibrate).not.toContain('thermal.airWindowDays')
    expect(toCalibrate).not.toContain('water.windowDays')
    // L ottimo estivo invece non ha fonte, e deve risultare come tale.
    expect(toCalibrate).toContain('thermal.optSummerC')
  })

  it('lo shock termico e disattivato in configurazione', () => {
    expect(ALGORITHM_V1.penalties.thermalShock.weight.value).toBe(0)
  })
})

describe('innesco da pioggia intensa', () => {
  /** Uno scenario identico, cambia solo quando è caduto l'acquazzone. */
  const withEventDaysAgo = (daysAgo: number): DailyWeather[] =>
    scenario({
      rainByDaysAgo: { [daysAgo]: 40 },
      tMax: 18,
      tMin: 8,
      et0: 1.8,
      soilMoisture: 0.33,
      soilTemperature: 14,
    })

  it('il guadagno è massimo al dodicesimo giorno, come misurato sull Amiata', () => {
    const senza = { ...ALGORITHM_V1, trigger: { ...ALGORITHM_V1.trigger, weight: { ...ALGORITHM_V1.trigger.weight, value: 0 } } }
    const gain = (daysAgo: number): number => {
      const days = withEventDaysAgo(daysAgo)
      const base = computeMpi({ features: buildFeatures(days, AUTUMN_CELL, senza), cell: AUTUMN_CELL }, senza).mpi
      const con = mpiOf(days)
      return con / base
    }
    const gains = [4, 8, 12, 16, 22].map(gain)
    expect(gains.indexOf(Math.max(...gains))).toBe(2)
  })

  it('NON sposta il massimo della curva, ed è un limite dichiarato', () => {
    /*
     * Il picco resta subito dopo la pioggia perché il bilancio idrico decade dal primo giorno,
     * mentre la misura sull'Amiata lo colloca al dodicesimo. Per riprodurlo serve un suolo che
     * si satura e resta carico qualche giorno, non un peso più alto su questo termine.
     *
     * Il test esiste per impedire che qualcuno "risolva" il problema gonfiando il peso: se un
     * giorno il massimo si sposterà davvero, dovrà essere perché è cambiata la forma del
     * bilancio idrico, e questo test andrà riscritto consapevolmente.
     */
    const scores = [2, 6, 12, 20].map((d) => mpiOf(withEventDaysAgo(d)))
    expect(scores.indexOf(Math.max(...scores))).toBe(0)
  })

  it('senza pioggia intensa in finestra il termine non agisce', () => {
    const debole = scenario({ rainByDaysAgo: { 12: 8 }, soilMoisture: 0.3 })
    const features = buildFeatures(debole, AUTUMN_CELL, ALGORITHM_V1)
    const result = computeMpi({ features, cell: AUTUMN_CELL })
    expect(features.daysSinceIntenseEvent).toBeNull()
    expect(result.components.trigger.factor).toBe(1)
    expect(result.components.trigger.detail).toContain('nessuna pioggia oltre 20 mm')
  })

  it('la soglia di evento intenso viene dalla fonte, non da noi', () => {
    expect(ALGORITHM_V1.trigger.intenseEventMm.provenance).toBe('sourced')
    expect(ALGORITHM_V1.trigger.intenseEventMm.tier).toBe('peer-reviewed')
    expect(ALGORITHM_V1.trigger.lagDays.value).toBe(12)
    expect(ALGORITHM_V1.trigger.lagDays.tier).toBe('peer-reviewed')
  })
})

describe('shock di caldo', () => {
  it('un impennata della massima abbassa il punteggio', () => {
    const stabile = scenario({
      rainByDaysAgo: { 12: 40 }, tMax: 18, tMin: 8, et0: 1.8, soilMoisture: 0.33,
    })
    const conImpennata = [...stabile]
    // Un solo giorno a 30 gradi dentro una finestra che sta sui 18: circa 11 sopra la media.
    const idx = conImpennata.length - 6
    const day = conImpennata[idx]
    if (day !== undefined) conImpennata[idx] = { ...day, temperatureMaxC: 30 }

    expect(mpiOf(conImpennata)).toBeLessThan(mpiOf(stabile))
  })

  it('è applicata, al contrario dello shock da raffreddamento', () => {
    const days = scenario({ rainByDaysAgo: { 12: 40 }, soilMoisture: 0.33 })
    const result = computeMpi({
      features: buildFeatures(days, AUTUMN_CELL, ALGORITHM_V1),
      cell: AUTUMN_CELL,
    })
    const heat = result.components.penalties.find((p) => p.key === 'heatShock')
    const cold = result.components.penalties.find((p) => p.key === 'thermalShock')
    expect(heat?.applied).toBe(true)
    expect(cold?.applied).toBe(false)
  })

  it('la soglia di 8 gradi ha una fonte toscana', () => {
    const threshold = ALGORITHM_V1.penalties.heatShock.threshold
    expect(threshold.value).toBe(8)
    expect(threshold.tier).toBe('peer-reviewed')
    expect(threshold.source).toContain('Amiata')
  })
})
