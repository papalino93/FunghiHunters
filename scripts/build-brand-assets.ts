/**
 * Scrive i file statici del segno a partire da `src/lib/brand/mark.ts`.
 *
 *   public/icon.svg           — l'icona vettoriale, con gli angoli arrotondati
 *   public/icon-maskable.svg  — per i launcher Android, che ritagliano l'icona da sé
 *   src/app/favicon.ico       — quattro misure, per chi chiede `/favicon.ico` e basta
 *
 * Le icone disegnate da Next.js (`icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`) importano
 * il segno direttamente e non passano da qui. Questi tre file invece sono statici: senza uno
 * script, andrebbero riscritti a mano a ogni ritocco — ed è così che il disegno precedente era
 * finito copiato in sei posti.
 *
 * ## Il favicon
 *
 * Il pannello di Vercel, Google, i segnalibri e molte anteprime chiedono `/favicon.ico`
 * direttamente, senza leggere l'HTML. Un ICO è un'intestazione di 6 byte, una voce di 16 byte per
 * immagine e poi le immagini, che da Windows Vista in poi possono essere PNG interi: lo scriviamo
 * a mano, e `sharp` — già installato da Next.js — rasterizza il vettoriale a ogni misura. A 16
 * pixel un PNG rimpicciolito si impasta; un vettoriale rasterizzato a quella misura resta leggibile.
 *
 * Uso: `npx tsx scripts/build-brand-assets.ts` — da rilanciare solo se cambia il segno.
 */

import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'

import { MARK_VIEWBOX, markBackgroundSvg, markShapesSvg } from '../src/lib/brand/mark'

const root = join(__dirname, '..')

function svgDocument(body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" role="img" aria-label="FungiCast">` +
    body +
    `</svg>\n`
  )
}

/** L'icona normale: quadrato verde arrotondato, segno a piena misura. */
const icon = svgDocument(markBackgroundSvg('bg') + markShapesSvg('mk'))

/**
 * La versione «maskable»: fondo a tutto campo e segno rimpicciolito all'80 % attorno al centro.
 *
 * I launcher Android ritagliano l'icona con forme diverse — cerchio, goccia, quadrato arrotondato
 * — e garantiscono solo il cerchio inscritto nell'80 % centrale. Il segno scalato così ci sta
 * dentro con margine: il punto più lontano dal centro, la cima del cappello, finisce a circa 104
 * unità su un raggio sicuro di 136.
 */
const maskable = svgDocument(
  markBackgroundSvg('bg', false) +
    `<g transform="translate(170 170) scale(0.8) translate(-170 -181.5)">${markShapesSvg('mk')}</g>`,
)

const FAVICON_SIZES = [16, 32, 48, 64] as const

async function buildFavicon(svg: string): Promise<Buffer> {
  const images = await Promise.all(
    FAVICON_SIZES.map((size) =>
      // `density` alta: sharp rasterizza l'SVG a questa risoluzione prima di ridimensionare, così
      // anche le curve del cappello restano morbide alla misura più piccola.
      sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toBuffer(),
    ),
  )

  const HEADER = 6
  const ENTRY = 16
  const header = Buffer.alloc(HEADER)
  header.writeUInt16LE(0, 0) // riservato
  header.writeUInt16LE(1, 2) // tipo: 1 = icona
  header.writeUInt16LE(images.length, 4)

  let offset = HEADER + ENTRY * images.length
  const entries = images.map((png, i) => {
    const size = FAVICON_SIZES[i] ?? 0
    const entry = Buffer.alloc(ENTRY)
    entry.writeUInt8(size, 0) // larghezza (tutte sotto 256, che si scriverebbe 0)
    entry.writeUInt8(size, 1) // altezza
    entry.writeUInt8(0, 2) // colori in tavolozza: nessuna tavolozza
    entry.writeUInt8(0, 3) // riservato
    entry.writeUInt16LE(1, 4) // piani di colore
    entry.writeUInt16LE(32, 6) // bit per pixel
    entry.writeUInt32LE(png.length, 8) // dimensione dei dati
    entry.writeUInt32LE(offset, 12) // dove cominciano
    offset += png.length
    return entry
  })

  return Buffer.concat([header, ...entries, ...images])
}

async function main(): Promise<void> {
  await writeFile(join(root, 'public/icon.svg'), icon)
  await writeFile(join(root, 'public/icon-maskable.svg'), maskable)
  const favicon = await buildFavicon(icon)
  await writeFile(join(root, 'src/app/favicon.ico'), favicon)
  console.log(
    `icon.svg, icon-maskable.svg, favicon.ico (${FAVICON_SIZES.join(', ')} px, ${String(favicon.length)} byte)`,
  )
}

main().catch((error: unknown) => {
  console.error('Segno non generato:', error)
  process.exitCode = 1
})
