import { describe, expect, it } from 'vitest'

import {
  DEFAULT_REGION_SLUG,
  REGION_COOKIE,
  isRegionSlug,
  regionCookieAssignment,
  regionFromCookieHeader,
  resolveRegionSlug,
  type RegionChoice,
} from '@/lib/region/preference'

const CHOICES: RegionChoice[] = [
  { slug: 'toscana', name: 'Toscana' },
  { slug: 'piemonte', name: 'Piemonte' },
  { slug: 'trentino-alto-adige-sudtirol', name: 'Trentino-Alto Adige/Südtirol' },
]

describe('isRegionSlug', () => {
  it('accetta gli slug reali del catalogo, trattini compresi', () => {
    expect(isRegionSlug('toscana')).toBe(true)
    expect(isRegionSlug('valle-d-aosta-vallee-d-aoste')).toBe(true)
  })

  it('rifiuta quello che un cookie manomesso potrebbe contenere', () => {
    // Il valore finisce in un `join()` verso il filesystem: questo non è un formalismo.
    expect(isRegionSlug('../../etc/passwd')).toBe(false)
    expect(isRegionSlug('Toscana')).toBe(false)
    expect(isRegionSlug('a')).toBe(false)
    expect(isRegionSlug('')).toBe(false)
    expect(isRegionSlug(undefined)).toBe(false)
    expect(isRegionSlug(42)).toBe(false)
  })
})

describe('resolveRegionSlug', () => {
  it('tiene la regione chiesta quando esiste', () => {
    expect(resolveRegionSlug('piemonte', CHOICES)).toBe('piemonte')
  })

  it('ricade sulla Toscana quando non c’è nessuna preferenza', () => {
    // È la garanzia data: chi non sceglie niente vede quello che l'app ha sempre mostrato.
    expect(resolveRegionSlug(null, CHOICES)).toBe(DEFAULT_REGION_SLUG)
    expect(resolveRegionSlug(undefined, CHOICES)).toBe(DEFAULT_REGION_SLUG)
  })

  it('ricade sulla Toscana quando la regione salvata non esiste più', () => {
    // Uno slug corretto fra due deploy non deve lasciare l'utente davanti a una pagina vuota.
    expect(resolveRegionSlug('lombardia', CHOICES)).toBe(DEFAULT_REGION_SLUG)
    expect(resolveRegionSlug('../segreti', CHOICES)).toBe(DEFAULT_REGION_SLUG)
  })
})

describe('regionCookieAssignment', () => {
  it('scrive un cookie leggibile dal server, per un anno', () => {
    const value = regionCookieAssignment('piemonte')
    expect(value).toContain(`${REGION_COOKIE}=piemonte`)
    expect(value).toContain('path=/')
    expect(value).toContain('max-age=31536000')
    expect(value).toContain('samesite=lax')
  })

  it('non lascia passare uno slug inventato nemmeno in scrittura', () => {
    expect(regionCookieAssignment('../fuori')).toContain(`${REGION_COOKIE}=${DEFAULT_REGION_SLUG}`)
  })
})

describe('regionFromCookieHeader', () => {
  it('trova la regione fra gli altri cookie', () => {
    expect(regionFromCookieHeader(`altro=1; ${REGION_COOKIE}=piemonte; terzo=x`)).toBe('piemonte')
  })

  it('tollera spazi e assenza', () => {
    expect(regionFromCookieHeader(`  ${REGION_COOKIE} = toscana `)).toBe('toscana')
    expect(regionFromCookieHeader('altro=1')).toBeNull()
    expect(regionFromCookieHeader(null)).toBeNull()
  })

  it('tratta un valore malformato come assente', () => {
    expect(regionFromCookieHeader(`${REGION_COOKIE}=../../etc`)).toBeNull()
  })
})
