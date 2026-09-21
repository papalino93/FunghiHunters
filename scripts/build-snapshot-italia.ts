/**
 * Calcola il punteggio per le zone nazionali, regione per regione.
 *
 *   npx tsx scripts/build-snapshot-italia.ts
 *
 * Presuppone `public/data/zones-italia.json`, prodotto da `scripts/ingest-zones-italia.ts`.
 * Se quel file non c'e', esce senza fare nulla e senza fallire: la Toscana continua a funzionare
 * per conto suo, e il resto d'Italia semplicemente non compare ancora.
 *
 * **Perche' un file separato dallo snapshot toscano.** Non per comodita': le due cose sono
 * davvero diverse. Le sette zone toscane hanno una rete di stazioni al suolo che corregge il
 * modello, un bosco verificato a mano e note sulla copertura scritte guardando le stazioni vere.
 * Le zone nazionali non hanno niente di tutto cio': il punteggio esce dal solo modello meteo. Il
 * calcolo pero' e' lo stesso identico codice (`buildZoneSnapshot`), e la confidence si abbassa da
 * sola dove mancano le osservazioni, senza bisogno di una penalita' scritta a mano.
 *
 * **Perche' un file per regione e non uno solo.** Un unico file con tutte le zone complete
 * arriverebbe a diversi megabyte, scaricati da ogni telefono a ogni visita per mostrarne una.
 * Quindi: un indice leggero per il menu, e il dettaglio di una regione solo quando serve.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { ALGORITHM_V1, uncalibratedParams } from '@/lib/config/algorithm'
import { today } from '@/lib/domain/time'
import type { Station } from '@/lib/domain/types'
import {
  buildForecastUrl,
  chunkPoints,
  forecastWeightPerPoint,
  MAX_POINTS_PER_REQUEST,
  toModelSeries,
  type OpenMeteoResponse,
} from '@/lib/pipeline/open-meteo-series'
import { buildZoneSnapshot } from '@/lib/pipeline/zone-snapshot'
import type { DailySamples } from '@/lib/pipeline/zone-series'
import { LICENSES } from '@/lib/sources/adapter'
import { fetchJson } from '@/lib/sources/http'
import { OPEN_METEO_FREE_LIMITS, RatePacer } from '@/lib/sources/open-meteo-rate'
import type { Snapshot, SnapshotZone } from '@/lib/snapshot/types'
import type { ItalianZone } from '@/../scripts/ingest-zones-italia'

const HISTORY_DAYS = 60
const FORECAST_DAYS = 8
const DISPLAY_PAST_DAYS = 14

/**
 * Quanti punti stanno in una richiesta, e perche' non 300 come in Toscana.
 *
 * Il limite non e' piu' la lunghezza dell'URL ma il costo: con 68 giorni chiesti, una singola
 * localita' pesa quasi 5 chiamate, quindi un lotto da 300 ne peserebbe 1.450 e sfonderebbe da solo
 * il tetto di 600 al minuto del piano gratuito. Il lotto si dimensiona quindi **sul peso**, non su
 * un numero scelto a mano, cosi' resta corretto anche se domani si aggiunge una variabile o si
 * allunga la finestra.
 */
const WEIGHT_PER_POINT = forecastWeightPerPoint(HISTORY_DAYS, FORECAST_DAYS)
const POINTS_PER_REQUEST = Math.min(
  MAX_POINTS_PER_REQUEST,
  Math.max(1, Math.floor(OPEN_METEO_FREE_LIMITS.perMinute / WEIGHT_PER_POINT)),
)

const ZONES_FILE = 'public/data/zones-italia.json'
const INDEX_FILE = 'public/data/italia-index.json'
const REGION_DIR = 'public/data/regioni'

/**
 * La nota che ogni zona nazionale porta con se'.
 *
 * Le sette zone toscane hanno qui la descrizione della loro copertura di stazioni, misurata. Fuori
 * dalla Toscana non c'e' nessuna stazione collegata, e dirlo e' piu' utile che lasciare il campo
 * vuoto: cambia quanto ci si puo' fidare del numero, ed e' il tipo di cosa che l'utente ha il
 * diritto di sapere senza doverla dedurre da un indicatore di affidabilita' piu' basso.
 */
const NATIONAL_STATION_NOTE =
  'Nessuna stazione di misura collegata: il punteggio viene dal solo modello meteo, non da ' +
  'osservazioni al suolo. In Toscana le sette zone storiche sono invece corrette con le stazioni ' +
  'reali della rete regionale.'

/** Nome di regione → nome di file. Deterministico, senza accenti ne' barre. */
export function regionSlug(region: string): string {
  return region
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export interface ItaliaIndexEntry {
  readonly code: string
  readonly name: string
  readonly region: string
  readonly regionSlug: string
  readonly province: string
  readonly provinceAcronym: string
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number
  readonly mpi: number
  /** Punteggio senza il tetto a 100, solo per ordinare i pari merito. */
  readonly mpiRaw: number
  readonly label: string
  readonly confidence: number
  readonly limitingFactor: string | null
  readonly development: number
}

export interface ItaliaIndex {
  readonly generatedAt: string
  readonly algorithmVersion: string
  readonly referenceDate: string
  readonly regions: ReadonlyArray<{
    readonly name: string
    readonly slug: string
    readonly zoneCount: number
  }>
  readonly zones: readonly ItaliaIndexEntry[]
}

interface ZonesFile {
  readonly zones: readonly ItalianZone[]
}

async function loadZones(): Promise<ItalianZone[] | null> {
  try {
    const raw = await readFile(ZONES_FILE, 'utf-8')
    return [...(JSON.parse(raw) as ZonesFile).zones]
  } catch {
    return null
  }
}

/** Le zone nazionali non hanno osservazioni: mappe vuote, condivise, invece di una per zona. */
const NO_OBSERVATIONS: ReadonlyMap<string, DailySamples> = new Map()
const NO_STATIONS: ReadonlyMap<string, Station> = new Map()

async function main(): Promise<void> {
  const zones = await loadZones()
  if (zones === null) {
    console.log(
      `${ZONES_FILE} non trovato: niente da calcolare. ` +
        'Genera prima il catalogo con `npx tsx scripts/ingest-zones-italia.ts`.',
    )
    return
  }

  const todayIso = today()
  const estimatedWeight = zones.length * WEIGHT_PER_POINT
  console.log(`Snapshot Italia ${ALGORITHM_V1.version} - ${todayIso} - ${zones.length} zone`)
  console.log(
    `Costo stimato: ${Math.round(estimatedWeight)} chiamate pesate su ` +
      `${OPEN_METEO_FREE_LIMITS.perDay} al giorno, in lotti da ${POINTS_PER_REQUEST} punti.`,
  )

  const computed: SnapshotZone[] = []
  // Attesa massima per lotto poco oltre l'ora: sopra le ~1.000 zone la corsa deve scavallare la
  // finestra oraria, e dormire e' l'unico modo di restare dentro il piano gratuito.
  const pacer = new RatePacer({ maxWaitMs: 65 * 60_000 })
  const chunks = chunkPoints(zones, POINTS_PER_REQUEST)
  for (const [i, chunk] of chunks.entries()) {
    const waited = await pacer.reserve(chunk.length * WEIGHT_PER_POINT)
    if (waited > 0) {
      console.log(`  pausa di ${Math.round(waited / 1000)} s per restare nei limiti Open-Meteo`)
    }
    const responses = await fetchJson<OpenMeteoResponse[]>(
      buildForecastUrl(chunk, HISTORY_DAYS, FORECAST_DAYS),
      { timeoutMs: 180_000 },
    )
    if (responses.length !== chunk.length) {
      // Un disallineamento assegnerebbe il meteo di un comune a un altro: meglio fermarsi.
      throw new Error(`Open-Meteo: ${responses.length} risposte per ${chunk.length} punti`)
    }

    for (const [j, zone] of chunk.entries()) {
      const response = responses[j]
      if (response === undefined) continue
      const snapshotZone = buildZoneSnapshot({
        zone: {
          code: zone.code,
          name: zone.name,
          reference: zone.name,
          province: zone.provinceAcronym,
          latitude: zone.latitude,
          longitude: zone.longitude,
          elevationM: zone.elevationM,
          forest: zone.forest,
          stationNotes: NATIONAL_STATION_NOTE,
        },
        modelSeries: toModelSeries(response, todayIso),
        observationsByDate: NO_OBSERVATIONS,
        todayIso,
        displayPastDays: DISPLAY_PAST_DAYS,
        forecastDays: FORECAST_DAYS,
        // Il comune non va risolto per punto-in-poligono: la zona *e'* un comune, per costruzione.
        municipality: zone.name,
        nearbyMunicipalities: [],
        stationByCode: NO_STATIONS,
      })
      if (snapshotZone !== null) computed.push(snapshotZone)
    }
    console.log(
      `  lotto ${i + 1}/${chunks.length}: ${computed.length} zone calcolate, ` +
        `${Math.round(pacer.used)} chiamate pesate spese`,
    )
  }

  const byRegion = new Map<string, { region: string; zones: SnapshotZone[] }>()
  const regionByCode = new Map(zones.map((z) => [z.code, z.region]))
  for (const zone of computed) {
    const region = regionByCode.get(zone.code)
    if (region === undefined) continue
    const slug = regionSlug(region)
    const entry = byRegion.get(slug) ?? { region, zones: [] }
    entry.zones.push(zone)
    byRegion.set(slug, entry)
  }

  await mkdir(REGION_DIR, { recursive: true })
  const generatedAt = new Date().toISOString()

  for (const [slug, entry] of byRegion) {
    const snapshot: Snapshot = {
      generatedAt,
      algorithmVersion: ALGORITHM_V1.version,
      referenceDate: todayIso,
      // A parita' di punteggio decide il valore senza tetto: vedi `rankZones` in
      // `src/lib/snapshot/load.ts` per il perche'.
      zones: [...entry.zones].sort(
        (a, b) => b.mpi - a.mpi || (b.mpiRaw ?? b.mpi) - (a.mpiRaw ?? a.mpi),
      ),
      sources: [
        {
          status: 'ok',
          recordsFetched: entry.zones.length,
          coverage: `${entry.region}, modelli a 2-11 km`,
          name: 'Open-Meteo',
          license: LICENSES.openMeteo.code,
          url: LICENSES.openMeteo.url,
          attribution: LICENSES.openMeteo.attribution,
          lastUpdate: todayIso,
        },
      ],
      uncalibratedParams: uncalibratedParams(),
    }
    await writeFile(
      path.join(REGION_DIR, `${slug}.json`),
      `${JSON.stringify(snapshot)}\n`,
      'utf8',
    )
  }

  const index: ItaliaIndex = {
    generatedAt,
    algorithmVersion: ALGORITHM_V1.version,
    referenceDate: todayIso,
    regions: [...byRegion.entries()]
      .map(([slug, entry]) => ({ name: entry.region, slug, zoneCount: entry.zones.length }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    zones: computed.map((zone) => {
      const region = regionByCode.get(zone.code) ?? ''
      return {
        code: zone.code,
        name: zone.name,
        region,
        regionSlug: regionSlug(region),
        province: zone.municipality ?? zone.name,
        provinceAcronym: zone.province,
        latitude: zone.latitude,
        longitude: zone.longitude,
        elevationM: zone.elevationM,
        mpi: zone.mpi,
        mpiRaw: zone.mpiRaw ?? zone.mpi,
        label: zone.label,
        confidence: zone.confidence,
        limitingFactor: zone.limitingFactor,
        development: zone.development,
      }
    }),
  }
  await writeFile(INDEX_FILE, `${JSON.stringify(index)}\n`, 'utf8')

  console.log(`Scritti ${INDEX_FILE} e ${byRegion.size} file di regione in ${REGION_DIR}/`)
}

if (process.argv[1]?.includes('build-snapshot-italia')) {
  main().catch((error: unknown) => {
    console.error('Snapshot Italia fallito:', error)
    process.exitCode = 1
  })
}
