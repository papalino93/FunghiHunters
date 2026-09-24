/**
 * Test della parte "dati" del backtest: quali record GBIF diventano casi, come si deduplicano,
 * come si raggruppano in localita'-anno, come si estraggono campione e controlli.
 *
 * Il rischio coperto e' che un dettaglio di pulizia cambi l'esito senza che nessuno se ne
 * accorga: una coordinata oscurata a 27 km presa per buona, cinque foto dello stesso cesto
 * contate cinque volte, un controllo a dieci giorni da un caso.
 */

import { describe, expect, it } from 'vitest'

import { daysBetween } from '@/lib/domain/time'
import { sampleControlDates } from '@/lib/validation/controls'
import {
  INATURALIST_DATASET_KEY,
  type GbifOccurrence,
  type PresenceRecord,
  acceptOccurrence,
  assignLocations,
  buildLocationYears,
  dayPreciseDate,
  dedupeSameDay,
  gbifSearchUrl,
  normaliseRegion,
  stratifiedSample,
} from '@/lib/validation/gbif'
import { mulberry32, shuffled } from '@/lib/validation/rng'

function occurrence(overrides: Partial<GbifOccurrence> = {}): GbifOccurrence {
  return {
    key: 1,
    datasetKey: INATURALIST_DATASET_KEY,
    basisOfRecord: 'HUMAN_OBSERVATION',
    species: 'Boletus edulis',
    decimalLatitude: 46.1,
    decimalLongitude: 11.3,
    coordinateUncertaintyInMeters: 10,
    eventDate: '2021-09-14T10:22:00',
    year: 2021,
    month: 9,
    day: 14,
    stateProvince: 'Trentino-Alto Adige',
    issues: [],
    ...overrides,
  }
}

function record(overrides: Partial<PresenceRecord> = {}): PresenceRecord {
  return {
    gbifKey: 1,
    datasetKey: INATURALIST_DATASET_KEY,
    species: 'Boletus edulis',
    latitude: 44.0,
    longitude: 11.0,
    uncertaintyM: 10,
    date: '2021-09-14',
    year: 2021,
    month: 9,
    region: 'Toscana',
    elevationM: null,
    ...overrides,
  }
}

describe('acceptOccurrence', () => {
  it('accetta un record preciso', () => {
    const result = acceptOccurrence(occurrence())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.record.date).toBe('2021-09-14')
      expect(result.record.region).toBe('Trentino-Alto Adige')
    }
  })

  it('scarta le coordinate oscurate e quelle troppo incerte', () => {
    expect(
      acceptOccurrence(
        occurrence({
          coordinateUncertaintyInMeters: 27031,
          informationWithheld: 'Coordinate uncertainty increased to 27031m at the request of the observer',
        }),
      ),
    ).toEqual({ ok: false, reason: 'obscured' })
    expect(acceptOccurrence(occurrence({ coordinateUncertaintyInMeters: 2500 }))).toEqual({
      ok: false,
      reason: 'uncertainty-large',
    })
    expect(acceptOccurrence(occurrence({ coordinateUncertaintyInMeters: 2000 })).ok).toBe(true)
  })

  it('accetta l\'incertezza mancante solo da iNaturalist research-grade', () => {
    expect(acceptOccurrence(occurrence({ coordinateUncertaintyInMeters: undefined })).ok).toBe(true)
    expect(
      acceptOccurrence(occurrence({ coordinateUncertaintyInMeters: undefined, datasetKey: 'altro' })),
    ).toEqual({ ok: false, reason: 'uncertainty-missing' })
  })

  it('scarta le date non precise al giorno e fuori periodo', () => {
    expect(
      acceptOccurrence(occurrence({ eventDate: '2021-09-01/2021-09-30', day: undefined })),
    ).toEqual({ ok: false, reason: 'date-imprecise' })
    expect(
      acceptOccurrence(occurrence({ eventDate: '2021-04-20', month: 4, day: 20 })),
    ).toEqual({ ok: false, reason: 'out-of-period' })
    expect(
      acceptOccurrence(occurrence({ eventDate: '2015-09-14', year: 2015 })),
    ).toEqual({ ok: false, reason: 'out-of-period' })
  })

  it('scarta i problemi di coordinate gravi', () => {
    expect(acceptOccurrence(occurrence({ issues: ['ZERO_COORDINATE'] }))).toEqual({
      ok: false,
      reason: 'coordinate-issue',
    })
    expect(acceptOccurrence(occurrence({ issues: ['COORDINATE_ROUNDED'] })).ok).toBe(true)
  })
})

describe('dayPreciseDate', () => {
  it('accetta un intervallo di un solo giorno e rifiuta campi incoerenti', () => {
    expect(dayPreciseDate(occurrence({ eventDate: '2021-09-14/2021-09-14' }))).toBe('2021-09-14')
    expect(dayPreciseDate(occurrence({ eventDate: '2021-09-14', day: 15 }))).toBeNull()
    expect(dayPreciseDate(occurrence({ eventDate: '2021-09' }))).toBeNull()
  })
})

describe('normaliseRegion', () => {
  it('unifica i nomi inglesi e i vuoti', () => {
    expect(normaliseRegion('Sicily')).toBe('Sicilia')
    expect(normaliseRegion('Tuscany')).toBe('Toscana')
    expect(normaliseRegion(undefined)).toBe('ignota')
  })
})

describe('gbifSearchUrl', () => {
  it('filtra lato server paese, periodo e coordinate', () => {
    const url = new URL(gbifSearchUrl(5954958, 300))
    expect(url.searchParams.get('country')).toBe('IT')
    expect(url.searchParams.get('year')).toBe('2016,2025')
    expect(url.searchParams.get('month')).toBe('5,11')
    expect(url.searchParams.get('offset')).toBe('300')
    expect(url.searchParams.get('limit')).toBe('300')
  })
})

describe('dedupeSameDay', () => {
  it('tiene un solo record per giorno entro un chilometro, il piu\' preciso', () => {
    const out = dedupeSameDay([
      record({ gbifKey: 1, uncertaintyM: 50 }),
      record({ gbifKey: 2, uncertaintyM: 5, latitude: 44.003 }), // ~330 m
      record({ gbifKey: 3, latitude: 44.02 }), // ~2.2 km: altro caso
      record({ gbifKey: 4, date: '2021-09-15' }), // altro giorno: altro caso
    ])
    expect(out.map((r) => r.gbifKey).sort()).toEqual([2, 3, 4])
  })
})

describe('localita\' e localita\'-anno', () => {
  it('raggruppa entro un chilometro in qualunque anno, e separa gli anni', () => {
    const located = assignLocations([
      record({ gbifKey: 1, date: '2020-09-01', year: 2020, month: 9 }),
      record({ gbifKey: 2, latitude: 44.004, date: '2021-10-02', year: 2021, month: 10 }),
      record({ gbifKey: 3, latitude: 44.004, date: '2021-09-20', year: 2021, month: 9 }),
      record({ gbifKey: 4, latitude: 45.0 }),
    ])
    const ids = new Map(located.map((r) => [r.gbifKey, r.locationId]))
    expect(ids.get(1)).toBe(ids.get(2))
    expect(ids.get(4)).not.toBe(ids.get(1))

    const lys = buildLocationYears(located)
    expect(lys).toHaveLength(3)
    const ly2021 = lys.find((ly) => ly.year === 2021 && ly.locationId === ids.get(1))
    expect(ly2021?.cases.map((c) => c.date)).toEqual(['2021-09-20', '2021-10-02'])
    expect(ly2021?.firstMonth).toBe(9)
    // Il punto meteo e' il primo caso per chiave GBIF, non per data: stabile se arriva un record nuovo.
    expect(ly2021?.latitude).toBe(44.004)
  })
})

describe('stratifiedSample', () => {
  it('alloca in modo uguale fra gli strati, poi riempie con quelli rimasti', () => {
    const items = [
      ...Array.from({ length: 50 }, (_, i) => ({ id: `t${i}`, region: 'Trentino' })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, region: 'Toscana' })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, region: 'Lombardia' })),
    ]
    const sample = stratifiedSample(items, 12, (it) => it.region, mulberry32(5))
    const count = (region: string): number => sample.filter((s) => s.region === region).length
    expect(sample).toHaveLength(12)
    expect(count('Toscana')).toBe(3)
    // Dopo tre giri Toscana e' esaurita; l'ultimo posto va a uno dei due strati rimasti.
    expect(count('Lombardia')).toBeGreaterThanOrEqual(4)
    expect(count('Trentino')).toBeGreaterThanOrEqual(4)
    expect(count('Lombardia') + count('Trentino')).toBe(9)
    expect(new Set(sample.map((s) => s.id)).size).toBe(12)
  })

  it('restituisce tutto se n supera la popolazione, ed e\' riproducibile', () => {
    const items = [1, 2, 3]
    expect(stratifiedSample(items, 10, String, mulberry32(1))).toEqual([1, 2, 3])
    const many = Array.from({ length: 40 }, (_, i) => i)
    expect(stratifiedSample(many, 7, (i) => String(i % 3), mulberry32(9))).toEqual(
      stratifiedSample(many, 7, (i) => String(i % 3), mulberry32(9)),
    )
  })
})

describe('sampleControlDates', () => {
  it('estrae tre date distinte fra giugno e novembre, ad almeno 20 giorni dai casi', () => {
    const cases = ['2021-09-14', '2021-10-01']
    for (let seed = 0; seed < 50; seed += 1) {
      const controls = sampleControlDates(2021, cases, mulberry32(seed))
      expect(controls).toHaveLength(3)
      expect(new Set(controls).size).toBe(3)
      for (const c of controls) {
        expect(c >= '2021-06-01' && c <= '2021-11-30').toBe(true)
        for (const k of cases) expect(Math.abs(daysBetween(k, c))).toBeGreaterThanOrEqual(20)
      }
    }
  })

  it('ne estrae meno invece di violare la distanza quando i casi coprono la stagione', () => {
    const cases = ['2021-06-15', '2021-07-20', '2021-08-25', '2021-09-30', '2021-11-05']
    const controls = sampleControlDates(2021, cases, mulberry32(1))
    for (const c of controls) {
      for (const k of cases) expect(Math.abs(daysBetween(k, c))).toBeGreaterThanOrEqual(20)
    }
  })

  it('e\' riproducibile con lo stesso seme', () => {
    expect(sampleControlDates(2019, ['2019-09-01'], mulberry32(42))).toEqual(
      sampleControlDates(2019, ['2019-09-01'], mulberry32(42)),
    )
  })
})

describe('rng', () => {
  it('produce valori in [0, 1) e mescola senza perdere elementi', () => {
    const rng = mulberry32(123)
    for (let i = 0; i < 1000; i += 1) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const items = [1, 2, 3, 4, 5, 6]
    expect([...shuffled(items, mulberry32(1))].sort()).toEqual(items)
    expect(items).toEqual([1, 2, 3, 4, 5, 6])
  })
})
