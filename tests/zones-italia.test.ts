import { describe, expect, it } from 'vitest'

import { regionSlug } from '@/../scripts/build-snapshot-italia'
import { capByRegion, type ItalianZone } from '@/../scripts/ingest-zones-italia'
import { parseComuniCsv, referencePoint } from '@/lib/sources/istat-national'

/**
 * Righe vere, ritagliate dal CSV scaricato davvero il 21 settembre 2026 — non inventate.
 * Includono apposta la Valle d'Aosta, il cui nome contiene un apostrofo e una barra, e due comuni
 * toscani gia' noti al progetto.
 */
const CSV_SAMPLE = [
  'comune,pro_com_t,den_prov,sigla,den_reg,cod_reg',
  "Aosta,007003,Valle d'Aosta/Vallée d'Aoste,AO,Valle d'Aosta/Vallée d'Aoste,2",
  'Bolzano,021008,Bolzano/Bozen,BZ,Trentino-Alto Adige/Südtirol,4',
  'Abbadia San Salvatore,052001,Siena,SI,Toscana,9',
  'Montieri,053017,Grosseto,GR,Toscana,9',
].join('\n')

describe('parseComuniCsv', () => {
  it('indicizza per codice ISTAT del comune', () => {
    const map = parseComuniCsv(CSV_SAMPLE)
    expect(map.size).toBe(4)
    expect(map.get('052001')).toEqual({
      region: 'Toscana',
      province: 'Siena',
      provinceAcronym: 'SI',
    })
  })

  it('conserva i nomi bilingui senza spezzarli', () => {
    const map = parseComuniCsv(CSV_SAMPLE)
    expect(map.get('021008')?.region).toBe('Trentino-Alto Adige/Südtirol')
    expect(map.get('007003')?.region).toBe("Valle d'Aosta/Vallée d'Aoste")
  })

  it('si ferma invece di indovinare se l intestazione cambia', () => {
    expect(() => parseComuniCsv('comune,codice,regione\nAosta,007003,VDA')).toThrow(
      /Intestazione CSV inattesa/,
    )
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
