/**
 * Assegna a ogni zona italiana il bosco che ha davvero, leggendolo dalla mappa europea dei generi.
 *
 *   npx tsx scripts/ingest-forest-italia.ts [--columns 4300,4400] [--radius-km 3] [--dry-run]
 *   npx tsx scripts/ingest-forest-italia.ts --catalog toscana [--relocate]
 *
 * **Perche' esiste.** Fuori dalla Toscana ogni zona dichiara di non sapere che bosco ha: il campo
 * `forest` del catalogo nasce vuoto perche' finora non c'era una fonte. Per un sito sui porcini e'
 * il buco piu' grosso, perche' senza il bosco un punteggio meteo alto vale uguale sopra una
 * faggeta e sopra un seminativo. Questa e' la corsa che lo riempie.
 *
 * **Come funziona.** La fonte (ForestPaths, vedi `src/lib/sources/forest-genus.ts`) e' distribuita
 * in EPSG:3035 come archivi ZIP, uno per colonna di 100 km, ognuno con dentro le tessere COG di
 * quella colonna. Non si possono leggere a pezzi da rete: vanno scaricati interi. Quindi si va una
 * colonna alla volta — scarica, estrai una tessera, campiona le zone che ci cascano dentro,
 * cancella — cosi' il disco non deve mai contenere piu' di un archivio e una tessera.
 *
 * Per ogni zona si legge un disco di raggio dichiarato attorno al punto di riferimento del comune,
 * non il singolo pixel: un pixel dice cosa c'e' sotto il municipio, che spesso e' il paese. Il
 * raggio di 3 km copre all'incirca la superficie di un comune di montagna, e regge anche se il
 * punto di riferimento e' spostato di un chilometro.
 *
 * Una zona vicina al bordo di una tessera ha il suo disco a cavallo di due tessere, anche di due
 * colonne diverse. Gli istogrammi si accumulano per codice zona e si compongono solo alla fine,
 * percio' il conto torna comunque.
 *
 * **Gira su GitHub Actions**, non in locale: servono qualche giga di rete verso Zenodo, che
 * l'ambiente di sviluppo non raggiunge (403 di policy). Il risultato resta committato nel
 * repository, perche' il bosco non cambia da un giorno all'altro.
 */

import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { fromFile } from 'geotiff'

import { ZONES as TUSCAN_ZONES } from '@/lib/config/zones'
import { fromLaea, toLaea } from '@/lib/geo/laea'
import { resolveElevations } from '@/lib/sources/elevation'
import { composeForest, type ForestComposition } from '@/lib/sources/forest-genus'
import { cellKey, forestPoint, type WoodCell } from '@/lib/sources/forest-point'
import { USER_AGENT } from '@/lib/sources/http'
import { pointInGeometry } from '@/lib/sources/istat-boundaries'
import { fetchNationalBoundaries } from '@/lib/sources/istat-national'

const run = promisify(execFile)

const ZENODO_RECORD = '13341104'
const SOURCE_NAME = 'ForestPaths — European tree genus map (10 m, 2020)'
const SOURCE_URL = `https://doi.org/10.5281/zenodo.${ZENODO_RECORD}`
const SOURCE_LICENSE = 'CC BY 4.0'
const SOURCE_NOTE =
  'Versione dichiarata "early access" dagli autori: non ancora validata del tutto, con possibili ' +
  'incoerenze regionali. Classifica il genere, non la tipologia forestale: il castagno ricade in ' +
  '"altre latifoglie" e l\'abete bianco in "altre conifere".'

/** Lato della griglia di distribuzione, in metri: una colonna ZIP ogni 100 km. */
const TILE_M = 100_000

const DEFAULT_RADIUS_KM = 3

/** Valore della classe "non bosco" nella legenda ForestPaths: vedi `FOREST_CLASSES`. */
const NO_TREES_CLASS = 7

/** Accumulatore mutabile di una cella: `WoodCell` con gli stessi campi, ma scrivibili. */
interface MutableCell extends Record<keyof WoodCell, number> {
  wooded: number
  total: number
  sumX: number
  sumY: number
}

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return null
  return process.argv[index + 1] ?? null
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

interface ItalianZone {
  readonly code: string
  readonly name: string
  readonly region: string
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number
}

/** Si legge e si riscrive per intero: in `--relocate` cambiano solo punti e quote. */
interface ZonesFile {
  readonly zones: readonly ItalianZone[]
  readonly [key: string]: unknown
}

interface PlacedZone extends ItalianZone {
  readonly x: number
  readonly y: number
  readonly column: number
}

export interface ForestZoneRecord extends ForestComposition {
  readonly code: string
  readonly name: string
  readonly region: string
}

export interface ForestFile {
  readonly source: string
  readonly sourceUrl: string
  readonly license: string
  readonly note: string
  readonly generatedAt: string
  readonly radiusKm: number
  readonly zones: readonly ForestZoneRecord[]
}

/** Colonna di distribuzione che contiene una coordinata, nella forma usata nei nomi dei file. */
function columnOf(x: number): number {
  return Math.floor(x / TILE_M) * (TILE_M / 1000)
}

async function download(url: string, dest: string): Promise<number> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
      if (!response.ok || response.body === null) {
        throw new Error(`HTTP ${response.status} su ${url}`)
      }
      // Si scrive a blocchi invece di tenere l'archivio in memoria: sono centinaia di MB, e la
      // stessa corsa ne scarica dieci uno dopo l'altro.
      const out = createWriteStream(dest)
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!out.write(value)) await once(out, 'drain')
      }
      out.end()
      await once(out, 'finish')
      return (await stat(dest)).size
    } catch (error) {
      if (attempt === 3) throw error
      const waitMs = 5_000 * attempt
      console.log(`  scaricamento fallito (${String(error)}), riprovo fra ${waitMs / 1000} s`)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }
  throw new Error('irraggiungibile')
}

/** Nomi dei membri `.tif` dentro l'archivio, senza estrarne nessuno. */
async function listTiffs(zip: string): Promise<string[]> {
  const { stdout } = await run('unzip', ['-Z1', zip], { maxBuffer: 64 * 1024 * 1024 })
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\.tiff?$/i.test(line))
}

/**
 * Salta le tessere che non possono contenere nessuna zona, guardando il nome.
 *
 * Un archivio di colonna copre tutta l'Europa in altezza, dalla Sicilia alla Lapponia: estrarre
 * e aprire ogni tessera vuol dire scompattare qualche giga per scoprire che dentro non c'e'
 * niente di italiano. Il nome dichiara l'angolo in alto a sinistra
 * (`spp_pred_ulx_4400_uly_2340.tif`, in chilometri), quindi si puo' decidere prima.
 *
 * Il margine e' volutamente largo, e il dubbio si risolve sempre estraendo: se un giorno il nome
 * cambiasse significato, la corsa diventerebbe lenta come prima, non sbagliata.
 */
export function tileCanHoldZones(
  member: string,
  zones: readonly { readonly y: number }[],
): boolean {
  const match = /ulx_(\d+)_uly_(\d+)/.exec(path.basename(member))
  if (match === null) return true
  const uly = Number(match[2]) * 1000
  if (!Number.isFinite(uly)) return true
  const margin = 150_000
  const bottom = uly - TILE_M - margin
  const top = uly + margin
  return zones.some((zone) => zone.y >= bottom && zone.y <= top)
}

async function extract(zip: string, member: string, dir: string): Promise<string> {
  await run('unzip', ['-o', '-j', '-q', zip, member, '-d', dir], { maxBuffer: 16 * 1024 * 1024 })
  return path.join(dir, path.basename(member))
}

/**
 * Accumula nell'istogramma di ogni zona i pixel della tessera che cadono dentro il suo disco.
 *
 * Il disco, non il quadrato: un quadrato di lato 6 km pesa gli angoli come il centro, e su un
 * fondovalle stretto gli angoli sono il crinale di fianco.
 */
async function sampleTile(
  tiffPath: string,
  zones: readonly PlacedZone[],
  radiusM: number,
  histograms: Map<string, Map<number, number>>,
  /** Celle di bosco per zona, solo in `--relocate`: servono a spostare il punto, non a contare. */
  cellsByZone: Map<string, Map<number, MutableCell>> | null = null,
): Promise<number> {
  const tiff = await fromFile(tiffPath)
  const image = await tiff.getImage()
  const origin = image.getOrigin()
  const resolution = image.getResolution()
  const originX = origin[0]
  const originY = origin[1]
  const resX = resolution[0]
  const resY = resolution[1]
  if (originX === undefined || originY === undefined || resX === undefined || resY === undefined) {
    // Una tessera senza georeferenziazione non si puo' collocare: fermarsi e' meglio che
    // assegnare alle zone il bosco di coordinate inventate.
    throw new Error(`Tessera senza coordinate: ${tiffPath}`)
  }
  const width = image.getWidth()
  const height = image.getHeight()
  const pixelM = Math.abs(resX)

  let touched = 0
  for (const zone of zones) {
    const centreCol = (zone.x - originX) / resX
    const centreRow = (zone.y - originY) / resY
    const radiusPx = radiusM / pixelM

    const left = Math.max(0, Math.floor(centreCol - radiusPx))
    const right = Math.min(width, Math.ceil(centreCol + radiusPx))
    const top = Math.max(0, Math.floor(centreRow - radiusPx))
    const bottom = Math.min(height, Math.ceil(centreRow + radiusPx))
    if (right <= left || bottom <= top) continue

    const rasters = (await image.readRasters({
      window: [left, top, right, bottom],
    })) as unknown as Array<ArrayLike<number>>
    const band = rasters[0]
    if (band === undefined) continue

    const histogram = histograms.get(zone.code) ?? new Map<number, number>()
    const cells = cellsByZone === null ? null : cellsByZone.get(zone.code) ?? new Map<number, MutableCell>()
    const windowWidth = right - left
    for (let row = top; row < bottom; row += 1) {
      const dy = row + 0.5 - centreRow
      for (let col = left; col < right; col += 1) {
        const dx = col + 0.5 - centreCol
        if (dx * dx + dy * dy > radiusPx * radiusPx) continue
        const value = band[(row - top) * windowWidth + (col - left)] as number
        histogram.set(value, (histogram.get(value) ?? 0) + 1)
        if (cells === null) continue
        // Fuori legenda vuol dire "senza dato", e non conta ne' come bosco ne' come non bosco:
        // stessa regola di `composeForest`, altrimenti il punto verrebbe deciso su pixel che il
        // conteggio del bosco ha gia' scartato.
        if (value < 0 || value > NO_TREES_CLASS) continue
        const px = originX + (col + 0.5) * resX
        const py = originY + (row + 0.5) * resY
        // Si muta l'accumulatore invece di ricrearlo: qui si passa una volta per pixel, e un
        // oggetto nuovo a pixel vorrebbe dire un miliardo di allocazioni in una corsa nazionale.
        const key = cellKey(px, py)
        let cell = cells.get(key)
        if (cell === undefined) {
          cell = { wooded: 0, total: 0, sumX: 0, sumY: 0 }
          cells.set(key, cell)
        }
        cell.total += 1
        if (value !== NO_TREES_CLASS) {
          cell.wooded += 1
          cell.sumX += px
          cell.sumY += py
        }
      }
    }
    histograms.set(zone.code, histogram)
    if (cells !== null && cellsByZone !== null) cellsByZone.set(zone.code, cells)
    touched += 1
  }
  await tiff.close?.()
  return touched
}

/**
 * Sposta il punto di calcolo di ogni zona dentro il suo bosco e riscrive il catalogo.
 *
 * Tre condizioni perche' un punto si muova davvero, e ognuna ha alle spalle un modo di sbagliare:
 *
 *   1. la zona deve avere bosco campionato, altrimenti non c'e' niente verso cui spostarsi;
 *   2. `forestPoint` deve dichiarare lo spostamento utile (sopra la soglia) e non "gia' dentro";
 *   3. il punto nuovo deve cadere **dentro il comune**. Senza questa verifica una zona di
 *      fondovalle stretto finirebbe col punto nel bosco del comune accanto, e due zone vicine
 *      potrebbero ritrovarsi con lo stesso identico punto e lo stesso identico punteggio.
 *
 * La quota va riletta per forza sui punti nuovi: e' il senso stesso della correzione. Tenere la
 * vecchia vorrebbe dire calcolare il meteo nel bosco e la stagione sul crinale.
 */
async function relocatePoints(
  zonesPath: string,
  file: ZonesFile,
  placed: readonly PlacedZone[],
  cellsByZone: ReadonlyMap<string, Map<number, MutableCell>>,
  dryRun: boolean,
): Promise<void> {
  console.log('\nScarico i confini comunali per verificare che i punti nuovi restino nel comune...')
  const boundaries = await fetchNationalBoundaries()
  const geometryByCode = new Map(
    boundaries.features.map((feature) => [feature.properties.com_istat_code, feature.geometry]),
  )
  console.log(`  confini disponibili per ${geometryByCode.size} comuni`)

  const moved = new Map<string, { latitude: number; longitude: number; movedKm: number }>()
  const reasons = new Map<string, number>()
  const count = (reason: string): void => {
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
  }

  /*
   * Solo le zone nazionali si spostano.
   *
   * Le sette toscane hanno un punto scelto a mano, legato alle stazioni SIR che le alimentano e
   * alle aree di studio da cui viene la calibrazione: spostarlo dentro il bosco romperebbe
   * proprio il legame che le rende le zone piu' affidabili che abbiamo.
   */
  const national = new Set(file.zones.map((zone) => zone.code))

  for (const zone of placed) {
    if (!national.has(zone.code)) continue
    const cells = cellsByZone.get(zone.code)
    if (cells === undefined || cells.size === 0) {
      count('nessun campione')
      continue
    }
    const geometry = geometryByCode.get(zone.code.replace(/^it-/, ''))
    if (geometry === undefined) {
      count('confine non trovato')
      continue
    }
    /*
     * Il confine entra nella scelta, non dopo.
     *
     * La prima corsa (21/9/2026) sceglieva il punto e poi verificava: 79 zone su 1.202 finivano
     * scartate perche' il bosco piu' vicino stava nel comune accanto, e fra quelle c'era Bormio,
     * cioe' il caso che aveva fatto nascere tutta la correzione.
     */
    const result = forestPoint(
      { x: zone.x, y: zone.y },
      cells,
      {
        inside: (x, y) => {
          const point = fromLaea(x, y)
          return pointInGeometry(point.lon, point.lat, geometry)
        },
      },
    )
    if (result.outcome !== 'spostato') {
      count(result.outcome)
      continue
    }
    const { lon, lat } = fromLaea(result.x, result.y)
    moved.set(zone.code, {
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lon.toFixed(5)),
      movedKm: result.movedM / 1000,
    })
  }

  console.log(`\nPunti da spostare: ${moved.size} su ${file.zones.length}.`)
  for (const [reason, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  fermi per "${reason}": ${n}`)
  }
  if (moved.size === 0) return

  const distances = [...moved.values()].map((m) => m.movedKm).sort((a, b) => a - b)
  const median = distances[Math.floor(distances.length / 2)] ?? 0
  console.log(
    `  spostamento mediano ${median.toFixed(2)} km, massimo ${(distances[distances.length - 1] ?? 0).toFixed(2)} km`,
  )

  console.log('\nRileggo la quota dei punti nuovi...')
  const elevations = await resolveElevations(
    [...moved.entries()].map(([code, m]) => ({
      key: code,
      latitude: m.latitude,
      longitude: m.longitude,
    })),
  )

  const byCode = new Map(placed.map((zone) => [zone.code, zone]))
  const drops: Array<{ name: string; from: number; to: number; km: number }> = []
  const zones = file.zones.map((zone) => {
    const move = moved.get(zone.code)
    if (move === undefined) return zone
    const elevationM = elevations.get(zone.code)
    if (elevationM === undefined) {
      // Senza la quota nuova il punto nuovo non si puo' usare: punto e quota devono descrivere
      // lo stesso posto, sempre.
      console.log(`  quota non risolta per ${zone.name}: resta dov'era`)
      return zone
    }
    drops.push({
      name: zone.name,
      from: byCode.get(zone.code)?.elevationM ?? zone.elevationM,
      to: elevationM,
      km: move.movedKm,
    })
    return { ...zone, latitude: move.latitude, longitude: move.longitude, elevationM }
  })

  drops.sort((a, b) => a.to - a.from - (b.to - b.from))
  console.log('\nScese di piu\':')
  for (const drop of drops.slice(0, 10)) {
    console.log(
      `  ${drop.name}: ${drop.from} → ${drop.to} m (${(drop.to - drop.from).toFixed(0)} m, ` +
        `punto spostato di ${drop.km.toFixed(1)} km)`,
    )
  }
  const lowered = drops.filter((d) => d.to < d.from).length
  console.log(`\nQuote scese: ${lowered}. Salite: ${drops.length - lowered}.`)

  if (dryRun) {
    console.log('\n--dry-run: niente scritto su disco.')
    return
  }

  const out = {
    ...file,
    generatedAt: new Date().toISOString(),
    pointRule:
      'Il punto di calcolo di ogni zona e\' il baricentro del bosco misurato attorno al ' +
      'centroide del comune (ForestPaths 10 m), vincolato a restare dentro il confine comunale. ' +
      'Prima era il centroide geometrico, che nei comuni alpini cade sopra il limite degli ' +
      'alberi. La quota e\' riletta sul punto nuovo.',
    zones,
  }
  await writeFile(zonesPath, `${JSON.stringify(out, null, 2)}\n`, 'utf-8')
  console.log(`\nScritto ${zonesPath}: ${moved.size} punti spostati.`)
}

async function main(): Promise<void> {
  const radiusKm = Number(flag('radius-km') ?? DEFAULT_RADIUS_KM)
  const radiusM = radiusKm * 1000
  const dryRun = has('dry-run')
  const relocate = has('relocate')
  const workDir = flag('work-dir') ?? path.join(process.cwd(), '.forest-work')
  const onlyColumns = flag('columns')
    ?.split(',')
    .map((c) => Number(c.trim()))
    .filter((c) => Number.isFinite(c))

  /*
   * `--catalog toscana` legge e scrive i file del catalogo toscano completo
   * (`scripts/ingest-zones-toscana.ts`), con la stessa procedura. Le sette zone di taratura
   * stanno gia' nel file nazionale del bosco, quindi li' non si ripetono.
   */
  const catalog = flag('catalog') === 'toscana' ? 'toscana' : 'italia'
  const zonesPath = path.join(process.cwd(), `public/data/zones-${catalog}.json`)
  const zonesFile = JSON.parse(await readFile(zonesPath, 'utf-8')) as ZonesFile
  const zones = zonesFile.zones
  /*
   * Anche le sette zone toscane, che non stanno nel catalogo nazionale.
   *
   * Prima del modello 1.4.0 non serviva: il bosco era solo un'etichetta, e quelle sette ce
   * l'hanno scritta a mano da sempre. Ora il bosco pesa sul punteggio, e misurarlo solo fuori
   * dalla Toscana avrebbe lasciato le sette zone di casa senza quel termine — cioe' sistemati-
   * camente piu' alte del resto d'Italia, per un motivo che non ha niente a che vedere col bosco.
   *
   * Le loro etichette restano quelle scritte a mano: dicono "abetina" e "castagneto", che la
   * mappa dei generi non sa nominare. Della misura si prende la copertura e le quote per tipo,
   * cioe' quello che serve al punteggio.
   */
  const sampled: ItalianZone[] = [
    ...zones,
    ...(catalog === 'toscana' ? [] : TUSCAN_ZONES).map((zone) => ({
      code: zone.code,
      name: zone.name,
      region: 'Toscana',
      latitude: zone.latitude,
      longitude: zone.longitude,
      elevationM: zone.elevationM,
    })),
  ]
  const placed: PlacedZone[] = sampled.map((zone) => {
    const { x, y } = toLaea(zone.longitude, zone.latitude)
    return { ...zone, x, y, column: columnOf(x) }
  })

  const byColumn = new Map<number, PlacedZone[]>()
  for (const zone of placed) {
    // Una zona vicino al bordo va cercata anche nella colonna accanto: il suo disco ci finisce
    // dentro, e senza questo il bosco oltre il confine della tessera sparirebbe dal conto.
    for (const column of new Set([columnOf(zone.x - radiusM), zone.column, columnOf(zone.x + radiusM)])) {
      const list = byColumn.get(column) ?? []
      list.push(zone)
      byColumn.set(column, list)
    }
  }

  const columns = [...byColumn.keys()]
    .filter((c) => onlyColumns === undefined || onlyColumns.includes(c))
    .sort((a, b) => a - b)

  console.log(`Zone da collocare: ${placed.length}. Colonne da scaricare: ${columns.length}.`)
  console.log(`Raggio di campionamento: ${radiusKm} km attorno al punto di riferimento.`)

  if (relocate) {
    console.log(
      'Modalita\' --relocate: si sposta il punto di calcolo dentro il bosco e si riscrive il ' +
        'catalogo zone. Il bosco NON viene pubblicato in questa corsa, perche\' e\' misurato ' +
        'attorno ai punti vecchi: serve una seconda corsa normale sui punti nuovi.',
    )
  }

  await mkdir(workDir, { recursive: true })
  const histograms = new Map<string, Map<number, number>>()
  const cellsByZone = relocate ? new Map<string, Map<number, MutableCell>>() : null

  for (const column of columns) {
    const name = `ulx_${column}.zip`
    const zipPath = path.join(workDir, name)
    const url = `https://zenodo.org/records/${ZENODO_RECORD}/files/${name}?download=1`
    console.log(`\n=== colonna ${column} (${byColumn.get(column)?.length ?? 0} zone candidate) ===`)
    const bytes = await download(url, zipPath)
    console.log(`  scaricati ${(bytes / 1e6).toFixed(0)} MB`)

    const members = await listTiffs(zipPath)
    console.log(`  tessere nell'archivio: ${members.length}`)

    const columnZones = byColumn.get(column) ?? []
    const wanted = members.filter((member) => tileCanHoldZones(member, columnZones))
    if (wanted.length < members.length) {
      console.log(`  ne servono ${wanted.length}: le altre sono fuori dall'Italia`)
    }

    for (const member of wanted) {
      const tilePath = await extract(zipPath, member, workDir)
      const touched = await sampleTile(tilePath, columnZones, radiusM, histograms, cellsByZone)
      if (touched > 0) console.log(`    ${path.basename(member)}: ${touched} zone campionate`)
      await rm(tilePath, { force: true })
    }
    await rm(zipPath, { force: true })
  }

  if (relocate && cellsByZone !== null) {
    await relocatePoints(zonesPath, zonesFile, placed, cellsByZone, dryRun)
    return
  }

  const records: ForestZoneRecord[] = []
  for (const zone of placed) {
    const composition = composeForest(histograms.get(zone.code) ?? new Map())
    if (composition === null) continue
    records.push({
      code: zone.code,
      name: zone.name,
      region: zone.region,
      ...composition,
    })
  }

  console.log(`\nZone con bosco riconosciuto: ${records.length} su ${placed.length}.`)
  const counts = new Map<string, number>()
  for (const record of records) {
    for (const slug of record.forest) counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  for (const [slug, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${slug}: ${n} zone`)
  }
  for (const record of records.slice(0, 8)) {
    console.log(
      `  esempio ${record.name} (${record.region}): ${record.forest.join(', ') || 'nessun tipo dominante'} ` +
        `— bosco ${Math.round(record.forestFraction * 100)}% su ${record.sampledPixels} pixel`,
    )
  }

  if (dryRun) {
    console.log('\n--dry-run: niente scritto su disco.')
    return
  }

  const file: ForestFile = {
    source: SOURCE_NAME,
    sourceUrl: SOURCE_URL,
    license: SOURCE_LICENSE,
    note: SOURCE_NOTE,
    generatedAt: new Date().toISOString(),
    radiusKm,
    zones: records,
  }
  const outPath = path.join(process.cwd(), `public/data/forest-${catalog}.json`)
  await writeFile(outPath, `${JSON.stringify(file)}\n`, 'utf8')
  console.log(`Scritto ${outPath}`)
  await rm(workDir, { recursive: true, force: true })
}

if (process.argv[1]?.includes('ingest-forest-italia')) {
  main().catch((error: unknown) => {
    console.error('Ingestione bosco fallita:', error)
    process.exit(1)
  })
}
