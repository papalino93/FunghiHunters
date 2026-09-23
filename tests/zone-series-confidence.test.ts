/**
 * `zoneConfidence`: il fattore habitat nella spiegazione della confidence.
 *
 * Il punto da proteggere: "non misurato affatto" e "misurato ma genericamente classificato" sono
 * due situazioni diverse, e la frase mostrata deve dirle diversamente — non esiste ancora nessun
 * test su questo fattore (introdotto insieme all'habitat nel punteggio), ed è proprio il tipo di
 * effetto silenzioso che un test avrebbe dovuto intercettare.
 */

import { describe, expect, it } from 'vitest'

import { zoneConfidence, type ZoneConfidenceInput } from '@/lib/pipeline/zone-series'

const BASE: ZoneConfidenceInput = {
  interpolation: new Map(),
  coverage: 1,
}

describe('fattore habitat nella confidence', () => {
  it('nessun fattore quando il bosco è pienamente noto (certainty 1, o assente)', () => {
    expect(zoneConfidence(BASE).factors.some((f) => f.key === 'habitat')).toBe(false)
    expect(
      zoneConfidence({ ...BASE, habitatCertainty: 1, habitatMeasured: true }).factors.some(
        (f) => f.key === 'habitat',
      ),
    ).toBe(false)
  })

  it('dice "non ancora misurato" quando il bosco non è stato misurato affatto', () => {
    const result = zoneConfidence({ ...BASE, habitatCertainty: 0.85, habitatMeasured: false })
    const factor = result.factors.find((f) => f.key === 'habitat')
    expect(factor?.label).toBe('Bosco di questa zona non ancora misurato')
  })

  it('dice "riconosciuto solo in parte" quando è misurato ma genericamente classificato', () => {
    const result = zoneConfidence({ ...BASE, habitatCertainty: 0.85, habitatMeasured: true })
    const factor = result.factors.find((f) => f.key === 'habitat')
    expect(factor?.label).toBe('Tipo di bosco riconosciuto solo in parte')
  })

  it('abbassa comunque score e dataQuality in entrambi i casi, non solo la frase', () => {
    const pieno = zoneConfidence(BASE)
    const scarso = zoneConfidence({ ...BASE, habitatCertainty: 0.5, habitatMeasured: false })
    expect(scarso.score).toBeLessThan(pieno.score)
    expect(scarso.dataQuality).toBeLessThan(pieno.dataQuality)
  })
})
