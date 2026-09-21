import { describe, expect, it } from 'vitest'

import {
  applyForest,
  type ZoneForest,
  type ZoneWithForest,
} from '@/../scripts/apply-forest-to-snapshots'

const copertura = new Map<string, ZoneForest>([
  ['it-009001', { forest: ['pecceta', 'lariceto'], forestFraction: 0.71 }],
])

describe('applyForest', () => {
  it('scrive il bosco misurato sulle zone che la copertura conosce', () => {
    const zona: ZoneWithForest = { code: 'it-009001', forest: [] }
    const { zones, updated } = applyForest([zona], copertura)
    expect(updated).toBe(1)
    expect(zones[0]?.forest).toEqual(['pecceta', 'lariceto'])
    expect(zones[0]?.forestFraction).toBe(0.71)
  })

  it('lascia intatte le zone che la copertura non conosce', () => {
    // E' il caso delle sette zone toscane di calibrazione: codici diversi, etichette scritte a
    // mano. Sovrascriverle qui vorrebbe dire perderle senza che nessuno lo abbia chiesto.
    const zona: ZoneWithForest = { code: 'amiata', forest: ['castagneto', 'faggeta'] }
    const { zones, updated } = applyForest([zona], copertura)
    expect(updated).toBe(0)
    expect(zones[0]?.forest).toEqual(['castagneto', 'faggeta'])
    expect(zones[0]?.forestFraction).toBeUndefined()
  })

  it('non tocca il resto della zona', () => {
    const zona: ZoneWithForest & { mpi: number; name: string } = {
      code: 'it-009001',
      forest: [],
      mpi: 87.4,
      name: 'Bormio',
    }
    const { zones } = applyForest([zona], copertura)
    expect(zones[0]?.mpi).toBe(87.4)
    expect(zones[0]?.name).toBe('Bormio')
  })
})
