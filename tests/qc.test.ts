/**
 * Test del controllo di qualita'.
 *
 * Le fixture meteorologiche sono costruite a mano perche' devono contenere guasti, e un guasto
 * vero nell'archivio non e' etichettato come tale: non ci sarebbe modo di sapere se il controllo
 * ha ragione. Gli ordini di grandezza sono pero' quelli reali dell'Amiata.
 */

import { describe, expect, it } from 'vitest'

import type { Observation, Station, Variable } from '@/lib/domain/types'
import {
  applyFindings,
  checkFlatZero,
  checkJumps,
  checkRange,
  checkSpatialOutlier,
  checkStaleness,
  checkTemperatureConsistency,
  distanceKm,
  isComparable,
  median,
  medianAbsoluteDeviation,
} from '@/lib/qc/checks'
import { addDays } from '@/lib/domain/time'

function station(code: string, lat: number, lon: number, elevationM: number | null): Station {
  return {
    code,
    name: code,
    nameRaw: code,
    municipality: null,
    province: 'SI',
    elevationM,
    latitude: lat,
    longitude: lon,
    sourceCode: 'sir-toscana',
    measures: [],
  }
}

function obs(
  stationCode: string,
  variable: Variable,
  date: string,
  value: number | null,
  unit = 'mm',
): Observation {
  return {
    stationCode,
    variable,
    window: '0_24',
    date,
    value,
    unit,
    sourceQualityFlag: 'P',
    qualityFlag: value === null ? 'missing' : 'ok',
    provenance: 'OBSERVED',
    sourceCode: 'sir-toscana',
    sourceUpdatedAt: null,
  }
}

const AMIATA = station('TOS11000114', 42.8831, 11.6616, 910)

describe('statistica robusta', () => {
  it('calcola mediana e MAD', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(medianAbsoluteDeviation([10, 10, 10])).toBe(0)
    expect(medianAbsoluteDeviation([1, 2, 3, 4, 5])).toBeCloseTo(1.4826, 3)
  })

  it('un solo valore impazzito non gonfia la dispersione', () => {
    // E' il motivo per cui usiamo il MAD e non la deviazione standard: con quest ultima
    // l outlier alza la soglia fino a nascondersi dentro.
    const sane = [10, 11, 10, 12, 11]
    const withOutlier = [...sane, 900]
    expect(medianAbsoluteDeviation(withOutlier)).toBeLessThan(
      medianAbsoluteDeviation(sane) * 3 + 1,
    )
  })

  it('calcola distanze plausibili', () => {
    // Amiata -> Badia Prataglia, circa 110 km in linea d aria.
    expect(distanceKm(42.8831, 11.6616, 43.7883, 11.8583)).toBeCloseTo(101, -1)
    expect(distanceKm(42.8831, 11.6616, 42.8831, 11.6616)).toBe(0)
  })
})

describe('comparabilita fra stazioni', () => {
  it('scarta le stazioni troppo distanti', () => {
    const lontana = station('X', 44.18, 10.38, 900)
    expect(isComparable(AMIATA, lontana)).toBe(false)
  })

  it('scarta le stazioni vicine ma a quota molto diversa', () => {
    // Il caso Garfagnana: la piu vicina e a 2.6 km ma 502 m piu in basso.
    const fondovalle = station('Y', 42.89, 11.66, 400)
    expect(distanceKm(42.8831, 11.6616, 42.89, 11.66)).toBeLessThan(2)
    expect(isComparable(AMIATA, fondovalle)).toBe(false)
  })

  it('accetta le stazioni vicine e climaticamente simili', () => {
    const simile = station('Z', 42.9, 11.68, 1000)
    expect(isComparable(AMIATA, simile)).toBe(true)
  })

  it('non confronta una stazione con se stessa', () => {
    expect(isComparable(AMIATA, AMIATA)).toBe(false)
  })
})

describe('controllo di intervallo', () => {
  it('accetta un evento estremo ma realistico', () => {
    // In Toscana esistono eventi da oltre 300 mm in 24 ore: scartarli sarebbe il danno peggiore,
    // perche' sono esattamente i giorni che contano per il modello.
    expect(checkRange(obs('S', 'precipitation', '2026-09-16', 312))).toBeNull()
  })

  it('segnala la pioggia negativa', () => {
    const finding = checkRange(obs('S', 'precipitation', '2026-09-16', -3))
    expect(finding?.flag).toBe('out_of_range')
  })

  it('segnala una temperatura impossibile', () => {
    const finding = checkRange(obs('S', 'temperature_max', '2026-09-16', 71, 'degC'))
    expect(finding?.flag).toBe('out_of_range')
    expect(finding?.reason).toContain('fuori')
  })

  it('non si esprime su un valore assente', () => {
    expect(checkRange(obs('S', 'precipitation', '2026-09-16', null))).toBeNull()
  })
})

describe('coerenza interna delle temperature', () => {
  it('segnala una minima maggiore della massima', () => {
    const findings = checkTemperatureConsistency([
      obs('S', 'temperature_max', '2026-09-16', 12, 'degC'),
      obs('S', 'temperature_min', '2026-09-16', 19, 'degC'),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.flag).toBe('inconsistent')
  })

  it('accetta una giornata normale', () => {
    const findings = checkTemperatureConsistency([
      obs('S', 'temperature_max', '2026-09-16', 25.9, 'degC'),
      obs('S', 'temperature_min', '2026-09-16', 12.8, 'degC'),
    ])
    expect(findings).toHaveLength(0)
  })
})

describe('salti fra giorni consecutivi', () => {
  it('segnala un salto termico impossibile', () => {
    const findings = checkJumps([
      obs('S', 'temperature_max', '2026-09-15', 24, 'degC'),
      obs('S', 'temperature_max', '2026-09-16', 48, 'degC'),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.flag).toBe('suspect_jump')
  })

  it('non segnala un calo brusco ma reale', () => {
    // Un fronte che porta 10 gradi in meno e' meteorologia, non un guasto.
    const findings = checkJumps([
      obs('S', 'temperature_max', '2026-09-15', 28, 'degC'),
      obs('S', 'temperature_max', '2026-09-16', 18, 'degC'),
    ])
    expect(findings).toHaveLength(0)
  })

  it('non applica il controllo alla pioggia', () => {
    // Da 0 a 80 mm in un giorno e' un temporale, non un sensore rotto.
    const findings = checkJumps([
      obs('S', 'precipitation', '2026-09-15', 0),
      obs('S', 'precipitation', '2026-09-16', 80),
    ])
    expect(findings).toHaveLength(0)
  })

  it('non confronta giorni non adiacenti', () => {
    const findings = checkJumps([
      obs('S', 'temperature_max', '2026-09-01', 24, 'degC'),
      obs('S', 'temperature_max', '2026-09-16', 48, 'degC'),
    ])
    expect(findings).toHaveLength(0)
  })
})

describe('pluviometro guasto: zero prolungato', () => {
  const dates = Array.from({ length: 14 }, (_, i) => addDays('2026-09-01', i))

  const neighbourWithRain = (code: string, lat: number, lon: number) => ({
    station: station(code, lat, lon, 950),
    observations: dates.map((d, i) => obs(code, 'precipitation', d, i === 5 ? 22 : 0)),
  })

  it('segnala lo zero costante mentre le vicine registrano pioggia', () => {
    const target = {
      station: AMIATA,
      observations: dates.map((d) => obs(AMIATA.code, 'precipitation', d, 0)),
    }
    const findings = checkFlatZero(target, [
      neighbourWithRain('N1', 42.89, 11.67),
      neighbourWithRain('N2', 42.9, 11.68),
      neighbourWithRain('N3', 42.87, 11.65),
    ])
    expect(findings.length).toBe(dates.length)
    expect(findings[0]?.flag).toBe('suspect_flat')
    expect(findings[0]?.reason).toContain('giorni consecutivi a zero')
  })

  it('non segnala nulla se anche le vicine sono a secco', () => {
    // Una siccita vera non e' un guasto, ed e' la distinzione che questo controllo deve fare.
    const dry = (code: string, lat: number, lon: number) => ({
      station: station(code, lat, lon, 950),
      observations: dates.map((d) => obs(code, 'precipitation', d, 0)),
    })
    const target = {
      station: AMIATA,
      observations: dates.map((d) => obs(AMIATA.code, 'precipitation', d, 0)),
    }
    const findings = checkFlatZero(target, [
      dry('N1', 42.89, 11.67),
      dry('N2', 42.9, 11.68),
      dry('N3', 42.87, 11.65),
    ])
    expect(findings).toHaveLength(0)
  })

  it('non si esprime senza abbastanza stazioni comparabili', () => {
    const target = {
      station: AMIATA,
      observations: dates.map((d) => obs(AMIATA.code, 'precipitation', d, 0)),
    }
    const findings = checkFlatZero(target, [neighbourWithRain('N1', 42.89, 11.67)])
    expect(findings).toHaveLength(0)
  })

  it('non segnala una sequenza di zeri piu corta della soglia', () => {
    const short = Array.from({ length: 5 }, (_, i) => addDays('2026-09-01', i))
    const target = {
      station: AMIATA,
      observations: short.map((d) => obs(AMIATA.code, 'precipitation', d, 0)),
    }
    const findings = checkFlatZero(target, [
      neighbourWithRain('N1', 42.89, 11.67),
      neighbourWithRain('N2', 42.9, 11.68),
      neighbourWithRain('N3', 42.87, 11.65),
    ])
    expect(findings).toHaveLength(0)
  })
})

describe('outlier spaziale', () => {
  const neighbours = (values: readonly number[]) =>
    values.map((value, i) => ({
      station: station(`N${i}`, 42.88 + i * 0.01, 11.66, 920),
      value,
    }))

  it('segnala il valore incompatibile con le stazioni vicine', () => {
    const finding = checkSpatialOutlier(
      obs(AMIATA.code, 'precipitation', '2026-09-16', 180),
      AMIATA,
      neighbours([2, 3, 2.5, 3.5, 2]),
    )
    expect(finding?.flag).toBe('spatial_outlier')
  })

  it('accetta un valore semplicemente piu alto della media', () => {
    const finding = checkSpatialOutlier(
      obs(AMIATA.code, 'precipitation', '2026-09-16', 14),
      AMIATA,
      neighbours([8, 11, 9, 12, 10]),
    )
    expect(finding).toBeNull()
  })

  it('non si esprime con poche vicine', () => {
    const finding = checkSpatialOutlier(
      obs(AMIATA.code, 'precipitation', '2026-09-16', 180),
      AMIATA,
      neighbours([2, 3]),
    )
    expect(finding).toBeNull()
  })

  it('non segnala una differenza termica fisicamente normale', () => {
    // Caso reale del 2026-09-16: la prima versione del controllo segnalava Ortignano a 19 gradi
    // contro una mediana locale di 21.4, perche' con stazioni molto concordi il MAD si stringe e
    // 2.4 gradi diventano 10.6 deviazioni robuste. Ma 2.4 gradi fra fondovalle e versante sono
    // meteorologia. Serve che il valore sia anomalo statisticamente E lontano in gradi veri.
    const tight = [21.4, 21.5, 21.3, 21.4, 21.6, 21.2].map((value, i) => ({
      station: station(`N${i}`, 42.88 + i * 0.01, 11.66, 920),
      value,
    }))
    const finding = checkSpatialOutlier(
      obs(AMIATA.code, 'temperature_mean', '2026-09-16', 19, 'degC'),
      AMIATA,
      tight,
    )
    expect(finding).toBeNull()
  })

  it('segnala comunque una temperatura davvero fuori scala', () => {
    const tight = [21.4, 21.5, 21.3, 21.4, 21.6, 21.2].map((value, i) => ({
      station: station(`N${i}`, 42.88 + i * 0.01, 11.66, 920),
      value,
    }))
    const finding = checkSpatialOutlier(
      obs(AMIATA.code, 'temperature_mean', '2026-09-16', 4, 'degC'),
      AMIATA,
      tight,
    )
    expect(finding?.flag).toBe('spatial_outlier')
  })

  it('non si esprime quando le vicine sono tutte identiche', () => {
    // Con MAD zero ogni scarto sarebbe infinito: meglio tacere che gridare.
    const finding = checkSpatialOutlier(
      obs(AMIATA.code, 'precipitation', '2026-09-16', 5),
      AMIATA,
      neighbours([0, 0, 0, 0, 0]),
    )
    expect(finding).toBeNull()
  })
})

describe('stazione offline', () => {
  it('segnala una stazione che non trasmette da giorni', () => {
    const finding = checkStaleness(
      {
        station: AMIATA,
        observations: [obs(AMIATA.code, 'precipitation', '2026-09-10', 3)],
      },
      '2026-09-17',
    )
    expect(finding?.flag).toBe('missing')
    expect(finding?.reason).toContain('offline')
  })

  it('accetta una stazione aggiornata a ieri', () => {
    // Il SIR pubblica il giorno precedente: un ritardo di un giorno e' il funzionamento normale.
    const finding = checkStaleness(
      {
        station: AMIATA,
        observations: [obs(AMIATA.code, 'precipitation', '2026-09-16', 0)],
      },
      '2026-09-17',
    )
    expect(finding).toBeNull()
  })

  it('segnala una stazione che non ha mai trasmesso nel periodo', () => {
    const finding = checkStaleness(
      {
        station: AMIATA,
        observations: [obs(AMIATA.code, 'precipitation', '2026-09-16', null)],
      },
      '2026-09-17',
    )
    expect(finding?.flag).toBe('missing')
  })
})

describe('applicazione degli esiti', () => {
  it('marca le osservazioni senza mai scartarle', () => {
    const observations = [
      obs('S', 'precipitation', '2026-09-15', 3),
      obs('S', 'precipitation', '2026-09-16', -3),
    ]
    const findings = observations.map(checkRange).filter((f) => f !== null)
    const marked = applyFindings(observations, findings)

    // Nessun dato sparisce: il consumatore decide se fidarsi.
    expect(marked).toHaveLength(2)
    expect(marked[0]?.qualityFlag).toBe('ok')
    expect(marked[1]?.qualityFlag).toBe('out_of_range')
    expect(marked[1]?.value).toBe(-3)
  })

  it('lascia intatto l insieme quando non c e nulla da segnalare', () => {
    const observations = [obs('S', 'precipitation', '2026-09-15', 3)]
    expect(applyFindings(observations, [])).toEqual(observations)
  })
})
