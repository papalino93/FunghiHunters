/**
 * Sonda la mappa europea dei generi arborei, prima di scriverci sopra del codice.
 *
 *   npx tsx scripts/probe-forest-source.ts
 *
 * **Perche' esiste.** Il tipo di bosco e' il buco piu' grosso delle zone fuori dalla Toscana: oggi
 * ognuna dichiara di non sapere che bosco ha. La fonte candidata e' la mappa dei generi arborei di
 * ForestPaths (10 m, da Sentinel, aperta su Zenodo), che secondo la descrizione distingue otto
 * classi — larice, peccio, pino, faggio, querce, altre conifere, altre latifoglie, non bosco.
 *
 * "Secondo la descrizione" non basta. L'ambiente in cui si scrive il codice non raggiunge Zenodo
 * (403 di policy), quindi il file vero non si puo' guardare da li': questo script gira dove la
 * rete c'e' e **stampa cosa contiene davvero** — licenza, elenco dei file, dimensione delle
 * tessere, sistema di coordinate, e l'istogramma di una finestra vera. Solo dopo ha senso
 * scrivere l'ingestione.
 *
 * E' una sonda, non una pipeline: non scrive niente nel repository.
 */

import { fromUrl } from 'geotiff'

import { toLaea } from '@/lib/geo/laea'
import { USER_AGENT } from '@/lib/sources/http'

const ZENODO_RECORD = '13341104'
const ZENODO_API = `https://zenodo.org/api/records/${ZENODO_RECORD}`

/** Un punto in mezzo alle faggete del Casentino: se la mappa funziona, qui deve dire faggio. */
const CASENTINO = { lon: 11.7, lat: 43.75 }

interface ZenodoFile {
  readonly key: string
  readonly size: number
  readonly links?: { readonly self?: string }
}

interface ZenodoRecord {
  readonly title?: string
  readonly doi?: string
  readonly metadata?: { readonly license?: unknown; readonly description?: string }
  readonly files?: readonly ZenodoFile[]
}

async function main(): Promise<void> {
  console.log(`Leggo il record Zenodo ${ZENODO_RECORD}…`)
  const response = await fetch(ZENODO_API, { headers: { 'user-agent': USER_AGENT } })
  if (!response.ok) {
    console.error(`Zenodo ha risposto ${response.status}: non posso continuare.`)
    process.exitCode = 1
    return
  }
  const record = (await response.json()) as ZenodoRecord

  console.log(`Titolo: ${record.title ?? 'n/d'}`)
  console.log(`DOI: ${record.doi ?? 'n/d'}`)
  console.log(`Licenza: ${JSON.stringify(record.metadata?.license ?? 'n/d')}`)

  const description = (record.metadata?.description ?? '').replace(/<[^>]+>/g, ' ')
  console.log('--- descrizione (primi 3000 caratteri) ---')
  console.log(description.slice(0, 3000))

  const files = [...(record.files ?? [])].sort((a, b) => a.size - b.size)
  console.log(`--- ${files.length} file ---`)
  for (const file of files) {
    console.log(`  ${file.key}  ${(file.size / 1e6).toFixed(1)} MB`)
  }

  // Un file piccolo e non-raster e' spesso la legenda: e' li' che stanno i codici delle classi.
  for (const file of files) {
    if (/\.(txt|md|json|qml|clr|csv|xml)$/i.test(file.key) && file.size < 2e6) {
      const url = file.links?.self ?? `https://zenodo.org/records/${ZENODO_RECORD}/files/${file.key}`
      const text = await (await fetch(url)).text()
      console.log(`--- contenuto di ${file.key} (primi 4000 caratteri) ---`)
      console.log(text.slice(0, 4000))
    }
  }

  const raster = files.find((f) => /\.tif{1,2}$/i.test(f.key))
  if (raster === undefined) {
    console.log('Nessun GeoTIFF nel record: da qui non si va avanti senza guardare la descrizione.')
    return
  }

  const url = raster.links?.self ?? `https://zenodo.org/records/${ZENODO_RECORD}/files/${raster.key}`
  console.log(`--- apro ${raster.key} via richieste parziali ---`)
  const tiff = await fromUrl(url)
  const count = await tiff.getImageCount()
  console.log(`immagini nel file (livelli piramide compresi): ${count}`)

  const image = await tiff.getImage()
  console.log(`dimensioni: ${image.getWidth()} x ${image.getHeight()} px`)
  console.log(`tessera: ${image.getTileWidth()} x ${image.getTileHeight()} px`)
  console.log(`campioni per pixel: ${image.getSamplesPerPixel()}`)
  console.log(`risoluzione: ${JSON.stringify(image.getResolution())}`)
  console.log(`origine: ${JSON.stringify(image.getOrigin())}`)
  console.log(`bbox: ${JSON.stringify(image.getBoundingBox())}`)
  console.log(`geokeys: ${JSON.stringify(image.getGeoKeys())}`)

  // Finestra piccola al centro dell'immagine: serve solo a vedere che valori escono davvero.
  const cx = Math.floor(image.getWidth() / 2)
  const cy = Math.floor(image.getHeight() / 2)
  const window = [cx, cy, cx + 50, cy + 50] as [number, number, number, number]
  const data = (await image.readRasters({ window })) as unknown as Array<ArrayLike<number>>
  const band = data[0]
  if (band !== undefined) {
    const histogram = new Map<number, number>()
    for (let i = 0; i < band.length; i += 1) {
      const value = band[i] as number
      histogram.set(value, (histogram.get(value) ?? 0) + 1)
    }
    console.log(
      `istogramma di una finestra 50x50 al centro: ${JSON.stringify([...histogram.entries()])}`,
    )
  }

  const casentino = toLaea(CASENTINO.lon, CASENTINO.lat)
  console.log(
    `Controllo di proiezione: Casentino (${CASENTINO.lon}, ${CASENTINO.lat}) → ` +
      `EPSG:3035 x=${Math.round(casentino.x)} y=${Math.round(casentino.y)}`,
  )
}

if (process.argv[1]?.includes('probe-forest-source')) {
  main().catch((error: unknown) => {
    console.error('Sonda fallita:', error)
    process.exitCode = 1
  })
}
