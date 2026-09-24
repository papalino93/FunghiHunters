import { describe, expect, it } from 'vitest'

import { ALGORITHM_V1 } from '@/lib/config/algorithm'
import { MODEL_CHANGELOG } from '@/lib/config/changelog'

describe('storia delle versioni del modello', () => {
  it('la prima voce è la versione in produzione', () => {
    expect(MODEL_CHANGELOG[0]?.version).toBe(ALGORITHM_V1.version)
  })

  it('dalla più recente alla più vecchia', () => {
    const dates = MODEL_CHANGELOG.map((r) => r.date)
    expect([...dates].sort().reverse()).toEqual(dates)
  })
})
