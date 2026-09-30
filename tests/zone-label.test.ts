import { describe, expect, it } from 'vitest'

import { elevationText, referenceText, zoneDetail, zoneLabel } from '@/lib/ui/zone-label'

describe('quota accanto al nome della zona', () => {
  it('un comune: nome e quota, senza ripetere il nome', () => {
    expect(zoneLabel({ name: 'Vicchio', reference: 'Vicchio', elevationM: 376 })).toBe('Vicchio · 376 m')
  })

  it('un’area: anche il posto di riferimento', () => {
    expect(zoneLabel({ name: 'Mugello', reference: 'Passo della Futa', elevationM: 900 })).toBe(
      'Mugello · Passo della Futa · 900 m',
    )
  })

  it('niente riferimento se è solo il nome scritto in un altro modo', () => {
    expect(referenceText('Montemignaio', 'MONTEMIGNAIO')).toBeNull()
    expect(referenceText('Pratovecchio Stia', 'Stia')).toBeNull()
    expect(referenceText('Monte Amiata', 'Abbadia San Salvatore')).toBe('Abbadia San Salvatore')
  })

  it('senza quota, solo quello che c’è', () => {
    expect(elevationText(null)).toBeNull()
    expect(elevationText(1053.4)).toBe('1053 m')
    expect(zoneDetail({ name: 'Vicchio' })).toBeNull()
    expect(zoneLabel({ name: 'Vicchio' })).toBe('Vicchio')
  })
})
