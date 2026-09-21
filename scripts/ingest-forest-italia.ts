/**
 * Assegna a ogni zona italiana il bosco che ha davvero, leggendolo dalla mappa europea dei generi.
 *
 *   npx tsx scripts/ingest-forest-italia.ts [--columns 4300,4400] [--radius-km 3] [--dry-run]
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

import { toLaea } from '@/lib/geo/laea'
import { composeForest, type ForestComposition } from '@/lib/sources/forest-genus'
import { USER_AGENT } from '@/lib/sources/http'

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
}

interface ZonesFile {
  readonly zones: readonly ItalianZone[]
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
    const windowWidth = right - left
    for (let row = top; row < bottom; row += 1) {
      const dy = row + 0.5 - centreRow
      for (let col = left; col < right; col += 1) {
        const dx = col + 0.5 - centreCol
        if (dx * dx + dy * dy > radiusPx * radiusPx) continue
        const value = band[(row - top) * windowWidth + (col - left)] as number
        histogram.set(value, (histogram.get(value) ?? 0) + 1)
      }
    }
    histograms.set(zone.code, histogram)
    touched += 1
  }
  await tiff.close?.()
  return touched
}

async function main(): Promise<void> {
  const radiusKm = Number(flag('radius-km') ?? DEFAULT_RADIUS_KM)
  const radiusM = radiusKm * 1000
  const dryRun = has('dry-run')
  const workDir = flag('work-dir') ?? path.join(process.cwd(), '.forest-work')
  const onlyColumns = flag('columns')
    ?.split(',')
    .map((c) => Number(c.trim()))
    .filter((c) => Number.isFinite(c))

  const zonesPath = path.join(process.cwd(), 'public/data/zones-italia.json')
  const zones = (JSON.parse(await readFile(zonesPath, 'utf-8')) as ZonesFile).zones
  const placed: PlacedZone[] = zones.map((zone) => {
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

  await mkdir(workDir, { recursive: true })
  const histograms = new Map<string, Map<number, number>>()

  for (const column of columns) {
    const name = `ulx_${column}.zip`
    const zipPath = path.join(workDir, name)
    const url = `https://zenodo.org/records/${ZENODO_RECORD}/files/${name}?download=1`
    console.log(`\n=== colonna ${column} (${byColumn.get(column)?.length ?? 0} zone candidate) ===`)
    const bytes = await download(url, zipPath)
    console.log(`  scaricati ${(bytes / 1e6).toFixed(0)} MB`)

    const members = await listTiffs(zipPath)
    console.log(`  tessere nell'archivio: ${members.length}`)

    for (const member of members) {
      const tilePath = await extract(zipPath, member, workDir)
      const touched = await sampleTile(tilePath, byColumn.get(column) ?? [], radiusM, histograms)
      if (touched > 0) console.log(`    ${path.basename(member)}: ${touched} zone campionate`)
      await rm(tilePath, { force: true })
    }
    await rm(zipPath, { force: true })
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
  const outPath = path.join(process.cwd(), 'public/data/forest-italia.json')
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
