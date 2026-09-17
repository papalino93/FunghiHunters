/**
 * Le sette zone di taratura della v1.
 *
 * Non sono "le zone da funghi della Toscana": sono i punti su cui calibriamo il modello prima di
 * estendere alla griglia regionale. Sono scelte perche' coprono i tipi forestali che contano per
 * il porcino e perche' hanno copertura di stazioni sufficiente (verificato: pioggia e temperatura
 * entro 4 km e 180 m di dislivello quasi ovunque).
 *
 * La vegetazione indicata qui e' descrittiva, serve a orientare la lettura. La copertura reale
 * della cella viene dall'UCS 10k 2019, non da questa tabella.
 */

export interface Zone {
  readonly code: string
  readonly name: string
  /** Localita' di riferimento, quella da cui vengono le coordinate. */
  readonly reference: string
  readonly province: string
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number
  readonly forest: readonly string[]
  /** Note sulla copertura di stazioni SIR, misurate il 2026-09-17. */
  readonly stationNotes: string
}

export const ZONES: readonly Zone[] = [
  {
    code: 'amiata',
    name: 'Monte Amiata',
    reference: 'Abbadia San Salvatore',
    province: 'SI',
    latitude: 42.8831,
    longitude: 11.6616,
    elevationM: 910,
    forest: ['castagneto', 'faggeta'],
    stationNotes: `Copertura ideale: TOS11000114 "Laghetto Verde" è alla stessa quota e misura
      pioggia, temperature, umidità e vento. È il banco di prova dell'ingestione. Attenzione: sta
      in una conca e la sua minima è circa 3 gradi sotto il modello.`,
  },
  {
    code: 'casentino',
    name: 'Casentino',
    reference: 'Badia Prataglia',
    province: 'AR',
    latitude: 43.7883,
    longitude: 11.8583,
    elevationM: 840,
    forest: ['abetina', 'faggeta'],
    stationNotes: `La zona peggio servita delle sette: pioggia da Badia Prataglia a 1.6 km, ma le
      temperature vengono da Camaldoli, 271 m più in alto, e l'umidità dallo Zoo di Poppi, 423 m
      più in basso.`,
  },
  {
    code: 'pratomagno',
    name: 'Pratomagno',
    reference: 'Loro Ciuffenna',
    province: 'AR',
    latitude: 43.65,
    longitude: 11.63,
    elevationM: 1050,
    forest: ['castagneto', 'faggeta'],
    stationNotes: `Trappola a 3.9 km e 181 m di dislivello porta pioggia, temperature e umidità.
      Il vento è da stimare: la stazione più vicina è 850 m più in basso.`,
  },
  {
    code: 'garfagnana',
    name: 'Garfagnana',
    reference: 'Orecchiella, Corfino',
    province: 'LU',
    latitude: 44.1833,
    longitude: 10.3833,
    elevationM: 1000,
    forest: ['faggeta', 'abetina'],
    stationNotes: `Il caso che dimostra perché la stazione più vicina non basta: Villacollemandina
      è a 2.6 km ma 502 m più in basso, Orecchiella a 2.7 km e soli 169 m di dislivello. Un
      nearest-neighbour ingenuo sceglierebbe la prima.`,
  },
  {
    code: 'pistoiese',
    name: 'Appennino pistoiese',
    reference: 'Cutigliano',
    province: 'PT',
    latitude: 44.1,
    longitude: 10.75,
    elevationM: 1000,
    forest: ['faggeta', 'castagneto'],
    stationNotes: `Stesso schema della Garfagnana: Casotti di Cutigliano è a 200 m ma 407 m più in
      basso, mentre Melo è a 3.7 km e alla stessa quota esatta.`,
  },
  {
    code: 'mugello',
    name: 'Mugello',
    reference: 'Passo della Futa',
    province: 'FI',
    latitude: 44.0833,
    longitude: 11.3167,
    elevationM: 900,
    forest: ['faggeta', 'cerreta'],
    stationNotes: `Monte di Fò a 2.9 km e 80 m di dislivello copre pioggia, temperature e umidità.
      È anche la stazione il cui nome arriva con la codifica rotta dall'anagrafica.`,
  },
  {
    code: 'metallifere',
    name: 'Colline Metallifere',
    reference: 'Chiusdino e Montieri',
    province: 'SI',
    latitude: 43.14,
    longitude: 11.05,
    elevationM: 600,
    forest: ['cerreta', 'leccio'],
    stationNotes: `Campiano a 4.3 km e 100 m di dislivello copre tutto tranne il vento. È la zona
      più bassa e più calda: è qui che il regime estivo conta più di quello autunnale.`,
  },
]

export function zoneByCode(code: string): Zone | undefined {
  return ZONES.find((z) => z.code === code)
}

/** Le stazioni SIR di riferimento per ciascuna zona, per le verifiche rapide di ingestione. */
export const ZONE_REFERENCE_STATIONS: Readonly<Record<string, string>> = {
  amiata: 'TOS11000114',
  casentino: 'TOS01000621',
  pratomagno: 'TOS03000855',
  garfagnana: 'TOS11000097',
  pistoiese: 'TOS02000359',
  mugello: 'TOS01000916',
  metallifere: 'TOS01002779',
}
