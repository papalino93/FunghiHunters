import { describe, expect, it } from 'vitest'

import { regionFromIp } from '@/lib/region/geo'

const KNOWN = [
  { slug: 'toscana', name: 'Toscana' },
  { slug: 'piemonte', name: 'Piemonte' },
  { slug: 'trentino-alto-adige-sudtirol', name: 'Trentino-Alto Adige' },
]

describe('regionFromIp', () => {
  it('traduce il codice ISO della regione italiana', () => {
    expect(regionFromIp('IT', '21', KNOWN)).toBe('piemonte')
    expect(regionFromIp('it', '32', KNOWN)).toBe('trentino-alto-adige-sudtirol')
  })

  it('fuori dall Italia, senza dato o per una regione senza zone: nulla', () => {
    expect(regionFromIp('FR', '21', KNOWN)).toBeNull()
    expect(regionFromIp('IT', null, KNOWN)).toBeNull()
    expect(regionFromIp('IT', '88', KNOWN)).toBeNull()
    expect(regionFromIp(undefined, '52', KNOWN)).toBeNull()
  })
})
