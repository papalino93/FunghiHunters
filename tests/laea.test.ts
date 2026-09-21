import { describe, expect, it } from 'vitest'

import { fromLaea, toLaea } from '@/lib/geo/laea'

/**
 * Una conversione sbagliata non fallisce: restituisce il bosco di un altro posto. Questi controlli
 * servono a far fallire il test invece del dato.
 */
describe('toLaea', () => {
  it('mette la falsa origine esattamente dove la definisce EPSG:3035', () => {
    // 52 N, 10 E e' il centro di proiezione: per definizione deve cadere su (4321000, 3210000).
    const p = toLaea(10, 52)
    expect(p.x).toBeCloseTo(4_321_000, 3)
    expect(p.y).toBeCloseTo(3_210_000, 3)
  })

  it('e\' simmetrica rispetto al meridiano centrale', () => {
    const est = toLaea(15, 45)
    const ovest = toLaea(5, 45)
    expect(est.x - 4_321_000).toBeCloseTo(-(ovest.x - 4_321_000), 3)
    expect(est.y).toBeCloseTo(ovest.y, 3)
  })

  it('cresce verso nord e verso est', () => {
    expect(toLaea(11, 44).y).toBeLessThan(toLaea(11, 45).y)
    expect(toLaea(11, 44).x).toBeLessThan(toLaea(12, 44).x)
  })

  it('ha la scala giusta: un grado di longitudine al centro vale circa 68,7 km', () => {
    // Vicino al centro di proiezione la deformazione e' sotto il per mille, quindi la distanza
    // proiettata deve coincidere con quella vera del parallelo. E' il controllo che verifica i
    // fattori di scala (raggio autalico e coefficiente D), che la falsa origine da sola non tocca.
    const a = toLaea(10, 52)
    const b = toLaea(11, 52)
    const metri = Math.hypot(b.x - a.x, b.y - a.y)
    expect(metri).toBeGreaterThan(68_400)
    expect(metri).toBeLessThan(68_900)
  })

  it('colloca l\'Italia dove sta, e ne conserva le distanze', () => {
    const bormio = toLaea(10.37, 46.47)
    const etna = toLaea(14.99, 37.75)

    expect(bormio.x).toBeGreaterThan(4_200_000)
    expect(bormio.x).toBeLessThan(4_400_000)
    expect(bormio.y).toBeGreaterThan(2_500_000)
    expect(bormio.y).toBeLessThan(2_700_000)
    // L'Etna e' a sud-est di Bormio: se la proiezione fosse capovolta o specchiata si vedrebbe qui.
    expect(etna.x).toBeGreaterThan(bormio.x)
    expect(etna.y).toBeLessThan(bormio.y)

    // Controllo indipendente sulla scala lungo tutta la penisola: la distanza vera Bormio-Etna e'
    // 1.041 km, e una proiezione equivalente su questa estensione la deforma di meno dell'1%.
    const km = Math.hypot(etna.x - bormio.x, etna.y - bormio.y) / 1000
    expect(km).toBeGreaterThan(1_030)
    expect(km).toBeLessThan(1_052)
  })

  it('torna indietro sul punto di partenza, entro il centimetro', () => {
    // Serve a spostare il punto di una zona dentro il bosco: se andata e ritorno non
    // coincidessero, il punto finirebbe spostato di suo, e nessuno se ne accorgerebbe.
    for (const [lon, lat] of [
      [10, 52],
      [11.7, 43.75],
      [10.37, 46.47],
      [14.99, 37.75],
      [9.13, 40.02],
    ] as const) {
      const p = toLaea(lon, lat)
      const back = fromLaea(p.x, p.y)
      const q = toLaea(back.lon, back.lat)
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThan(0.01)
      // Un centomilionesimo di grado e' circa un millimetro: e' il residuo della serie.
      expect(back.lon).toBeCloseTo(lon, 7)
      expect(back.lat).toBeCloseTo(lat, 7)
    }
  })
})
