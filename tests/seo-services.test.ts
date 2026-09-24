import { describe, expect, it } from 'vitest'

import { sanitizeAnalyticsUrl, verificationMetadata } from '@/lib/seo/services'

describe('statistiche di visita', () => {
  it('tengono regione, zona e giorno e tolgono tutto il resto', () => {
    expect(
      sanitizeAnalyticsUrl('https://x.it/mappa?regione=toscana&zona=MUG&giorno=2026-09-24&lat=43.9&lon=11.4#a'),
    ).toBe('https://x.it/mappa?regione=toscana&zona=MUG&giorno=2026-09-24')
    expect(sanitizeAnalyticsUrl('https://x.it/meteo?q=Borgo%20San%20Lorenzo')).toBe('https://x.it/meteo')
    expect(sanitizeAnalyticsUrl('non-un-url')).toBe('non-un-url')
  })

  it('dichiara il codice di Search Console, e Bing solo se c è', () => {
    expect(verificationMetadata()).toEqual({ google: 'ZwRfVgagH0Z99--Lb7LQUJlIfA_rO4vNtbZm0ySJ4Gw' })
  })
})
