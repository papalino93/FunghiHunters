import { describe, expect, it } from 'vitest'

import { findMismatched, regionSlug } from '@/../scripts/build-snapshot-italia'
import { capByRegion, type ItalianZone } from '@/../scripts/ingest-zones-italia'
import { buildCandidates, referencePoint } from '@/lib/sources/istat-national'
import type { MunicipalityCollection } from '@/lib/sources/istat-boundaries'

/**
 * Proprieta' vere, copiate dal GeoJSON nazionale scaricato davvero il 21 settembre 2026.
 * Fonni non e' un esempio a caso: e' il comune che ha rivelato il bug. Il suo codice nel GeoJSON
 * e' `114013`, con il codice provinciale nuovo, mentre il CSV che si usava prima lo chiama
 * `091013`: l'unione falliva e la Sardegna intera spariva dal catalogo senza un errore.
 */
const QUADRATO: ReadonlyArray<readonly [number, number]> = [
  [10, 44],
  [12, 44],
  [12, 46],
  [10, 46],
]

const COLLECTION: MunicipalityCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        name: 'Fonni',
        prov_name: 'Nuoro',
        prov_acr: 'NU',
        reg_name: 'Sardegna',
        com_istat_code: '114013',
      },
      geometry: { type: 'Polygon', coordinates: [QUADRATO] },
    },
    {
      type: 'Feature',
      properties: {
        name: 'Abbadia San Salvatore',
        prov_name: 'Siena',
        prov_acr: 'SI',
        reg_name: 'Toscana',
        com_istat_code: '052001',
      },
      geometry: { type: 'Polygon', coordinates: [QUADRATO] },
    },
  ],
}

describe('buildCandidates', () => {
  it('prende regione e provincia dalla stessa feature, senza unire una seconda tabella', () => {
    const candidates = buildCandidates(COLLECTION)
    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toMatchObject({
      istatCode: '114013',
      name: 'Fonni',
      region: 'Sardegna',
      province: 'Nuoro',
      provinceAcronym: 'NU',
    })
  })

  it('non perde nessun comune per strada', () => {
    // Il bug era proprio questo: i comuni senza riga corrispondente sparivano in silenzio.
    expect(buildCandidates(COLLECTION).map((c) => c.name)).toEqual([
      'Fonni',
      'Abbadia San Salvatore',
    ])
  })
})

describe('referencePoint', () => {
  it('usa il centroide dell anello esterno di un Polygon', () => {
    const point = referencePoint({
      type: 'Polygon',
      coordinates: [[[10, 44], [12, 44], [12, 46], [10, 46]]],
    })
    expect(point.lon).toBeCloseTo(11, 6)
    expect(point.lat).toBeCloseTo(45, 6)
  })

  it('sceglie il poligono piu esteso di un MultiPolygon, non il primo', () => {
    // Prima un'isoletta di tre vertici, poi il corpo principale: il risultato deve essere
    // il secondo, altrimenti un comune con isole finirebbe con il riferimento sull'isola.
    const point = referencePoint({
      type: 'MultiPolygon',
      coordinates: [
        [[[8, 40], [8.1, 40], [8, 40.1]]],
        [[[10, 44], [12, 44], [12, 46], [10, 46]]],
      ],
    })
    expect(point.lon).toBeCloseTo(11, 6)
    expect(point.lat).toBeCloseTo(45, 6)
  })
})

function zone(name: string, region: string, elevationM: number): ItalianZone {
  return {
    code: `it-${name}`,
    name,
    region,
    province: region,
    provinceAcronym: 'XX',
    latitude: 43,
    longitude: 11,
    elevationM,
    forest: [],
  }
}

describe('capByRegion', () => {
  const zones = [
    zone('alta-a', 'Piemonte', 1800),
    zone('alta-b', 'Piemonte', 1500),
    zone('alta-c', 'Piemonte', 900),
    zone('sud-a', 'Sicilia', 800),
    zone('sud-b', 'Sicilia', 700),
  ]

  it('non tocca nulla se il catalogo sta sotto il tetto', () => {
    expect(capByRegion(zones, 10)).toHaveLength(5)
  })

  it('non cancella una regione intera quando taglia', () => {
    // Il punto della funzione: un taglio sulla quota assoluta avrebbe eliminato la Sicilia,
    // che e' proprio dove vive il porcino nero di bassa quota.
    const kept = capByRegion(zones, 3)
    const regions = new Set(kept.map((z) => z.region))
    expect(regions.has('Piemonte')).toBe(true)
    expect(regions.has('Sicilia')).toBe(true)
  })

  it('dentro una regione tiene le zone piu alte', () => {
    const kept = capByRegion(zones, 3)
    const piemonte = kept.filter((z) => z.region === 'Piemonte').map((z) => z.elevationM)
    expect(piemonte).not.toContain(900)
    expect(piemonte).toContain(1800)
  })
})

describe('regionSlug', () => {
  it('regge i nomi bilingui con barre e accenti', () => {
    // Sono i due casi che romperebbero un nome di file: la barra e' un separatore di percorso,
    // le dieresi non sono ASCII.
    expect(regionSlug('Trentino-Alto Adige/Südtirol')).toBe('trentino-alto-adige-sudtirol')
    expect(regionSlug("Valle d'Aosta/Vallée d'Aoste")).toBe('valle-d-aosta-vallee-d-aoste')
  })

  it('produce sempre uno slug sicuro come nome di file', () => {
    for (const region of ['Toscana', 'Emilia-Romagna', 'Friuli-Venezia Giulia', 'Puglia']) {
      expect(regionSlug(region)).toMatch(/^[a-z0-9-]+$/)
    }
  })
})

describe('findMismatched', () => {
  it('nessuna regione in ritardo quando tutte portano il generatedAt della corsa', () => {
    const written = new Map([
      ['piemonte', '2026-09-22T11:40:00.000Z'],
      ['lombardia', '2026-09-22T11:40:00.000Z'],
    ])
    expect(findMismatched('2026-09-22T11:40:00.000Z', written)).toEqual([])
  })

  it('segnala una regione rimasta alla corsa precedente', () => {
    // Il caso reale: la corsa si interrompe dopo aver scritto il Piemonte ma prima della
    // Lombardia, che resta con la data di ieri mentre l'indice porta gia' oggi.
    const written = new Map([
      ['piemonte', '2026-09-22T11:40:00.000Z'],
      ['lombardia', '2026-09-21T11:40:00.000Z'],
    ])
    expect(findMismatched('2026-09-22T11:40:00.000Z', written)).toEqual(['lombardia'])
  })

  it('un file mancante o illeggibile conta come disallineato', () => {
    const written = new Map([['piemonte', undefined]])
    expect(findMismatched('2026-09-22T11:40:00.000Z', written)).toEqual(['piemonte'])
  })
})
