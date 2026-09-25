import { describe, expect, it } from 'vitest'

import { ZONES } from '@/lib/config/zones'
import { loadRegion } from '@/lib/snapshot/load-italia'
import { loadMapRegion, loadReferenceRegion, regionChoices } from '@/lib/snapshot/load-reference'

/**
 * Dal 25/09/2026 la Toscana può avere un file completo (sette zone di taratura + comuni boscati
 * con le stazioni, `scripts/build-snapshot-toscana.ts`). Finché la prima corsa non l'ha scritto,
 * il file toscano è quello vecchio del catalogo: i test valgono in entrambi gli stati, e dicono
 * quale regola si applica in ciascuno.
 */
async function tuscanyIsComplete(): Promise<boolean> {
  const file = await loadRegion('toscana')
  const codes = new Set(ZONES.map((z) => z.code))
  return file !== null && file.zones.some((z) => codes.has(z.code))
}

/**
 * Legge i file veri in `public/data`: è l'unico modo di verificare la regola che conta davvero,
 * cioè che la Toscana delle sette zone di taratura e i ventiquattro comuni toscani del catalogo
 * restino due cose distinte. Con dei dati finti il test passerebbe anche se la distinzione
 * sparisse.
 */
describe('regione di riferimento', () => {
  it('senza preferenza apre la Toscana, sempre con le sette zone di taratura dentro', async () => {
    const region = await loadReferenceRegion(undefined)
    expect(region.slug).toBe('toscana')
    expect(region.snapshot.zones.map((z) => z.code)).toContain('garfagnana')
    if (await tuscanyIsComplete()) {
      // Il file completo: anche i comuni, calcolati con le stazioni.
      expect(region.isTuscanyCalibration).toBe(false)
      expect(region.snapshot.zones.some((z) => z.code.startsWith('it-'))).toBe(true)
    } else {
      expect(region.isTuscanyCalibration).toBe(true)
    }
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

  it('in Toscana: col file completo un elenco solo, col vecchio due elenchi distinti', async () => {
    const comuni = await loadMapRegion('toscana', undefined)
    const casa = await loadMapRegion(undefined, 'toscana')
    expect(comuni.isTuscanyCalibration).toBe(false)
    expect(casa.snapshot.zones.map((z) => z.code)).toContain('casentino')
    if (await tuscanyIsComplete()) {
      // Home e catalogo mostrano lo stesso file: sette aree storiche e comuni insieme.
      expect(casa.snapshot.zones.map((z) => z.code)).toEqual(comuni.snapshot.zones.map((z) => z.code))
      expect(comuni.snapshot.zones.map((z) => z.code)).toContain('casentino')
    } else {
      // Dal catalogo (Italia → Toscana) i comuni; dalla home, le zone di taratura.
      expect(casa.isTuscanyCalibration).toBe(true)
      expect(comuni.snapshot.zones.every((z) => z.code.startsWith('it-'))).toBe(true)
    }
  })

  it('senza parametro e senza cookie apre la Toscana', async () => {
    const region = await loadMapRegion(undefined, undefined)
    expect(region.slug).toBe('toscana')
    expect(region.isTuscanyCalibration).toBe(!(await tuscanyIsComplete()))
  })

  it('un `regione` inventato non fa sparire la mappa', async () => {
    const region = await loadMapRegion('non-esiste', 'piemonte')
    expect(region.slug).toBe('piemonte')
    expect(region.snapshot.zones.length).toBeGreaterThan(0)
  })
})
