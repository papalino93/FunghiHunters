import { describe, expect, it } from 'vitest'

import { loadMapRegion, loadReferenceRegion, regionChoices } from '@/lib/snapshot/load-reference'

/**
 * Legge i file veri in `public/data`: è l'unico modo di verificare la regola che conta davvero,
 * cioè che la Toscana delle sette zone di taratura e i ventiquattro comuni toscani del catalogo
 * restino due cose distinte. Con dei dati finti il test passerebbe anche se la distinzione
 * sparisse.
 */
describe('regione di riferimento', () => {
  it('senza preferenza apre la Toscana delle sette zone di taratura', async () => {
    const region = await loadReferenceRegion(undefined)
    expect(region.slug).toBe('toscana')
    expect(region.isTuscanyCalibration).toBe(true)
    expect(region.snapshot.zones.map((z) => z.code)).toContain('garfagnana')
  })

  it('con una preferenza apre quella regione', async () => {
    const region = await loadReferenceRegion('trentino-alto-adige-sudtirol')
    expect(region.slug).toBe('trentino-alto-adige-sudtirol')
    expect(region.isTuscanyCalibration).toBe(false)
    expect(region.snapshot.zones.length).toBeGreaterThan(0)
    expect(region.snapshot.zones.every((z) => z.code.startsWith('it-'))).toBe(true)
  })

  it('riporta a casa una preferenza che non esiste, invece di mostrare il vuoto', async () => {
    for (const candidate of ['regione-inventata', '../../etc/passwd', '']) {
      const region = await loadReferenceRegion(candidate)
      expect(region.slug).toBe('toscana')
      expect(region.snapshot.zones.length).toBeGreaterThan(0)
    }
  })

  it('offre tutte e venti le regioni fra cui scegliere', async () => {
    const choices = await regionChoices()
    expect(choices.length).toBe(20)
    expect(choices.map((c) => c.slug)).toContain('toscana')
  })
})

describe('regione della mappa', () => {
  it('un `regione` esplicito apre il catalogo di quella regione', async () => {
    const region = await loadMapRegion('piemonte', 'toscana')
    expect(region.slug).toBe('piemonte')
    expect(region.snapshot.zones.length).toBeGreaterThan(0)
  })

  it('in Toscana le due strade portano a due elenchi diversi, ed è voluto', async () => {
    // Dal catalogo (Italia → Toscana) si vogliono i comuni; dalla home, le zone di taratura.
    const comuni = await loadMapRegion('toscana', undefined)
    const taratura = await loadMapRegion(undefined, 'toscana')
    expect(comuni.isTuscanyCalibration).toBe(false)
    expect(taratura.isTuscanyCalibration).toBe(true)
    expect(comuni.snapshot.zones.map((z) => z.code)).not.toEqual(
      taratura.snapshot.zones.map((z) => z.code),
    )
    expect(taratura.snapshot.zones.map((z) => z.code)).toContain('casentino')
    expect(comuni.snapshot.zones.every((z) => z.code.startsWith('it-'))).toBe(true)
  })

  it('senza parametro e senza cookie resta la Toscana di sempre', async () => {
    const region = await loadMapRegion(undefined, undefined)
    expect(region.slug).toBe('toscana')
    expect(region.isTuscanyCalibration).toBe(true)
  })

  it('un `regione` inventato non fa sparire la mappa', async () => {
    const region = await loadMapRegion('non-esiste', 'piemonte')
    expect(region.slug).toBe('piemonte')
    expect(region.snapshot.zones.length).toBeGreaterThan(0)
  })
})
