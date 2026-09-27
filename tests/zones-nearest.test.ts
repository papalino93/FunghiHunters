/**
 * `zonesByDistance`: il diario propone da solo la zona più vicina alla posizione GPS.
 * Coordinate reali, per non far passare un test che confonde latitudine e longitudine.
 */

import { describe, expect, it } from 'vitest'

import { FAR_ZONE_KM, zonesByDistance } from '@/lib/zones/nearest'

const zones = [
  { code: 'amiata', name: 'Monte Amiata', latitude: 42.885, longitude: 11.623 },
  { code: 'greve', name: 'Greve in Chianti', latitude: 43.585, longitude: 11.316 },
  { code: 'montemignaio', name: 'Montemignaio', latitude: 43.741, longitude: 11.62 },
  { code: 'abetone', name: 'Abetone', latitude: 44.145, longitude: 10.663 },
]

// San Casciano in Val di Pesa.
const SAN_CASCIANO = { latitude: 43.657, longitude: 11.186 }

describe('zonesByDistance', () => {
  it('da San Casciano la più vicina è Greve, e il Monte Amiata finisce in fondo', () => {
    const ordered = zonesByDistance(zones, SAN_CASCIANO.latitude, SAN_CASCIANO.longitude)
    expect(ordered.map((o) => o.zone.code)).toEqual(['greve', 'montemignaio', 'abetone', 'amiata'])
    expect(ordered[0]?.km).toBeGreaterThan(10)
    expect(ordered[0]?.km).toBeLessThan(FAR_ZONE_KM)
    expect(ordered.at(-1)?.km).toBeGreaterThan(80)
  })

  it('sul punto di una zona la distanza è zero', () => {
    const [first] = zonesByDistance(zones, 44.145, 10.663)
    expect(first?.zone.code).toBe('abetone')
    expect(first?.km).toBeCloseTo(0, 5)
  })

  it('a parità di distanza l\'ordine è sempre lo stesso', () => {
    const twins = [
      { code: 'b', latitude: 43, longitude: 11 },
      { code: 'a', latitude: 43, longitude: 11 },
    ]
    expect(zonesByDistance(twins, 43.1, 11).map((o) => o.zone.code)).toEqual(['a', 'b'])
  })

  it('senza zone, nessun risultato', () => {
    expect(zonesByDistance([], 43, 11)).toEqual([])
  })
})
