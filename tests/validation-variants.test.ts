/**
 * Test delle varianti del backtest e della conversione dell'archivio Open-Meteo.
 *
 * Il punto piu' delicato e' che ogni variante cambi **solo** cio' che dichiara. La (c) in
 * particolare e' un involucro (quota stagionale limitata) e non un parametro: vale solo se in
 * `computeMpi` la quota della cella entra esclusivamente nella miscela stagionale, e questo va
 * verificato, non assunto.
 */

import { describe, expect, it } from 'vitest'

import { ALGORITHM_V1 } from '@/lib/config/algorithm'
import { addDays } from '@/lib/domain/time'
import type { DailyWeather } from '@/lib/model/features'
import { computeMpi, seasonBlend } from '@/lib/model/mpi'
import { buildFeatures } from '@/lib/model/features'
import {
  type ArchiveResponse,
  archiveCallWeight,
  archiveToSeries,
  archiveUrl,
} from '@/lib/validation/archive'
import {
  configLowAutumn,
  CONFIG_OPT15,
  CONFIG_V14,
  CONFIG_V15,
  CONFIG_WARM_RELAXED,
  MAX_ELEVATION_WEIGHT,
  WEATHER_VARIANTS,
  backtestCell,
  historyUpTo,
  seasonalElevation,
} from '@/lib/validation/variants'

function series(
  end: string,
  length: number,
  day: (i: number) => Partial<DailyWeather> = () => ({}),
): DailyWeather[] {
  return Array.from({ length }, (_, i) => ({
    date: addDays(end, i - length + 1),
    precipitationMm: 0,
    temperatureMaxC: 18,
    temperatureMinC: 8,
    et0Mm: 2,
    soilMoisture: 0.25,
    soilTemperatureC: 12,
    vpdKpa: 0.5,
    windMs: 3,
    relativeHumidityPercent: null,
    provenance: 'REANALYSIS' as const,
    ...day(i),
  }))
}

const variant = (key: string) => {
  const v = WEATHER_VARIANTS.find((x) => x.key === key)
  if (v === undefined) throw new Error(`variante ${key} mancante`)
  return v
}

describe('configurazioni delle varianti', () => {
  it('cambiano un solo parametro rispetto alla 1.5 congelata', () => {
    expect(CONFIG_V15.thermal.optAutumnC.value).toBe(13)
    expect(CONFIG_V15.phenology.lowElevationAutumnWeight.value).toBe(0)
    expect(CONFIG_V14.trigger.waterRelief.value).toBe(0)
    expect(CONFIG_V14.trigger.weight).toBe(CONFIG_V15.trigger.weight)
    expect(CONFIG_V14.water).toBe(CONFIG_V15.water)
    expect(CONFIG_OPT15.thermal.optAutumnC.value).toBe(15)
    expect(CONFIG_OPT15.thermal.sigmaWarmC).toBe(CONFIG_V15.thermal.sigmaWarmC)
    expect(CONFIG_WARM_RELAXED.thermal.sigmaWarmC.value).toBe(12)
    expect(CONFIG_WARM_RELAXED.thermal.optAutumnC).toBe(CONFIG_V15.thermal.optAutumnC)
  })

  it('non toccano la configurazione di produzione', () => {
    expect(ALGORITHM_V1.version).toBe('1.6.1-porcino')
    expect(ALGORITHM_V1.trigger.waterRelief.value).toBe(0.8)
    expect(ALGORITHM_V1.thermal.sigmaWarmC.value).toBe(7.5)
    expect(ALGORITHM_V1.thermal.optAutumnC.value).toBe(15)
    expect(ALGORITHM_V1.phenology.lowElevationAutumnWeight.value).toBe(0.8)
  })
})

describe('variante (c): estate in quota', () => {
  it('la quota stagionale limita il peso autunnale esattamente al tetto', () => {
    expect(seasonalElevation(1500)).toBe(840)
    expect(seasonalElevation(500)).toBe(500)
    // (c2): anche il pavimento, 700 + 0.3 * 200 = 760 m.
    expect(seasonalElevation(300, ALGORITHM_V1, 0.7, 0.3)).toBeCloseTo(760, 10)
    expect(seasonalElevation(1500, ALGORITHM_V1, 0.7, 0.3)).toBe(840)
    // Con l'autunno a bassa quota spento, come nella 1.5 su cui la (c2) e' stata pensata.
    const autumnLow = seasonBlend('2021-09-30', seasonalElevation(300, ALGORITHM_V1, 0.7, 0.3), configLowAutumn(0))
    expect(autumnLow.autumn).toBeCloseTo(0.3, 10)
    const blend = seasonBlend('2021-07-19', seasonalElevation(1500), ALGORITHM_V1)
    // Al picco estivo (giorno 200) il termine estivo vale (1 - peso) * 1.
    expect(blend.summer).toBeCloseTo(1 - MAX_ELEVATION_WEIGHT, 10)
    expect(seasonBlend('2021-07-19', 1500, ALGORITHM_V1).summer).toBe(0)
  })

  it('in computeMpi la quota della cella entra solo nella miscela stagionale', () => {
    // Stessa miscela stagionale (entrambe sopra 900 m) -> stesso identico MPI, con qualunque meteo.
    const days = series('2021-09-20', 60, (i) => ({ precipitationMm: i % 9 === 0 ? 25 : 0 }))
    const features = buildFeatures(days, backtestCell(1000), ALGORITHM_V1)
    const a = computeMpi({ features, cell: backtestCell(1000) }, ALGORITHM_V1)
    const b = computeMpi({ features, cell: backtestCell(2500) }, ALGORITHM_V1)
    expect(a.mpi).toBe(b.mpi)
    expect(a.rawMpi).toBe(b.rawMpi)
  })

  it('in luglio a 1500 m alza il punteggio, in basso non cambia nulla', () => {
    const days = series('2021-07-19', 60, (i) => ({
      precipitationMm: i % 7 === 0 ? 20 : 0,
      temperatureMaxC: 24,
      temperatureMinC: 12,
    }))
    const history = historyUpTo(days, '2021-07-19')
    if (history === null) throw new Error('storia mancante')
    const high = { history, elevationM: 1500 }
    expect(variant('v15-estate-quota').score(high).mpi).toBeGreaterThan(variant('v15').score(high).mpi)
    const low = { history, elevationM: 400 }
    expect(variant('v15-estate-quota').score(low).mpi).toBe(variant('v15').score(low).mpi)
  })
})

describe('variante (d): caldo tollerato se c\'e\' acqua', () => {
  const warm = (rain: number): DailyWeather[] =>
    series('2021-09-20', 60, (i) => ({
      precipitationMm: i % 4 === 0 ? rain : 0,
      temperatureMaxC: 27,
      temperatureMinC: 15,
    }))

  it('con acqua abbondante coincide con la campana larga', () => {
    const history = warm(20)
    const input = { history, elevationM: 1100 }
    const base = variant('v15').score(input)
    expect(base.components.water).toBeGreaterThanOrEqual(0.5)
    expect(variant('v15-caldo-se-umido').score(input).mpi).toBe(variant('v15-caldo-sempre').score(input).mpi)
    expect(variant('v15-caldo-se-umido').score(input).mpi).toBeGreaterThanOrEqual(base.mpi)
  })

  it('con suolo secco coincide con la 1.5', () => {
    const history = warm(0)
    const input = { history, elevationM: 1100 }
    expect(variant('v15').score(input).components.water).toBeLessThan(0.5)
    expect(variant('v15-caldo-se-umido').score(input).mpi).toBe(variant('v15').score(input).mpi)
  })
})

describe('historyUpTo', () => {
  it('taglia la serie al giorno richiesto, incluso', () => {
    const days = series('2021-09-30', 100)
    const h = historyUpTo(days, '2021-09-20', 60)
    expect(h).toHaveLength(60)
    expect(h?.[h.length - 1]?.date).toBe('2021-09-20')
    expect(historyUpTo(days, '2022-01-01')).toBeNull()
  })
})

describe('archivio Open-Meteo', () => {
  it('costruisce una richiesta da 1 aprile a 30 novembre, in m/s, con il modello dichiarato', () => {
    const url = new URL(archiveUrl({ latitude: 46.1, longitude: 11.3, year: 2021, elevationM: null }))
    expect(url.searchParams.get('start_date')).toBe('2021-04-01')
    expect(url.searchParams.get('end_date')).toBe('2021-11-30')
    expect(url.searchParams.get('wind_speed_unit')).toBe('ms')
    expect(url.searchParams.get('models')).toBe('era5_seamless')
    expect(url.searchParams.has('elevation')).toBe(false)
    const withElevation = new URL(
      archiveUrl({ latitude: 46.1, longitude: 11.3, year: 2021, elevationM: 1234.4 }),
    )
    expect(withElevation.searchParams.get('elevation')).toBe('1234')
  })

  it('pesa circa 17 chiamate per localita\'-anno', () => {
    expect(archiveCallWeight(2021)).toBeCloseTo(244 / 14, 6)
  })

  it('converte la risposta, con i dati orari mediati e i mancanti a null', () => {
    const response: ArchiveResponse = {
      latitude: 46.1,
      longitude: 11.3,
      elevation: 1450,
      daily: {
        time: ['2021-09-01', '2021-09-02'],
        precipitation_sum: [3.2, null],
        temperature_2m_max: [20, 21],
        temperature_2m_min: [9, 10],
        et0_fao_evapotranspiration: [2.5, 2.7],
        wind_speed_10m_max: [4, 5],
      },
      hourly: {
        time: ['2021-09-01T00:00', '2021-09-01T12:00', '2021-09-02T00:00'],
        soil_moisture_0_to_7cm: [0.2, 0.3, null],
        vapour_pressure_deficit: [0.4, 0.8, 0.5],
      },
    }
    const out = archiveToSeries(response)
    expect(out.elevationM).toBe(1450)
    expect(out.days[0]?.soilMoisture).toBeCloseTo(0.25, 12)
    expect(out.days[0]?.vpdKpa).toBeCloseTo(0.6, 12)
    expect(out.days[1]?.soilMoisture).toBeNull()
    // Variabile assente dalla risposta: null, non zero.
    expect(out.days[0]?.soilTemperatureC).toBeNull()
    expect(out.days[1]?.precipitationMm).toBeNull()
    expect(out.days[0]?.windMs).toBe(4)
    expect(out.days[0]?.provenance).toBe('REANALYSIS')
  })
})

describe('varianti (j): caldo a bassa quota', () => {
  it('sotto 700 m cambiano ottimo e tolleranza, sopra 900 m sono la produzione', async () => {
    const { configWarmLow } = await import('@/lib/validation/variants')
    const low = configWarmLow(300, 17, 10)
    expect(low.thermal.optAutumnC.value).toBe(17)
    expect(low.thermal.sigmaWarmC.value).toBe(10)
    const mid = configWarmLow(800, 17, null)
    expect(mid.thermal.optAutumnC.value).toBeCloseTo(16, 10)
    const high = configWarmLow(1200, 19, 10)
    expect(high.thermal.optAutumnC.value).toBe(ALGORITHM_V1.thermal.optAutumnC.value)
    expect(high.thermal.sigmaWarmC.value).toBe(ALGORITHM_V1.thermal.sigmaWarmC.value)
  })
})
