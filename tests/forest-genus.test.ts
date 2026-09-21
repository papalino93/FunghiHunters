import { describe, expect, it } from 'vitest'

import { composeForest, FOREST_CLASSES, MIN_SHARE } from '@/lib/sources/forest-genus'

/** Comodo per scrivere gli istogrammi come li produce il campionamento del raster. */
function hist(entries: Record<number, number>): Map<number, number> {
  return new Map(Object.entries(entries).map(([k, v]) => [Number(k), v]))
}

describe('composeForest', () => {
  it('nomina i tipi dominanti e li ordina dal piu\' esteso', () => {
    // 600 faggio, 300 querce, 100 non bosco.
    const out = composeForest(hist({ 3: 600, 4: 300, 7: 100 }))
    expect(out?.forest).toEqual(['faggeta', 'querceto'])
    expect(out?.forestFraction).toBeCloseTo(0.9, 3)
    expect(out?.shares.faggeta).toBeCloseTo(0.667, 2)
  })

  it('calcola le quote sul bosco, non sull\'area totale', () => {
    // Meta' dell'area non e' bosco: il faggio resta il 100% del bosco, non il 50% dell'area.
    const out = composeForest(hist({ 3: 500, 7: 500 }))
    expect(out?.shares.faggeta).toBe(1)
    expect(out?.forestFraction).toBeCloseTo(0.5, 3)
  })

  it('non nomina una frangia sotto la soglia', () => {
    // Il 10% di querce sta sotto il 15%: il filtro "cercami i querceti" non deve portare qui.
    const out = composeForest(hist({ 3: 900, 4: 100 }))
    expect(out?.forest).toEqual(['faggeta'])
    expect(MIN_SHARE).toBe(0.15)
    // La quota resta comunque registrata: e' nascosta al filtro, non persa.
    expect(out?.shares.querceto).toBeCloseTo(0.1, 3)
  })

  it('si ferma a tre nomi anche quando i tipi sono di piu\'', () => {
    const out = composeForest(hist({ 0: 200, 1: 200, 2: 200, 3: 200, 4: 200 }))
    expect(out?.forest).toHaveLength(3)
  })

  it('distingue "qui non c\'e\' bosco" da "qui non si sa"', () => {
    const senzaBosco = composeForest(hist({ 7: 1000 }))
    expect(senzaBosco).not.toBeNull()
    expect(senzaBosco?.forestFraction).toBe(0)
    expect(senzaBosco?.forest).toEqual([])

    // Solo valori fuori legenda: la zona sta fuori dalla copertura della mappa.
    expect(composeForest(hist({ 255: 1000 }))).toBeNull()
    expect(composeForest(hist({}))).toBeNull()
  })

  it('ignora i valori fuori legenda invece di contarli come non bosco', () => {
    // 255 e' il "senza dato" del raster: se finisse fra i classificati, la quota di bosco
    // risulterebbe dimezzata e una faggeta piena sembrerebbe mezza brulla.
    const out = composeForest(hist({ 3: 500, 255: 500 }))
    expect(out?.forestFraction).toBe(1)
    expect(out?.sampledPixels).toBe(500)
  })

  it('tiene i codici incollati alla legenda pubblicata dalla fonte', () => {
    // Un riordino silenzioso di questa tabella non romperebbe niente: assegnerebbe a ogni zona
    // d'Italia il bosco sbagliato, in silenzio. La legenda e' quella stampata dal record Zenodo.
    expect(FOREST_CLASSES.map((c) => `${c.code}:${c.slug ?? 'non bosco'}`)).toEqual([
      '0:lariceto',
      '1:pecceta',
      '2:pineta',
      '3:faggeta',
      '4:querceto',
      '5:altre conifere',
      '6:altre latifoglie',
      '7:non bosco',
    ])
  })
})
