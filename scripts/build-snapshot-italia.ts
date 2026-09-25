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
  blendRain,
  buildRainBlendUrl,
  rainBlendByDate,
  rainBlendWeightPerPoint,
  type RainBlendResponse,
} from '@/lib/pipeline/open-meteo-series'
import { mpiLabel } from '@/lib/model/mpi'
import { buildZoneSnapshot } from '@/lib/pipeline/zone-snapshot'
import type { DailySamples } from '@/lib/pipeline/zone-series'
import { LICENSES } from '@/lib/sources/adapter'
import { annotate } from '@/lib/pipeline/ci-report'
import { fetchJson, HttpError, NonJsonResponseError } from '@/lib/sources/http'
import {
  OPEN_METEO_FREE_LIMITS,
  RateBudgetExhausted,
  RatePacer,
} from '@/lib/sources/open-meteo-rate'
import { hasValidShape } from '@/lib/snapshot/load'
import { SNAPSHOT_SCHEMA_VERSION } from '@/lib/snapshot/types'
import type { Snapshot, SnapshotSource, SnapshotZone } from '@/lib/snapshot/types'
import type { ForestFile } from '@/../scripts/ingest-forest-italia'
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
/** Peso della seconda richiesta, solo pioggia ICON-2I: vedi `blendRain`. */
const RAIN_WEIGHT_PER_POINT = rainBlendWeightPerPoint()

const ZONES_FILE = 'public/data/zones-italia.json'
const FOREST_FILE = 'public/data/forest-italia.json'
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

interface ZoneForest {
  readonly forest: readonly string[]
  readonly forestFraction: number
  /** Le quote per tipo: da qui in poi il bosco non e' piu' solo un'etichetta, pesa sul punteggio. */
  readonly shares: Readonly<Record<string, number>>
}

/**
 * Il bosco misurato di ogni zona, da `scripts/ingest-forest-italia.ts`.
 *
 * Mappa vuota quando il file non c'e': le zone restano senza bosco, come prima che la fonte
 * esistesse, invece di far fallire il calcolo del punteggio, che dal bosco non dipende.
 */
async function loadForest(): Promise<Map<string, ZoneForest>> {
  try {
    const raw = await readFile(FOREST_FILE, 'utf-8')
    const file = JSON.parse(raw) as ForestFile
    return new Map(
      file.zones.map((zone) => [
        zone.code,
        { forest: zone.forest, forestFraction: zone.forestFraction, shares: zone.shares },
      ]),
    )
  } catch {
    return new Map()
  }
}

/** Le zone nazionali non hanno osservazioni: mappe vuote, condivise, invece di una per zona. */
const NO_OBSERVATIONS: ReadonlyMap<string, DailySamples> = new Map()
const NO_STATIONS: ReadonlyMap<string, Station> = new Map()

/**
 * Cosa fare del file di una regione dopo la corsa. Pura: decide sui conteggi, senza toccare il
 * disco, cosi' ogni ramo si verifica con un test.
 *
 * - `write` `ok`: la regione ha tutte le sue zone;
 * - `keep`: qualche lotto e' fallito e il file di ieri c'e': resta quello, intero. Scriverci sopra
 *   una regione a meta' farebbe sparire dalla mappa i comuni del lotto perso, presentando come
 *   "oggi" un elenco monco; il file di ieri e' completo, porta la sua data, e `SourceHealth` lo
 *   segnala come vecchio appena supera la soglia;
 * - `write` `degraded`: lotto fallito e nessun file di ieri da tenere — meglio mezza regione
 *   dichiarata tale che nessuna regione;
 * - `lost`: nessuna zona calcolata e nessun file precedente, cioe' solo alla prima corsa.
 */
export type RegionPlan =
  | {
      readonly kind: 'write'
      readonly slug: string
      readonly region: string
      readonly zones: readonly SnapshotZone[]
      readonly status: 'ok' | 'degraded'
      readonly failed: number
    }
  | { readonly kind: 'keep'; readonly slug: string; readonly region: string; readonly failed: number }
  | { readonly kind: 'lost'; readonly slug: string; readonly region: string; readonly failed: number }

export function planRegions(
  catalog: ReadonlyArray<Pick<ItalianZone, 'code' | 'region'>>,
  computed: readonly SnapshotZone[],
  failedCodes: ReadonlySet<string>,
  previousSlugs: ReadonlySet<string>,
): RegionPlan[] {
  const bySlug = new Map<string, { region: string; failed: number; zones: SnapshotZone[] }>()
  const slugByCode = new Map<string, string>()
  for (const zone of catalog) {
    const slug = regionSlug(zone.region)
    slugByCode.set(zone.code, slug)
    const entry = bySlug.get(slug) ?? { region: zone.region, failed: 0, zones: [] }
    if (failedCodes.has(zone.code)) entry.failed += 1
    bySlug.set(slug, entry)
  }
  for (const zone of computed) {
    const slug = slugByCode.get(zone.code)
    if (slug !== undefined) bySlug.get(slug)?.zones.push(zone)
  }

  return [...bySlug.entries()].map(([slug, { region, failed, zones }]): RegionPlan => {
    if (failed === 0 && zones.length > 0) {
      return { kind: 'write', slug, region, zones, status: 'ok', failed }
    }
    if (previousSlugs.has(slug)) return { kind: 'keep', slug, region, failed }
    if (zones.length > 0) return { kind: 'write', slug, region, zones, status: 'degraded', failed }
    return { kind: 'lost', slug, region, failed }
  })
}

function toIndexEntry(zone: SnapshotZone, region: string): ItaliaIndexEntry {
  return {
    code: zone.code,
    name: zone.name,
    region,
    regionSlug: regionSlug(region),
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
}

/**
 * La voce d'indice di una zona tenuta dalla corsa precedente, riportata al giorno di oggi.
 *
 * L'indice dichiara `referenceDate` di oggi, e "Le tue zone" lo usa per dire "aggiornato il...":
 * copiando `mpi` e `label` della zona cosi' com'erano, il punteggio di ieri veniva presentato come
 * quello di oggi. Il file di ieri contiene pero' anche la previsione per oggi nella sua serie: si
 * usa quella. Se oggi manca dalla serie (file piu' vecchio dell'orizzonte), resta il valore del
 * file, e il resoconto della corsa segnala comunque la regione come non aggiornata.
 */
export function keptIndexEntry(zone: SnapshotZone, region: string, todayIso: string): ItaliaIndexEntry {
  const entry = toIndexEntry(zone, region)
  const point = zone.series.find((p) => p.date === todayIso)
  if (point === undefined) return entry
  return {
    ...entry,
    mpi: point.mpi,
    mpiRaw: point.mpi,
    label: mpiLabel(point.mpi),
    confidence: point.confidence,
  }
}

/** `true` quando catalogo e bosco toscani ci sono: la Toscana passa a `build-snapshot-toscana.ts`. */
async function tuscanyCatalogReady(): Promise<boolean> {
  try {
    await readFile('public/data/zones-toscana.json', 'utf-8')
    await readFile('public/data/forest-toscana.json', 'utf-8')
    return true
  } catch {
    return false
  }
}

/** Il file di regione della corsa precedente, se c'e' ed e' leggibile. */
async function loadPreviousRegion(slug: string): Promise<Snapshot | null> {
  try {
    const raw = await readFile(path.join(REGION_DIR, `${slug}.json`), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    return hasValidShape(parsed) ? parsed : null
  } catch {
    return null
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * La causa di un lotto fallito in una riga corta, per l'annotazione: il messaggio intero porta
 * l'URL con le coordinate di cento comuni, che resta nel log ma renderebbe illeggibile l'avviso.
 */
function shortError(error: unknown): string {
  if (error instanceof NonJsonResponseError) {
    return `risposta non JSON ("${error.bodySnippet.slice(0, 60)}")`
  }
  if (error instanceof HttpError) return `HTTP ${error.status}`
  return describeError(error).slice(0, 200)
}

async function main(): Promise<void> {
  const catalogZones = await loadZones()
  /*
   * La Toscana, quando c'e' il suo catalogo completo, la calcola `build-snapshot-toscana.ts` con i
   * pluviometri della Regione: qui si salta, e le sue voci d'indice si riprendono dal suo file.
   */
  const tuscanyOwned = await tuscanyCatalogReady()
  const zones = catalogZones === null ? null : catalogZones.filter((z) => !(tuscanyOwned && z.region === 'Toscana'))
  if (tuscanyOwned) console.log('Toscana calcolata a parte, con le stazioni SIR: esclusa da questa corsa.')
  const forestByCode = await loadForest()
  if (zones === null) {
    console.log(
      `${ZONES_FILE} non trovato: niente da calcolare. ` +
        'Genera prima il catalogo con `npx tsx scripts/ingest-zones-italia.ts`.',
    )
    return
  }

  console.log(
    forestByCode.size === 0
      ? `${FOREST_FILE} non trovato: le zone resteranno senza tipo di bosco.`
      : `Bosco misurato disponibile per ${forestByCode.size} zone.`,
  )

  const todayIso = today()
  const estimatedWeight = zones.length * (WEIGHT_PER_POINT + RAIN_WEIGHT_PER_POINT)
  console.log(`Snapshot Italia ${ALGORITHM_V1.version} - ${todayIso} - ${zones.length} zone`)
  console.log(
    `Costo stimato: ${Math.round(estimatedWeight)} chiamate pesate su ` +
      `${OPEN_METEO_FREE_LIMITS.perDay} al giorno, in lotti da ${POINTS_PER_REQUEST} punti.`,
  )

  const computed: SnapshotZone[] = []
  /*
   * I lotti sono indipendenti: uno che fallisce (dopo i tentativi di `fetchJson`) segna le sue
   * zone come perse e si passa al successivo. Prima un solo lotto andato male — un 200 con una
   * pagina "timeoutReached" al posto del JSON, un numero di risposte sbagliato — buttava via
   * l'intera corsa, comprese le regioni gia' calcolate bene.
   */
  const failedCodes = new Set<string>()
  const failedBatches: string[] = []
  // Attesa massima per lotto poco oltre l'ora: sopra le ~1.000 zone la corsa deve scavallare la
  // finestra oraria, e dormire e' l'unico modo di restare dentro il piano gratuito.
  const pacer = new RatePacer({ maxWaitMs: 65 * 60_000 })
  let rainBlendEnabled = true
  let rainBlendMissing = 0
  const chunks = chunkPoints(zones, POINTS_PER_REQUEST)
  for (const [i, chunk] of chunks.entries()) {
    let responses: OpenMeteoResponse[]
    try {
      const waited = await pacer.reserve(chunk.length * WEIGHT_PER_POINT)
      if (waited > 0) {
        console.log(`  pausa di ${Math.round(waited / 1000)} s per restare nei limiti Open-Meteo`)
      }
      responses = await fetchJson<OpenMeteoResponse[]>(
        buildForecastUrl(chunk, HISTORY_DAYS, FORECAST_DAYS),
        { timeoutMs: 180_000 },
      )
      if (responses.length !== chunk.length) {
        // Un disallineamento assegnerebbe il meteo di un comune a un altro: il lotto si scarta.
        throw new Error(`Open-Meteo: ${responses.length} risposte per ${chunk.length} punti`)
      }
    } catch (error) {
      /*
       * Il budget finito non e' un guasto del lotto ma il limite del piano: i lotti dopo
       * fallirebbero allo stesso modo, e provarli vorrebbe dire solo aspettare per niente. Si
       * fermano tutti qui, e le loro regioni tengono il file di ieri come le altre perse.
       */
      const exhausted = error instanceof RateBudgetExhausted
      const lostChunks = exhausted ? chunks.slice(i) : [chunk]
      for (const zone of lostChunks.flat()) failedCodes.add(zone.code)
      const regions = [...new Set(lostChunks.flat().map((z) => z.region))].join(', ')
      const label = exhausted
        ? `lotti ${i + 1}-${chunks.length}/${chunks.length}`
        : `lotto ${i + 1}/${chunks.length}`
      failedBatches.push(`${label} (${regions}): ${shortError(error)}`)
      console.error(`  ${label} FALLITO (${regions}): ${describeError(error)}`)
      if (exhausted) break
      continue
    }

    /*
     * La pioggia del secondo modello (ICON-2I), da mediare con quella della risposta principale.
     * Mai bloccante: se manca, il lotto si calcola con il modello di sempre, com'era fino al
     * 25/09/2026, e il contatore lo dice a fine corsa.
     */
    let rainBlend: RainBlendResponse[] | null = null
    if (rainBlendEnabled) {
      try {
        await pacer.reserve(chunk.length * RAIN_WEIGHT_PER_POINT)
        const blend = await fetchJson<RainBlendResponse[] | RainBlendResponse>(buildRainBlendUrl(chunk), {
          timeoutMs: 120_000,
        })
        const list = Array.isArray(blend) ? blend : [blend]
        if (list.length === chunk.length) rainBlend = list
        else console.warn(`  pioggia ICON-2I: ${list.length} risposte per ${chunk.length} punti, lotto senza media`)
      } catch (error) {
        if (error instanceof RateBudgetExhausted) rainBlendEnabled = false
        console.warn(`  pioggia ICON-2I non disponibile per il lotto ${i + 1}: ${shortError(error)}`)
      }
    }
    if (rainBlend === null) rainBlendMissing += chunk.length

    for (const [j, zone] of chunk.entries()) {
      const response = responses[j]
      if (response === undefined) continue
      const blendForZone = rainBlend?.[j]
      const series = toModelSeries(response, todayIso)
      const measured = forestByCode.get(zone.code)
      const snapshotZone = buildZoneSnapshot({
        zone: {
          code: zone.code,
          name: zone.name,
          reference: zone.name,
          province: zone.provinceAcronym,
          latitude: zone.latitude,
          longitude: zone.longitude,
          elevationM: zone.elevationM,
          // Il catalogo nasce con `forest` vuoto: il bosco vero arriva dalla copertura misurata,
          // e si ricade sul catalogo solo se quella corsa non e' ancora stata fatta.
          forest: measured?.forest ?? zone.forest,
          ...(measured === undefined
            ? {}
            : { forestFraction: measured.forestFraction, forestShares: measured.shares }),
          stationNotes: NATIONAL_STATION_NOTE,
        },
        modelSeries: blendForZone === undefined ? series : blendRain(series, rainBlendByDate(blendForZone)),
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

  console.log(
    rainBlendMissing === 0
      ? 'Pioggia: media Open-Meteo + ICON-2I per tutte le zone.'
      : `Pioggia: ${rainBlendMissing} zone senza ICON-2I, calcolate con il solo modello di base.`,
  )

  if (computed.length === 0) {
    // Tutto perso: non si scrive niente, ne' le regioni ne' l'indice. I file di ieri restano
    // intatti, e lo script esce con errore perche' non c'e' nessun dato di oggi da salvare.
    throw new Error(
      `Nessuna zona calcolata: tutti i ${chunks.length} lotti sono falliti, restano i file ` +
        `della corsa precedente. ${failedBatches.join(' | ')}`,
    )
  }

  // Letti solo se servono: senza lotti falliti ogni regione si riscrive comunque.
  const previous = new Map<string, Snapshot>()
  if (failedCodes.size > 0) {
    for (const slug of new Set(zones.map((z) => regionSlug(z.region)))) {
      const snapshot = await loadPreviousRegion(slug)
      if (snapshot !== null) previous.set(slug, snapshot)
    }
  }
  const plans = planRegions(zones, computed, failedCodes, new Set(previous.keys()))

  await mkdir(REGION_DIR, { recursive: true })
  const generatedAt = new Date().toISOString()

  const indexRegions: Array<{ name: string; slug: string; zoneCount: number }> = []
  const indexZones: ItaliaIndexEntry[] = []
  const written: string[] = []

  for (const plan of plans) {
    if (plan.kind === 'lost') continue
    if (plan.kind === 'keep') {
      /*
       * L'indice riprende le voci dal file tenuto, non dall'indice di ieri: cosi' menu e dettaglio
       * della regione dicono gli stessi numeri anche se l'indice precedente mancasse o fosse gia'
       * disallineato. Senza, la regione sparirebbe dal menu pur avendo un file valido.
       */
      const kept = previous.get(plan.slug)?.zones ?? []
      indexRegions.push({ name: plan.region, slug: plan.slug, zoneCount: kept.length })
      indexZones.push(...kept.map((zone) => keptIndexEntry(zone, plan.region, todayIso)))
      continue
    }

    const source: SnapshotSource = {
      // Dal risultato vero, non scritto a mano: `degraded` quando la regione esce con una parte
      // dei comuni perche' un lotto e' fallito e non c'era un file di ieri da tenere.
      status: plan.status,
      recordsFetched: plan.zones.length,
      coverage: `${plan.region}, modelli a 2-11 km; pioggia: media con ICON-2I (ItaliaMeteo-ARPAE, 2 km)`,
      name: 'Open-Meteo',
      license: LICENSES.openMeteo.code,
      url: LICENSES.openMeteo.url,
      attribution: LICENSES.openMeteo.attribution,
      lastUpdate: todayIso,
    }
    const snapshot: Snapshot = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      generatedAt,
      algorithmVersion: ALGORITHM_V1.version,
      referenceDate: todayIso,
      // A parita' di punteggio decide il valore senza tetto: vedi `rankZones` in
      // `src/lib/snapshot/load.ts` per il perche'.
      zones: [...plan.zones].sort(
        (a, b) => b.mpi - a.mpi || (b.mpiRaw ?? b.mpi) - (a.mpiRaw ?? a.mpi),
      ),
      sources: [source],
      uncalibratedParams: uncalibratedParams(),
    }
    await writeFile(
      path.join(REGION_DIR, `${plan.slug}.json`),
      `${JSON.stringify(snapshot)}\n`,
      'utf8',
    )
    written.push(plan.slug)
    indexRegions.push({ name: plan.region, slug: plan.slug, zoneCount: plan.zones.length })
    indexZones.push(...plan.zones.map((zone) => toIndexEntry(zone, plan.region)))
  }

  if (tuscanyOwned) {
    const tuscany = await loadPreviousRegion('toscana')
    if (tuscany !== null) {
      indexRegions.push({ name: 'Toscana', slug: 'toscana', zoneCount: tuscany.zones.length })
      indexZones.push(...tuscany.zones.map((zone) => keptIndexEntry(zone, 'Toscana', todayIso)))
    }
  }

  const index: ItaliaIndex = {
    generatedAt,
    algorithmVersion: ALGORITHM_V1.version,
    referenceDate: todayIso,
    regions: indexRegions.sort((a, b) => a.name.localeCompare(b.name)),
    zones: indexZones,
  }
  await writeFile(INDEX_FILE, `${JSON.stringify(index)}\n`, 'utf8')

  console.log(`Scritti ${INDEX_FILE} e ${written.length} file di regione in ${REGION_DIR}/`)

  const partial = describePartialRun(plans, failedBatches)
  if (partial !== null) annotate('warning', partial.title, partial.message)
  // Zone calcolate ma nessuna regione scritta (tutte tenute da ieri): la corsa non ha prodotto
  // un solo dato di oggi, e verde con un avviso sembrerebbe una corsa andata bene.
  if (written.length === 0) {
    annotate('error', 'Nessuna regione aggiornata', 'Tutte le regioni sono rimaste ai file della corsa precedente.')
    process.exitCode = 1
  }

  await checkConsistency(generatedAt, written)
}

/**
 * Il resoconto delle regioni che non sono di oggi, o `null` se la corsa e' completa. Pura, per i
 * test.
 *
 * Un avviso e non un errore, di proposito: il dato che c'era e' stato salvato e le regioni rimaste
 * indietro portano la loro data. Lo script esce con errore solo quando non si e' salvato niente
 * (vedi `computed.length === 0` in `main`), o quando i file appena scritti non tornano
 * (`checkConsistency`).
 */
export function describePartialRun(
  plans: readonly RegionPlan[],
  failedBatches: readonly string[],
): { title: string; message: string } | null {
  const affected = plans.filter((plan) => plan.kind !== 'write' || plan.status !== 'ok')
  if (failedBatches.length === 0 && affected.length === 0) return null
  const describe = (plan: RegionPlan): string => {
    switch (plan.kind) {
      case 'keep':
        return `${plan.region}: ${plan.failed} zone perse, resta il file della corsa precedente`
      case 'lost':
        return `${plan.region}: nessuna zona calcolata e nessun file precedente, assente`
      case 'write':
        return `${plan.region}: scritta parziale con ${plan.zones.length} zone, fonte "degraded"`
    }
  }
  return {
    title: `Snapshot nazionale parziale: ${affected.length} regioni non aggiornate`,
    message:
      `${affected.map(describe).join('; ')}.` +
      (failedBatches.length > 0 ? ` Lotti falliti: ${failedBatches.join(' | ')}` : ''),
  }
}

/**
 * Quali regioni non portano il `generatedAt` atteso — pura, senza toccare il disco, cosi' si
 * verifica con un test senza dover scrivere file veri.
 *
 * `undefined` in `written` significa "file mancante o illeggibile", che conta come disallineato
 * tanto quanto una data diversa: in entrambi i casi quel file non riflette la corsa di oggi.
 */
export function findMismatched(
  generatedAt: string,
  written: ReadonlyMap<string, string | undefined>,
): string[] {
  return [...written.entries()]
    .filter(([, value]) => value !== generatedAt)
    .map(([slug]) => slug)
}

/**
 * Rilegge quanto appena scritto e verifica che ogni file di regione porti lo stesso `generatedAt`
 * dell'indice appena prodotto.
 *
 * Questo script scrive un file per regione in un ciclo e l'indice per ultimo (vedi il commento in
 * cima al file): un'interruzione a metà corsa — il runner ucciso dal timeout, un disco pieno —
 * lascerebbe alcune regioni aggiornate a oggi e altre ferme a ieri, con l'indice disallineato da
 * entrambe, senza che niente lo segnali: la corsa successiva scriverebbe sopra in silenzio.
 * `algorithmVersionMismatch()` (`src/lib/snapshot/types.ts`) fa la stessa verifica per la Toscana,
 * confrontando codice e snapshot; qui si confrontano i file fra loro, perché non c'è un singolo
 * "codice" con cui confrontare venti file scritti nella stessa corsa.
 *
 * Si controllano solo le regioni scritte in questa corsa: quelle tenute apposta dalla corsa
 * precedente (`planRegions`, ramo `keep`) portano per costruzione la loro data, e sono gia'
 * dichiarate da `describePartialRun`.
 *
 * Fallisce lo script (non silenziosamente) se un file manca o porta una data diversa: nel
 * workflow il passo nazionale non blocca il commit dei dati toscani, ma un suo fallimento fa
 * diventare rossa la corsa dopo il commit, invece di un file scritto sopra in silenzio al giro
 * successivo.
 */
async function checkConsistency(generatedAt: string, slugs: readonly string[]): Promise<void> {
  const written = new Map<string, string | undefined>()
  for (const slug of slugs) {
    try {
      const raw = await readFile(path.join(REGION_DIR, `${slug}.json`), 'utf-8')
      written.set(slug, (JSON.parse(raw) as Pick<Snapshot, 'generatedAt'>).generatedAt)
    } catch {
      written.set(slug, undefined)
    }
  }
  const mismatched = findMismatched(generatedAt, written)
  if (mismatched.length > 0) {
    throw new Error(
      `Corsa incoerente: ${mismatched.length} file di regione non portano il generatedAt ` +
        `dell'indice appena scritto (${generatedAt}): ${mismatched.join(', ')}. ` +
        'Probabile interruzione a metà corsa (timeout, disco pieno): i file elencati restano ' +
        'quelli della corsa precedente e vanno rigenerati.',
    )
  }
}

if (process.argv[1]?.includes('build-snapshot-italia')) {
  main().catch((error: unknown) => {
    console.error('Snapshot Italia fallito:', error)
    annotate('error', 'Snapshot nazionale non aggiornato', describeError(error))
    process.exitCode = 1
  })
}
