/**
 * Test dei punti salvati (auto parcheggiata, punto a cui tornare) e delle funzioni di
 * orientamento che li accompagnano.
 */

import { describe, expect, it } from 'vitest'

import { InMemoryWaypointRepository } from '@/lib/waypoints/store'
import {
  bearingDegrees,
  compassLabel,
  departurePoints,
  directionsUrl,
  distanceMeters,
  normaliseWaypoint,
  unassociatedWaypoints,
  waypointsForEntry,
} from '@/lib/waypoints/types'

describe('distanza', () => {
  it('è zero fra un punto e se stesso', () => {
    const p = { latitude: 44.1, longitude: 10.4 }
    expect(distanceMeters(p, p)).toBe(0)
  })

  it('un grado di latitudine vale circa 111 km', () => {
    const a = { latitude: 44.0, longitude: 10.0 }
    const b = { latitude: 45.0, longitude: 10.0 }
    expect(distanceMeters(a, b)).toBeCloseTo(111_195, -3)
  })
})

describe('rotta bussola', () => {
  it('dritto a nord fa 0 gradi', () => {
    const a = { latitude: 44.0, longitude: 10.0 }
    const b = { latitude: 45.0, longitude: 10.0 }
    expect(bearingDegrees(a, b)).toBeCloseTo(0, 0)
  })

  it('dritto a est fa circa 90 gradi', () => {
    const a = { latitude: 44.0, longitude: 10.0 }
    const b = { latitude: 44.0, longitude: 11.0 }
    expect(bearingDegrees(a, b)).toBeCloseTo(90, 0)
  })

  it('dritto a sud fa 180 gradi', () => {
    const a = { latitude: 44.0, longitude: 10.0 }
    const b = { latitude: 43.0, longitude: 10.0 }
    expect(bearingDegrees(a, b)).toBeCloseTo(180, 0)
  })
})

describe('punto cardinale in parole', () => {
  it('copre le quattro direzioni principali', () => {
    expect(compassLabel(0)).toBe('nord')
    expect(compassLabel(90)).toBe('est')
    expect(compassLabel(180)).toBe('sud')
    expect(compassLabel(270)).toBe('ovest')
  })

  it('gestisce il giro completo senza uscire dall\'elenco', () => {
    expect(compassLabel(359)).toBe('nord')
    expect(compassLabel(360)).toBe('nord')
  })
})

describe('link di navigazione', () => {
  it('punta alle coordinate del punto, leggibile da qualunque app mappe', () => {
    const url = directionsUrl({ latitude: 44.1, longitude: 10.4 })
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=44.1,10.4')
  })
})

describe('archivio punti salvati', () => {
  it('salva e ritrova un punto', async () => {
    const repo = new InMemoryWaypointRepository()
    const saved = await repo.add({ kind: 'car', label: 'Auto', latitude: 44.1, longitude: 10.4 })
    expect(saved.id).toBeTruthy()
    expect(await repo.list()).toHaveLength(1)
  })

  it('elenca dal più recente', async () => {
    const repo = new InMemoryWaypointRepository()
    const first = await repo.add({ kind: 'reference', label: 'Primo', latitude: 44, longitude: 10 })
    await new Promise((r) => setTimeout(r, 2))
    const second = await repo.add({ kind: 'reference', label: 'Secondo', latitude: 44, longitude: 10 })
    const list = await repo.list()
    expect(list[0]?.id).toBe(second.id)
    expect(list[1]?.id).toBe(first.id)
  })

  it('rimuove un punto salvato', async () => {
    const repo = new InMemoryWaypointRepository()
    const saved = await repo.add({ kind: 'car', label: 'Auto', latitude: 44.1, longitude: 10.4 })
    await repo.remove(saved.id)
    expect(await repo.list()).toHaveLength(0)
  })

  it('un punto senza entryId indicato è libero, non associato a nessuna uscita', async () => {
    const repo = new InMemoryWaypointRepository()
    const saved = await repo.add({ kind: 'car', label: 'Auto', latitude: 44.1, longitude: 10.4 })
    expect(saved.entryId).toBeNull()
  })

  it('associa un punto a una specifica uscita', async () => {
    const repo = new InMemoryWaypointRepository()
    const saved = await repo.add({
      entryId: 'uscita-1',
      kind: 'reference',
      label: 'Bivio',
      latitude: 44.1,
      longitude: 10.4,
    })
    expect(saved.entryId).toBe('uscita-1')
  })

  it('removeAllFor() toglie solo i punti di quella uscita', async () => {
    const repo = new InMemoryWaypointRepository()
    await repo.add({ entryId: 'uscita-1', kind: 'car', label: 'Auto', latitude: 44, longitude: 10 })
    await repo.add({ entryId: 'uscita-2', kind: 'car', label: 'Auto', latitude: 44, longitude: 10 })
    await repo.add({ kind: 'departure', label: 'Casa', latitude: 44, longitude: 10 }) // libero
    await repo.removeAllFor('uscita-1')
    const remaining = await repo.list()
    expect(remaining).toHaveLength(2)
    expect(remaining.some((p) => p.entryId === 'uscita-1')).toBe(false)
  })
})

describe('filtri sui punti (fissi, per uscita, di partenza)', () => {
  const points = [
    { id: 'a', entryId: null, kind: 'departure' as const, label: 'Casa', latitude: 44, longitude: 10, createdAt: '2026-09-01T00:00:00Z' },
    { id: 'b', entryId: null, kind: 'car' as const, label: 'Auto', latitude: 44, longitude: 10, createdAt: '2026-09-01T00:00:00Z' },
    { id: 'c', entryId: 'uscita-1', kind: 'reference' as const, label: 'Bivio', latitude: 44, longitude: 10, createdAt: '2026-09-01T00:00:00Z' },
  ]

  it('unassociatedWaypoints() prende solo i punti fissi', () => {
    expect(unassociatedWaypoints(points).map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('waypointsForEntry() prende solo i punti di quella uscita', () => {
    expect(waypointsForEntry(points, 'uscita-1').map((p) => p.id)).toEqual(['c'])
    expect(waypointsForEntry(points, 'uscita-2')).toEqual([])
  })

  it('departurePoints() prende solo i punti di partenza fissi', () => {
    expect(departurePoints(points).map((p) => p.id)).toEqual(['a'])
  })
})

describe('compatibilità con i punti salvati prima delle quattro categorie', () => {
  it('un punto con kind "point" (il valore generico di prima) diventa "reference"', () => {
    const legacy = normaliseWaypoint({ id: 'vecchio', kind: 'point', label: 'Un posto', latitude: 44, longitude: 10, createdAt: '2026-01-01T00:00:00Z' })
    expect(legacy?.kind).toBe('reference')
  })

  it('un punto salvato prima di entryId diventa un punto fisso, non sparisce', () => {
    const legacy = normaliseWaypoint({ id: 'vecchio', kind: 'car', label: 'Auto', latitude: 44, longitude: 10, createdAt: '2026-01-01T00:00:00Z' })
    expect(legacy?.entryId).toBeNull()
  })

  it('scarta un punto senza coordinate leggibili invece di metterlo a (0, 0)', () => {
    // (0, 0) è in mezzo all'Atlantico: mostrarlo significherebbe inventare una posizione.
    expect(normaliseWaypoint({ id: 'rotto', kind: 'car', label: 'Auto' })).toBeNull()
    expect(normaliseWaypoint({ id: 'rotto', kind: 'car', latitude: 44 })).toBeNull()
  })

  it('non lancia su un kind sconosciuto: ricade su "reference"', () => {
    expect(() => normaliseWaypoint({ id: 'x', kind: 'boh', latitude: 44, longitude: 10 })).not.toThrow()
    expect(normaliseWaypoint({ id: 'x', kind: 'boh', latitude: 44, longitude: 10 })?.kind).toBe('reference')
  })
})
