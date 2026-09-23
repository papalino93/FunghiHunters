/**
 * Le zone che seguo non devono mai toccare l'ordinamento generale — esplicitamente chiesto da
 * Andrea. `rankZones()` (src/lib/recommend/rank.ts) non importa nulla dal modulo delle zone
 * seguite, quindi l'unico modo per essere sicuri è dimostrarlo: seguire/non seguire zone fra due
 * chiamate non deve cambiare né l'ordine né i punteggi calcolati.
 */

import { describe, expect, it } from 'vitest'

import type { SnapshotZone } from '@/lib/snapshot/types'
import { rankZones } from '@/lib/recommend/rank'
import { InMemoryFollowedZoneRepository } from '@/lib/zones/store'

const TODAY = '2026-09-17'

function zone(code: string, mpi: number, confidence = 70): SnapshotZone {
  const series = [{ date: TODAY, mpi }]
  return {
    code,
    name: code,
    reference: code,
    province: 'LU',
    municipality: null,
    latitude: 44,
    longitude: 10.4,
    elevationM: 1000,
    forest: ['faggeta'],
    stationNotes: '',
    mpi,
    confidence,
    label: 'condizioni poco favorevoli',
    limitingFactor: 'Temperatura',
    development: 0,
    series: series.map((p) => ({
      date: p.date,
      mpi: p.mpi,
      confidence,
      dataQuality: confidence,
      forecastCertainty: 100,
      provenance: 'MODELLED' as const,
      rainMm: 0,
      tMinC: 10,
      tMaxC: 18,
      windMs: null,
    })),
    weather: {
      rain24h: 0, rain72h: 0, rain7d: 0, rain14d: 0, rain26d: 0,
      effectiveWaterMm: 0, initialDeficitMm: 0, et0_7d: 0, et0_14d: 0,
      tMean20d: 18, tMinWindow: 8, tMaxWindow: 24, soilTemperatureMean: 15,
      soilMoisture: 0.2, vpdMean7d: 0.6, windMean7d: 2, humidityMean7d: 70,
    },
    positiveFactors: [], negativeFactors: [], neutralFactors: [], stations: [],
    dataQuality: confidence, forecastCertainty: 100,
    bestWindow: null, observedDays: 0, windowDays: 61, lastObservedDate: null,
    thermalOptimumC: 13, lapseRateCPerKm: null, nearbyMunicipalities: [],
  }
}

describe('rankZones non dipende dalle zone seguite', () => {
  it('seguire e non seguire zone fra due chiamate non cambia ordine né punteggi', async () => {
    const zones = [zone('amiata', 45), zone('garfagnana', 30), zone('mugello', 60)]
    const options = { date: TODAY, from: null }

    const before = rankZones(zones, options)

    const repo = new InMemoryFollowedZoneRepository()
    await repo.follow({ zoneCode: 'amiata', zoneName: 'Monte Amiata', regionSlug: 'toscana' })
    await repo.follow({ zoneCode: 'garfagnana', zoneName: 'Garfagnana', regionSlug: 'toscana' })
    await repo.unfollow('amiata')

    const after = rankZones(zones, options)

    expect(after).toEqual(before)
    expect(after.map((s) => s.zone.code)).toEqual(['mugello', 'amiata', 'garfagnana'])
  })
})
