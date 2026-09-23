import { describe, expect, it } from 'vitest'

import { formatAnnotation } from '@/lib/pipeline/ci-report'

describe('formatAnnotation', () => {
  it('su GitHub Actions produce un comando di workflow, con i delimitatori codificati', () => {
    // Senza codifica un messaggio su piu' righe verrebbe troncato alla prima, e una virgola nel
    // titolo spezzerebbe la proprieta'.
    expect(formatAnnotation('warning', 'Lombardia, Piemonte: parziale', 'riga 1\nriga 2 100%', true)).toBe(
      '::warning title=Lombardia%2C Piemonte%3A parziale::riga 1%0Ariga 2 100%25',
    )
  })

  it('fuori da Actions resta una riga di log leggibile', () => {
    expect(formatAnnotation('error', 'SIR', 'giu\'', false)).toBe('[ERRORE] SIR: giu\'')
  })
})
