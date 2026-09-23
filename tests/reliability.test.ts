/**
 * Etichetta di affidabilità (`components/today/Reliability.tsx`): pura, nessun rendering.
 *
 * Il punto da proteggere: una zona nazionale senza una sola stazione vicina non deve mai potersi
 * dire "stima solida", qualunque sia la sua `dataQuality` — quell'aggettivo si guadagna con le
 * osservazioni, non con la sola risoluzione del modello meteo.
 */

import { describe, expect, it } from 'vitest'

import { reliabilityLabel } from '@/components/today/Reliability'

describe('con stazioni reali (una delle sette zone toscane tarate)', () => {
  it('"stima solida" da 70 in su', () => {
    expect(reliabilityLabel(70, true).label).toBe('stima solida')
    expect(reliabilityLabel(95, true).label).toBe('stima solida')
  })

  it('"stima discreta" fra 50 e 70', () => {
    expect(reliabilityLabel(50, true).label).toBe('stima discreta')
    expect(reliabilityLabel(69, true).label).toBe('stima discreta')
  })

  it('"stima incerta" sotto 50', () => {
    expect(reliabilityLabel(49, true).label).toBe('stima incerta')
    expect(reliabilityLabel(0, true).label).toBe('stima incerta')
  })
})

describe('senza stazioni (zona nazionale di solo modello)', () => {
  it('non dice mai "stima solida", nemmeno con dataQuality alta', () => {
    // Il caso reale trovato in revisione: una zona del Piemonte con dataQuality 68.8 e zero
    // stazioni prendeva la stessa etichetta di una zona toscana tarata con lo stesso numero.
    expect(reliabilityLabel(68.8, false).label).not.toBe('stima solida')
    expect(reliabilityLabel(99, false).label).not.toBe('stima solida')
  })

  it('resta "anteprima, solo modello" da 50 in su, non "stima discreta"', () => {
    expect(reliabilityLabel(68.8, false).label).toBe('anteprima, solo modello')
    expect(reliabilityLabel(50, false).label).toBe('anteprima, solo modello')
  })

  it('scende comunque a "incerta" sotto 50: la distinzione non appiattisce il numero', () => {
    expect(reliabilityLabel(49, false).label).toBe('anteprima, solo modello, incerta')
  })

  it('a parità di dataQuality, non è mai più affidabile di una zona con stazioni', () => {
    const conStazioni = reliabilityLabel(68.8, true)
    const senzaStazioni = reliabilityLabel(68.8, false)
    expect(senzaStazioni.label).not.toBe(conStazioni.label)
  })
})
