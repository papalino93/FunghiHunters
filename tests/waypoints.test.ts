/**
 * Test dei punti salvati (auto parcheggiata, punto a cui tornare) e delle funzioni di
 * orientamento che li accompagnano.
 */

import { describe, expect, it } from 'vitest'

import { InMemoryWaypointRepository } from '@/lib/waypoints/store'
import {
  bearingDegrees,
  compassLabel,
  directionsUrl,
  distanceMeters,
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
    const first = await repo.add({ kind: 'point', label: 'Primo', latitude: 44, longitude: 10 })
    await new Promise((r) => setTimeout(r, 2))
    const second = await repo.add({ kind: 'point', label: 'Secondo', latitude: 44, longitude: 10 })
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
})
