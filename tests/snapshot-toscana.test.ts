import { describe, expect, it } from 'vitest'

import type { Station } from '@/lib/domain/types'
import type { Snapshot, SnapshotZone } from '@/lib/snapshot/types'
import { pickStations, selectTuscanZones, withTuscany } from '@/../scripts/build-snapshot-toscana'
import type { ItaliaIndex } from '@/../scripts/build-snapshot-italia'

const zone = (code: string) => ({
  code, name: code, region: 'Toscana', province: 'Firenze', provinceAcronym: 'FI',
  latitude: 43.7, longitude: 11.1, elevationM: 300, forest: [],
})

const station = (code: string, lat: number, lon: number): Station => ({
  code, name: code, nameRaw: code, municipality: null, province: null, elevationM: 100,
  latitude: lat, longitude: lon, sourceCode: 'SIR', measures: [],
})

describe('Toscana completa', () => {
  it('tiene solo i comuni con abbastanza bosco', () => {
    const forest = new Map([['a', { forestFraction: 0.7 }], ['b', { forestFraction: 0.1 }]])
    expect(selectTuscanZones([zone('a'), zone('b'), zone('c')], forest, 0.4).map((z) => z.code)).toEqual(['a'])
  })

  it('una stazione per cella, la più centrale', () => {
    const picked = pickStations([station('bordo', 43.701, 11.101), station('centro', 43.745, 11.105), station('altra', 44.5, 10.5)], 0.12)
    expect(picked.map((s) => s.code).sort()).toEqual(['altra', 'centro'])
  })

  it('sostituisce solo le voci toscane dell\'indice', () => {
    const index = {
      generatedAt: 'x', algorithmVersion: 'v', referenceDate: '2026-09-25',
      regions: [{ name: 'Lazio', slug: 'lazio', zoneCount: 1 }, { name: 'Toscana', slug: 'toscana', zoneCount: 24 }],
      zones: [{ code: 'l', regionSlug: 'lazio' }, { code: 'vecchia', regionSlug: 'toscana' }],
    } as unknown as ItaliaIndex
    const z = { code: 'nuova', name: 'Nuova', province: 'FI', latitude: 43.7, longitude: 11.1, elevationM: 300, mpi: 70, mpiRaw: 70, label: 'x', confidence: 80, limitingFactor: null, development: 0, series: [] } as unknown as SnapshotZone
    const out = withTuscany(index, { zones: [z] } as unknown as Snapshot, '2026-09-25')
    expect(out.zones.map((e) => e.code)).toEqual(['l', 'nuova'])
    expect(out.regions.find((r) => r.slug === 'toscana')?.zoneCount).toBe(1)
    expect(out.regions).toHaveLength(2)
  })
})
