import { describe, expect, it } from 'vitest'

import { boundsOfZones, tuscanyBounds } from '@/lib/ui/bounds'

describe('boundsOfZones', () => {
  it('contiene tutte le zone, con un margine', () => {
    const bounds = boundsOfZones([
      { latitude: 46.47, longitude: 10.37 }, // Bormio
      { latitude: 45.87, longitude: 9.39 }, // una zona lariana
    ])
    expect(bounds[0][0]).toBeCloseTo(9.14, 6)
    expect(bounds[0][1]).toBeCloseTo(45.62, 6)
    expect(bounds[1][0]).toBeCloseTo(10.62, 6)
    expect(bounds[1][1]).toBeCloseTo(46.72, 6)
  })

  it('dà un riquadro vero anche con una zona sola', () => {
    // Due angoli coincidenti manderebbero `fitBounds` allo zoom massimo, cioè al dettaglio
    // stradale da cui non si capisce più dove si è.
    const [sw, ne] = boundsOfZones([{ latitude: 43.0, longitude: 11.0 }])
    expect(ne[0] - sw[0]).toBeGreaterThan(0.4)
    expect(ne[1] - sw[1]).toBeGreaterThan(0.4)
  })

  it('ricade sulla Toscana quando non c’è niente da inquadrare', () => {
    expect(boundsOfZones([])).toEqual(tuscanyBounds())
  })

  it('salta le coordinate non finite invece di propagarle', () => {
    // Un NaN in un angolo renderebbe il riquadro inservibile e la mappa resterebbe grigia.
    const bounds = boundsOfZones([
      { latitude: Number.NaN, longitude: 11.0 },
      { latitude: 43.0, longitude: 11.0 },
    ])
    expect(bounds.flat().every((n) => Number.isFinite(n))).toBe(true)
  })

  it('ricade sulla Toscana se nessuna coordinata è utilizzabile', () => {
    expect(boundsOfZones([{ latitude: Number.NaN, longitude: Number.NaN }])).toEqual(tuscanyBounds())
  })
})
