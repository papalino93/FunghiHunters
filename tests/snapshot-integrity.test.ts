/**
 * Integrità dello snapshot: la versione del modello dichiarata nel file deve corrispondere a
 * quella che gira nell'app che lo legge, altrimenti la spiegazione dei punteggi (`explainScore`)
 * descrive un modello diverso da quello che ha prodotto i numeri mostrati.
 */

import { describe, expect, it } from 'vitest'

import { ALGORITHM_V1 } from '@/lib/config/algorithm'
import { hasValidShape } from '@/lib/snapshot/load'
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

describe('forma minima dello snapshot', () => {
  it('accetta uno snapshot completo', () => {
    expect(hasValidShape(snapshot())).toBe(true)
  })

  it('rifiuta quello che non è nemmeno un oggetto', () => {
    expect(hasValidShape(null)).toBe(false)
    expect(hasValidShape('snapshot')).toBe(false)
    expect(hasValidShape(42)).toBe(false)
  })

  it('rifiuta uno snapshot senza uncalibratedParams: la home ne legge .length senza guardia', () => {
    // Non teorico: `SourceHealth` fa `snapshot.uncalibratedParams.length`. Uno snapshot di un
    // formato precedente che non lo avesse passava il controllo e faceva esplodere la home —
    // proprio il caso che questa validazione esiste per intercettare.
    const senzaCampo: Record<string, unknown> = { ...snapshot() }
    delete senzaCampo['uncalibratedParams']
    expect(hasValidShape(senzaCampo)).toBe(false)
  })

  it('rifiuta i campi di tipo sbagliato, non solo quelli assenti', () => {
    expect(hasValidShape({ ...snapshot(), zones: 'nessuna' })).toBe(false)
    expect(hasValidShape({ ...snapshot(), sources: null })).toBe(false)
    expect(hasValidShape({ ...snapshot(), algorithmVersion: 12 })).toBe(false)
  })
})

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
