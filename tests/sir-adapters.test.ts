/**
 * Test degli adapter SIR su payload reali, catturati il 2026-09-17 e ridotti.
 *
 * I fixture non sono inventati: sono ritagli delle risposte vere degli endpoint, scelti perche'
 * contengono i casi scomodi (stazione dismessa, nome con codifica rotta, valori nulli, e
 * l'evento di pioggia che cade in due giorni diversi a seconda della serie).
 */

import { describe, expect, it } from 'vitest'

import stationsFixture from './fixtures/sir-stations.sample.json'
import series024Fixture from './fixtures/sir-series-pluvio0_24.sample.json'
import series99Fixture from './fixtures/sir-series-pluvio9_9.sample.json'
import seriesTmaxFixture from './fixtures/sir-series-termo_max.sample.json'
import dailyPluvioFixture from './fixtures/sir-daily-pluvio.sample.json'
import dailyPluvio9Fixture from './fixtures/sir-daily-pluvio9.sample.json'
import dailyTermoFixture from './fixtures/sir-daily-termo.sample.json'

import {
  isStationActive,
  parseSeries,
  parseStations,
  seriesUrl,
  stationsUrl,
} from '@/lib/sources/sir-archive'
import {
  SIR_DAILY_LAYERS,
  featureUrl,
  inferLayerDate,
  parseDailyLayer,
} from '@/lib/sources/sir-geoserver'
import { measureByIdst } from '@/lib/sources/sir-measures'

const AMIATA = 'TOS11000114'

function layerSpec(layer: string) {
  const spec = SIR_DAILY_LAYERS.find((l) => l.layer === layer)
  if (spec === undefined) throw new Error(`Layer non configurato: ${layer}`)
  return spec
}

describe('anagrafica SIR', () => {
  const stations = parseStations(stationsFixture)

  it('estrae le stazioni con coordinate e quota', () => {
    const amiata = stations.find((s) => s.code === AMIATA)
    expect(amiata).toBeDefined()
    expect(amiata?.elevationM).toBeCloseTo(910, 0)
    expect(amiata?.latitude).toBeCloseTo(42.883, 2)
    expect(amiata?.longitude).toBeCloseTo(11.662, 2)
    expect(amiata?.province).toBe('SI')
  })

  it('ripara la codifica del nome conservando l originale', () => {
    const mugello = stations.find((s) => s.code === 'TOS01000916')
    expect(mugello?.name).toBe('Monte di Fò')
    expect(mugello?.nameRaw).toBe('Monte di FÃ²')
  })

  it('riconosce che la pioggia esiste in due finestre distinte', () => {
    const amiata = stations.find((s) => s.code === AMIATA)
    const rainWindows = amiata?.measures
      .filter((m) => m.variable === 'precipitation')
      .map((m) => m.window)
      .sort()
    expect(rainWindows).toEqual(['0_24', '9_9'])
  })

  it('distingue una stazione viva da una dismessa', () => {
    const amiata = stations.find((s) => s.code === AMIATA)
    const montepulciano = stations.find((s) => s.code === 'TOS10000710')
    expect(amiata).toBeDefined()
    expect(montepulciano).toBeDefined()
    if (amiata === undefined || montepulciano === undefined) return

    // L Amiata misura pioggia fino al 2026.
    expect(isStationActive(amiata, 'precipitation', 2026)).toBe(true)
    // "Abbadia di Montepulciano" ha una serie lunghissima dal 1961 ma finita nel 2001:
    // sembra ricchissima ed e' inutile per l operativo.
    expect(isStationActive(montepulciano, 'precipitation', 1961)).toBe(true)
    expect(isStationActive(montepulciano, 'precipitation', 2026)).toBe(false)
  })

  it('le grandezze sono sparse su stazioni diverse', () => {
    // Le due stazioni di Abbadia San Salvatore sono l esempio del perche' serve
    // un accoppiamento per grandezza e non per zona.
    //
    // Nota: la specifica di progetto dava TOS07000001 come stazione che porta la minima
    // termometrica ma "non la pioggia". Verificato il 2026-09-17: non e' (piu') cosi', misura
    // pioggia in entrambe le finestre fino al 2026. La sparsita' vera sta altrove: il paese non
    // ha ne' anemometria ne' igrometria, che il Laghetto Verde ha.
    const laghetto = stations.find((s) => s.code === AMIATA)
    const paese = stations.find((s) => s.code === 'TOS07000001')
    expect(laghetto).toBeDefined()
    expect(paese).toBeDefined()
    if (laghetto === undefined || paese === undefined) return

    expect(isStationActive(laghetto, 'precipitation', 2026)).toBe(true)
    expect(isStationActive(paese, 'precipitation', 2026)).toBe(true)

    expect(isStationActive(laghetto, 'wind_speed_mean', 2026)).toBe(true)
    expect(isStationActive(paese, 'wind_speed_mean', 2026)).toBe(false)
    expect(isStationActive(laghetto, 'relative_humidity_mean', 2026)).toBe(true)
    expect(isStationActive(paese, 'relative_humidity_mean', 2026)).toBe(false)
  })

  it('ignora le grandezze fuori dominio invece di fallire', () => {
    // Idrometria e freatimetria compaiono nell anagrafica e non ci servono.
    for (const station of stations) {
      for (const measure of station.measures) {
        expect(measure.variable).not.toBe('river_level')
      }
    }
  })
})

describe('serie storiche: lo sfasamento fra 0-24 e 9-9', () => {
  const s024 = parseSeries(series024Fixture, AMIATA, 'pluvio0_24')
  const s99 = parseSeries(series99Fixture, AMIATA, 'pluvio')

  const on = (obs: typeof s024, date: string): number | null =>
    obs.find((o) => o.date === date)?.value ?? null

  it('etichetta ogni serie con la propria finestra', () => {
    expect(new Set(s024.map((o) => o.window))).toEqual(new Set(['0_24']))
    expect(new Set(s99.map((o) => o.window))).toEqual(new Set(['9_9']))
  })

  it('lo stesso evento cade in due giorni diversi nelle due serie', () => {
    // E' il caso reale che giustifica tutta la disciplina sulla finestra di aggregazione:
    // 6.1 mm il 12 agosto nella serie 0-24, gli stessi 6.1 mm il 13 agosto nella 9-9.
    expect(on(s024, '2026-08-12')).toBe(6.1)
    expect(on(s024, '2026-08-13')).toBe(0)
    expect(on(s99, '2026-08-12')).toBe(0)
    expect(on(s99, '2026-08-13')).toBe(6.1)
  })

  it('le due serie sono la stessa pioggia ri-affettata, non due misure diverse', () => {
    // Su una finestra breve i totali non coincidono: qui 62.8 mm contro 67.3 su 43 giorni, il
    // 7 % di scarto, perche' la ri-affettatura ridistribuisce i singoli eventi.
    // Sull'anno invece coincidono, verificato sulla serie completa della stessa stazione:
    //   2018 1936.4 / 1936.4 | 2021 1334.2 / 1334.4 | 2024 1561.8 / 1563.4 | 2025 1371.4 / 1371.4
    // ossia scarti sempre entro lo 0.1 %.
    //
    // La lezione pratica e' che le due serie non sono interscambiabili giorno per giorno,
    // ed e' esattamente il giorno per giorno che alimenta il modello.
    const sum = (obs: typeof s024): number => obs.reduce((acc, o) => acc + (o.value ?? 0), 0)
    const a = sum(s024)
    const b = sum(s99)
    expect(a).toBeGreaterThan(50)
    expect(Math.abs(a - b) / b).toBeLessThan(0.1)
    expect(a).not.toBe(b)
  })

  it('non applica alcuno sfasamento: la fonte attribuisce gia il giorno giusto', () => {
    // Verificato contro Open-Meteo su 70 giorni: shift 0 minimizza l errore per tutte le serie.
    const raw = series024Fixture.features[0]?.properties.SerieDati ?? []
    const firstRaw = raw[0]
    expect(firstRaw).toBeDefined()
    expect(s024[0]?.date).toBe(firstRaw?.Data.slice(0, 10))
  })
})

describe('serie storiche: temperatura', () => {
  it('la temperatura SIR esiste solo nella finestra 9-9', () => {
    const tmax = parseSeries(seriesTmaxFixture, AMIATA, 'termo_max')
    expect(new Set(tmax.map((o) => o.window))).toEqual(new Set(['9_9']))
    // Non esiste un IDST di temperatura aggregata 0-24: se un giorno comparisse,
    // questo test fallisce e ci obbliga a rivedere l allineamento.
    expect(measureByIdst('termo_max0_24')).toBeUndefined()
    expect(measureByIdst('termo_max')?.window).toBe('9_9')
  })

  it('conserva il flag di qualita dichiarato dalla fonte', () => {
    const tmax = parseSeries(seriesTmaxFixture, AMIATA, 'termo_max')
    expect(tmax.every((o) => o.sourceQualityFlag === 'P')).toBe(true)
    expect(tmax.every((o) => o.provenance === 'OBSERVED')).toBe(true)
  })
})

describe('layer giornalieri del GeoServer', () => {
  it('attribuisce la mezzanotte UTC al giorno locale corretto', () => {
    const obs = parseDailyLayer(dailyPluvioFixture, layerSpec('sir_pluviometri_valori_ieri_pubblico'))
    // dataora 2026-09-15T22:00:00Z -> 2026-09-16 in ora legale italiana.
    expect(obs.every((o) => o.date === '2026-09-16')).toBe(true)
    expect(obs.every((o) => o.window === '0_24')).toBe(true)
  })

  it('attribuisce le 9:00 locali al giorno corretto', () => {
    const obs = parseDailyLayer(
      dailyPluvio9Fixture,
      layerSpec('sir_pluviometri_valori_ieri9_pubblico'),
    )
    // dataora 2026-09-16T07:00:00Z -> le 9:00 del 16, stesso giorno.
    expect(obs.every((o) => o.date === '2026-09-16')).toBe(true)
    expect(obs.every((o) => o.window === '9_9')).toBe(true)
  })

  it('il valore coincide con quello dell archivio per la stessa stazione e giorno', () => {
    // Validazione incrociata fra le due strade di ingestione: se divergono, una delle due
    // sta sbagliando finestra o fuso.
    const fromLayer = parseDailyLayer(
      dailyPluvio9Fixture,
      layerSpec('sir_pluviometri_valori_ieri9_pubblico'),
    ).find((o) => o.stationCode === AMIATA && o.date === '2026-09-16')
    const fromArchive = parseSeries(series99Fixture, AMIATA, 'pluvio').find(
      (o) => o.date === '2026-09-16',
    )
    expect(fromLayer?.value).toBe(fromArchive?.value)
  })

  it('estrae tre grandezze dal layer termometrico', () => {
    const obs = parseDailyLayer(dailyTermoFixture, layerSpec('sir_termometri_valori_ieri_pubblico'))
    const variables = new Set(obs.map((o) => o.variable))
    expect(variables).toEqual(new Set(['temperature_max', 'temperature_min', 'temperature_mean']))
  })

  it('gestisce le stazioni mute, che hanno anche dataora nulla', () => {
    // Due stazioni su 263 nel layer termometrico del 2026-09-17 non hanno trasmesso: per loro
    // e' nullo anche il timestamp. Le teniamo, datate al giorno del layer, perche' "stazione
    // muta oggi" e' un'informazione che serve al controllo qualita'.
    const spec = layerSpec('sir_termometri_valori_ieri_pubblico')
    expect(inferLayerDate(dailyTermoFixture)).toBe('2026-09-16')

    const obs = parseDailyLayer(dailyTermoFixture, spec)
    const silent = obs.filter((o) => o.value === null)
    expect(silent.length).toBeGreaterThan(0)
    expect(silent.every((o) => o.date === '2026-09-16')).toBe(true)
    expect(silent.every((o) => o.qualityFlag === 'missing')).toBe(true)

    // Nessuna stazione viene persa: ogni feature produce una riga per grandezza.
    const stationCount = new Set(obs.map((o) => o.stationCode)).size
    expect(obs).toHaveLength(stationCount * spec.fields.length)
  })

  it('conserva i valori nulli come null e li marca, senza inventare zeri', () => {
    const obs = parseDailyLayer(dailyPluvioFixture, layerSpec('sir_pluviometri_valori_ieri_pubblico'))
    const missing = obs.filter((o) => o.value === null)
    expect(missing.length).toBeGreaterThan(0)
    expect(missing.every((o) => o.qualityFlag === 'missing')).toBe(true)
    // E lo zero vero resta zero, distinguibile dal buco.
    const zero = obs.find((o) => o.value === 0)
    expect(zero?.qualityFlag).toBe('ok')
  })

  it('riporta l istante di aggiornamento dichiarato dalla fonte', () => {
    const obs = parseDailyLayer(dailyPluvioFixture, layerSpec('sir_pluviometri_valori_ieri_pubblico'))
    expect(obs[0]?.sourceUpdatedAt).toMatch(/^2026-09-17T/)
  })
})

describe('costruzione degli URL', () => {
  it('costruisce l URL dell anagrafica', () => {
    expect(stationsUrl()).toBe('https://www.sir.toscana.it/archivio/dati.php?D=json_stations')
  })

  it('costruisce l URL della serie con IDST e codice stazione', () => {
    expect(seriesUrl(AMIATA, 'pluvio0_24')).toBe(
      'https://www.sir.toscana.it/archivio/dati.php?IDST=pluvio0_24&D=json&IDS=TOS11000114',
    )
  })

  it('costruisce l URL WFS in GeoJSON', () => {
    const url = featureUrl('sir_pluviometri_valori_ieri_pubblico')
    expect(url).toContain('https://geo.sir.toscana.it/geoserver/geo/ows?')
    expect(url).toContain('typeName=geo%3Asir_pluviometri_valori_ieri_pubblico')
    expect(url).toContain('outputFormat=application%2Fjson')
  })
})
