/**
 * API pubblica `/api/v1/mpi`: tutte le zone, senza rompere chi la usava già.
 *
 * Tre cose da proteggere. Che senza `region` la risposta resti quella di prima (più `modelOnly`).
 * Che le zone del catalogo escano con tutti i numeri e senza le frasi dell'interfaccia. E che
 * `modelOnly` non dica mai «stazioni vere» quando non lo sa: una zona di solo modello spacciata
 * per solida è esattamente l'errore che #44 ha tolto dall'app.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Snapshot, SnapshotZone } from '@/lib/snapshot/types'
import { isModelOnly, toApiZone, zoneOnDate } from '@/lib/api/mpi'

function zone(code: string, withStations: boolean): SnapshotZone {
  return {
    code, name: `Zona ${code}`, reference: code, province: 'LU', municipality: 'Comune',
    latitude: 44.123456, longitude: 10.4, elevationM: 1000, forest: ['faggeta'], stationNotes: 'nota lunga',
    mpi: 40.26, confidence: 70.04, dataQuality: 68.66, forecastCertainty: 99.6,
    label: 'discrete', limitingFactor: 'Temperatura', development: 1.234,
    series: [{ date: '2026-09-22', mpi: 40.26, confidence: 70, dataQuality: 68.6, forecastCertainty: 100, provenance: 'MODELLED', rainMm: 1.26, tMinC: 9.94, tMaxC: 20.01, windMs: 8.777777 }],
    nearbyMunicipalities: [{ municipality: 'Vicino', province: 'Lucca', provinceAcronym: 'LU', distanceKm: 3 }],
    weather: {
      rain24h: 0, rain72h: 0, rain7d: 0, rain14d: 0, rain26d: 100,
      effectiveWaterMm: 50, initialDeficitMm: 0, et0_7d: 0, et0_14d: 0,
      tMean20d: 15, tMinWindow: 8, tMaxWindow: 24,
      soilTemperatureMean: 15, soilMoisture: 0.25, vpdMean7d: 0.6, windMean7d: 2, humidityMean7d: 70,
    },
    positiveFactors: [{ key: 'water', label: 'Acqua', contribution: 5, value: '50mm', provenance: 'calibrate' }],
    negativeFactors: [{ key: 'thermal', label: 'Temperatura', contribution: -8, value: '15°C', provenance: 'sourced' }],
    neutralFactors: [],
    stations: withStations
      ? [{ code: 'S1', name: 'Stazione', latitude: 44, longitude: 10.4, elevationM: 900, distanceKm: 3, elevationDiffM: 100, effectiveKm: 3, variable: 'pioggia' }]
      : [],
    bestWindow: { peakDate: '2026-09-23', peakMpi: 45, start: '2026-09-22', end: '2026-09-24', narrative: 'Il potenziale sale.' },
    observedDays: 60, windowDays: 61, lastObservedDate: '2026-09-21',
    thermalOptimumC: 13, lapseRateCPerKm: -0.6,
  }
}

function snapshot(zones: SnapshotZone[]): Snapshot {
  return {
    schemaVersion: '1', generatedAt: '2026-09-26T01:00:00Z', algorithmVersion: '1.6.1-porcino',
    referenceDate: '2026-09-22', zones, sources: [], uncalibratedParams: [],
  } as Snapshot
}

describe('proiezione delle zone', () => {
  it('tiene tutti i numeri, arrotondati a un decimale', () => {
    const z = toApiZone(zone('a', true))
    expect(z.mpi).toBe(40.3)
    expect(z.dataQuality).toBe(68.7)
    expect(z.series[0]).toMatchObject({ rainMm: 1.3, tMinC: 9.9, tMaxC: 20, windMs: 8.8 })
  })

  it('toglie le frasi scritte per l\'interfaccia', () => {
    const z = toApiZone(zone('a', true)) as unknown as Record<string, unknown>
    for (const field of ['positiveFactors', 'negativeFactors', 'neutralFactors', 'bestWindow', 'nearbyMunicipalities', 'stationNotes', 'weather', 'stations']) {
      expect(z).not.toHaveProperty(field)
    }
  })

  it('una zona senza stazioni è «solo modello», e lo dice', () => {
    expect(isModelOnly(zone('a', false))).toBe(true)
    expect(toApiZone(zone('a', false))).toMatchObject({ modelOnly: true, stationCount: 0 })
    expect(toApiZone(zone('b', true))).toMatchObject({ modelOnly: false, stationCount: 1 })
  })

  it('un giorno fuori dalla serie dà null, mai il valore di un altro giorno', () => {
    expect(zoneOnDate(zone('a', true), '2099-01-01')).toMatchObject({ mpi: null, confidence: null, provenance: null })
    expect(zoneOnDate(zone('a', true), '2026-09-22').mpi).toBe(40.26)
  })
})

// La rotta, con i file finti: una zona di taratura, due regioni, una delle quali illeggibile.
const calibration = snapshot([zone('amiata', true)])
const toscana = snapshot([zone('it-t1', true), zone('it-t2', false)])
const index = {
  generatedAt: '2026-09-26T01:00:00Z', algorithmVersion: '1.6.1-porcino', referenceDate: '2026-09-22',
  regions: [{ name: 'Toscana', slug: 'toscana', zoneCount: 2 }, { name: 'Molise', slug: 'molise', zoneCount: 1 }],
  zones: [
    { code: 'it-t1', name: 'T1', region: 'Toscana', regionSlug: 'toscana', provinceAcronym: 'LU', latitude: 44, longitude: 10, elevationM: 900, mpi: 40, mpiRaw: 40, label: 'discrete', confidence: 70, limitingFactor: null, development: 0 },
    { code: 'it-t2', name: 'T2', region: 'Toscana', regionSlug: 'toscana', provinceAcronym: 'LU', latitude: 44, longitude: 10, elevationM: 900, mpi: 30, mpiRaw: 30, label: 'poco favorevoli', confidence: 50, limitingFactor: null, development: 0 },
    { code: 'it-m1', name: 'M1', region: 'Molise', regionSlug: 'molise', provinceAcronym: 'CB', latitude: 41, longitude: 14, elevationM: 900, mpi: 20, mpiRaw: 20, label: 'sfavorevoli', confidence: 40, limitingFactor: null, development: 0 },
  ],
}

vi.mock('@/lib/snapshot/load', () => ({ loadSnapshot: async () => calibration }))
vi.mock('@/lib/snapshot/load-italia', () => ({
  loadItaliaIndex: async () => index,
  // Il Molise «non si legge»: le sue zone non devono diventare né solide né solo modello.
  loadRegion: async (slug: string) => (slug === 'toscana' ? toscana : null),
}))

const { GET } = await import('@/app/api/v1/mpi/route')

async function get(query: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await GET(new Request(`https://example.test/api/v1/mpi${query}`))
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe('rotta /api/v1/mpi', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('senza parametri resta quella di prima: le zone di taratura, dettaglio completo', async () => {
    const { status, body } = await get('')
    expect(status).toBe(200)
    const zones = body['zones'] as Array<Record<string, unknown>>
    expect(zones.map((z) => z['code'])).toEqual(['amiata'])
    // Il dettaglio completo di prima c'è ancora: nessuno che lo leggeva lo perde.
    expect(zones[0]).toHaveProperty('positiveFactors')
    expect(zones[0]).toMatchObject({ modelOnly: false })
    expect(body['moreZones']).toBe('/api/v1/mpi?region=all')
  })

  it('region=<slug> dà tutte le zone della regione, in forma di dati', async () => {
    const { status, body } = await get('?region=toscana')
    expect(status).toBe(200)
    expect(body['region']).toBe('toscana')
    const zones = body['zones'] as Array<Record<string, unknown>>
    expect(zones.map((z) => [z['code'], z['modelOnly']])).toEqual([['it-t1', false], ['it-t2', true]])
    expect(zones[0]).not.toHaveProperty('positiveFactors')
  })

  it('region=<slug>&date=… dà quel giorno', async () => {
    const { body } = await get('?region=toscana&date=2026-09-22')
    expect(body['date']).toBe('2026-09-22')
    expect((body['zones'] as Array<Record<string, unknown>>)[0]).toMatchObject({ mpi: 40.26 })
  })

  it('region=all dà ogni zona d\'Italia, e modelOnly è null dove non lo sa', async () => {
    const { status, body } = await get('?region=all')
    expect(status).toBe(200)
    const zones = body['zones'] as Array<Record<string, unknown>>
    expect(zones.map((z) => [z['code'], z['modelOnly']])).toEqual([
      ['it-t1', false],
      ['it-t2', true],
      // La regione del Molise non si è letta: né «solida» né «solo modello», ma «non lo so».
      ['it-m1', null],
    ])
  })

  it('region=all con una data risponde 400 e spiega perché', async () => {
    const { status, body } = await get('?region=all&date=2026-09-22')
    expect(status).toBe(400)
    expect(String(body['error'])).toContain('?region=toscana&date=2026-09-22')
  })

  it('una regione sconosciuta risponde 404 con l\'elenco di quelle valide', async () => {
    const { status, body } = await get('?region=atlantide')
    expect(status).toBe(404)
    expect(body['regions']).toEqual(['all', 'toscana', 'molise'])
  })

  it('zone=<codice> trova anche una zona nazionale, senza chiedere la regione', async () => {
    const { status, body } = await get('?zone=it-t2')
    expect(status).toBe(200)
    expect(body['region']).toBe('toscana')
    expect((body['zones'] as Array<Record<string, unknown>>)[0]).toMatchObject({ code: 'it-t2', modelOnly: true })
  })

  it('zone=<codice> di una zona di taratura risponde come prima', async () => {
    const { body } = await get('?zone=amiata')
    expect((body['zones'] as Array<Record<string, unknown>>)[0]).toHaveProperty('positiveFactors')
  })

  it('una zona che non esiste da nessuna parte risponde 404', async () => {
    expect((await get('?zone=nonesiste')).status).toBe(404)
    // Anche se è nell'indice ma la sua regione non si legge: niente risposta inventata.
    expect((await get('?zone=it-m1')).status).toBe(404)
  })
})
