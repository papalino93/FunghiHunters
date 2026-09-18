/**
 * Integrità dello snapshot: la versione del modello dichiarata nel file deve corrispondere a
 * quella che gira nell'app che lo legge, altrimenti la spiegazione dei punteggi (`explainScore`)
 * descrive un modello diverso da quello che ha prodotto i numeri mostrati.
 */

import { describe, expect, it } from 'vitest'

import { ALGORITHM_V1 } from '@/lib/config/algorithm'
import { algorithmVersionMismatch, type Snapshot } from '@/lib/snapshot/types'

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    generatedAt: '2026-09-18T06:00:00.000Z',
    algorithmVersion: ALGORITHM_V1.version,
    referenceDate: '2026-09-18',
    zones: [{} as Snapshot['zones'][number]],
    sources: [],
    uncalibratedParams: [],
    ...overrides,
  }
}

describe('algorithmVersionMismatch', () => {
  it('nessun disallineamento quando le versioni coincidono', () => {
    expect(algorithmVersionMismatch(snapshot())).toBe(false)
  })

  it('segnala il disallineamento quando lo snapshot porta una versione diversa', () => {
    expect(algorithmVersionMismatch(snapshot({ algorithmVersion: '0.9.0-porcino' }))).toBe(true)
  })

  it('non si esprime su uno snapshot vuoto: non c\'è niente da confrontare', () => {
    expect(algorithmVersionMismatch(snapshot({ zones: [], algorithmVersion: 'n/d' }))).toBe(false)
  })
})
