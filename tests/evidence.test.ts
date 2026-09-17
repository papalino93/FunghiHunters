/**
 * Test della classificazione dell'evidenza scientifica dei parametri.
 *
 * Il rischio concreto che questi test prevengono: un parametro citato senza che la sua
 * trasferibilità alla Toscana sia mai stata valutata, o una valutazione che punta a una fonte
 * che non esiste (refuso nella chiave). Non verificano che i NUMERI siano giusti — quello lo fa
 * la revisione della letteratura, non un test — ma che la struttura sia completa e coerente.
 */

import { describe, expect, it } from 'vitest'

import {
  ALGORITHM_V1,
  EVIDENCE,
  REFERENCES,
  evidenceForSource,
  type Param,
} from '@/lib/config/algorithm'

describe('completezza della tabella EVIDENCE', () => {
  it('ha esattamente una valutazione per ogni riferimento, e viceversa', () => {
    const refKeys = Object.keys(REFERENCES).sort()
    const evidenceKeys = Object.keys(EVIDENCE).sort()
    expect(evidenceKeys).toEqual(refKeys)
  })

  it('ogni valutazione dichiara tutti i campi richiesti, senza stringhe vuote', () => {
    for (const [key, evidence] of Object.entries(EVIDENCE)) {
      for (const [field, value] of Object.entries(evidence)) {
        if (field === 'status') continue
        expect(value, `${key}.${field}`).not.toBe('')
      }
    }
  })

  it('ogni valutazione ha uno stato valido', () => {
    const valid = ['applicable', 'applicable-with-caution', 'not-applicable-without-calibration']
    for (const [key, evidence] of Object.entries(EVIDENCE)) {
      expect(valid, key).toContain(evidence.status)
    }
  })
})

describe('collegamento parametro → evidenza', () => {
  it('trova la valutazione a partire dalla citazione salvata sul parametro', () => {
    const evidence = evidenceForSource(ALGORITHM_V1.trigger.intenseEventMm.source)
    expect(evidence).toBeDefined()
    expect(evidence?.status).toBe('applicable')
    expect(evidence?.geographicArea).toContain('Amiata')
  })

  it('non trova nulla per un parametro senza fonte', () => {
    expect(evidenceForSource(undefined)).toBeUndefined()
  })

  it('non trova nulla per un testo che non corrisponde a nessun riferimento', () => {
    expect(evidenceForSource('una citazione inventata')).toBeUndefined()
  })

  it('ogni parametro sourced dell\'algoritmo punta a un\'evidenza reale', () => {
    const missing: string[] = []
    const walk = (node: unknown, path: string): void => {
      if (node === null || typeof node !== 'object') return
      if (isParam(node)) {
        if (node.provenance === 'sourced' && evidenceForSource(node.source) === undefined) {
          missing.push(path)
        }
        return
      }
      for (const [key, child] of Object.entries(node)) walk(child, path === '' ? key : `${path}.${key}`)
    }
    walk(ALGORITHM_V1, '')
    expect(missing).toEqual([])
  })
})

describe('coerenza fra tier e stato', () => {
  // Un parametro peer-reviewed sulla Toscana stessa non dovrebbe portare una cautela di
  // trasferibilità: se ce l'ha, la classificazione non è coerente con se stessa.
  it('le fonti locali (Amiata, cross-validation) sono applicable senza riserve', () => {
    expect(EVIDENCE.salerni2023.status).toBe('applicable')
    expect(EVIDENCE.sirCrossValidation2026.status).toBe('applicable')
  })

  it('la fonte tedesca su faggeta europea porta una cautela esplicita di area geografica', () => {
    expect(EVIDENCE.brejon2026.status).toBe('applicable-with-caution')
    expect(EVIDENCE.brejon2026.geographicArea).toMatch(/germania/i)
  })
})

function isParam(node: object): node is Param {
  return 'value' in node && 'provenance' in node
}
