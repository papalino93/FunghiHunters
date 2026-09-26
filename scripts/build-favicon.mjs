/**
 * Genera `src/app/favicon.ico` da `public/icon.svg`.
 *
 * ## Perché esiste un `.ico` accanto a `icon.tsx`
 *
 * `icon.tsx` serve l'icona su `/icon` e la annuncia con un `<link rel="icon">` nell'HTML. Basta ai
 * browser moderni, ma non a tutto il resto: il pannello di Vercel, i risultati di Google, i
 * segnalibri, le anteprime di Slack e di molti altri chiedono **`/favicon.ico`** direttamente, per
 * convenzione, senza leggere la pagina. Senza questo file quella richiesta rispondeva 404, e il
 * progetto su Vercel mostrava l'icona generica invece del porcino.
 *
 * ## Perché dall'SVG e non dal PNG da 512
 *
 * Rimpicciolire un PNG a 16 pixel lo impasta; rasterizzare il vettoriale a 16 pixel dà un'immagine
 * disegnata per quella misura. Le quattro misure sono quelle che i consumatori reali chiedono:
 * 16 e 32 per le schede del browser, 48 per Windows, 64 per gli schermi ad alta densità e per il
 * riquadro del progetto su Vercel.
 *
 * ## Il formato
 *
 * Un ICO è un'intestazione di 6 byte, una voce di 16 byte per immagine, e poi le immagini. Da
 * Windows Vista in poi ogni immagine può essere un PNG intero, ed è così che lo scriviamo qui:
 * niente dipendenze per il formato, solo `sharp` per rasterizzare — che Next.js installa già.
 *
 * Uso: `node scripts/build-favicon.mjs` (da rilanciare solo se cambia `public/icon.svg`).
 */

import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const SIZES = [16, 32, 48, 64]
const SOURCE = new URL('../public/icon.svg', import.meta.url)
const TARGET = new URL('../src/app/favicon.ico', import.meta.url)

const svg = await readFile(SOURCE)

// `density` alta: sharp rasterizza l'SVG a questa risoluzione prima di ridimensionare, così anche
// le curve del cappello restano morbide alla misura più piccola.
const images = await Promise.all(
  SIZES.map((size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()),
)

const HEADER = 6
const ENTRY = 16
const header = Buffer.alloc(HEADER)
header.writeUInt16LE(0, 0) // riservato
header.writeUInt16LE(1, 2) // tipo: 1 = icona
header.writeUInt16LE(images.length, 4)

let offset = HEADER + ENTRY * images.length
const entries = images.map((png, i) => {
  const size = SIZES[i]
  const entry = Buffer.alloc(ENTRY)
  // 256 si scrive 0: il campo è un byte. Nessuna delle nostre misure lo raggiunge.
  entry.writeUInt8(size >= 256 ? 0 : size, 0) // larghezza
  entry.writeUInt8(size >= 256 ? 0 : size, 1) // altezza
  entry.writeUInt8(0, 2) // colori in tavolozza: 0 = nessuna tavolozza
  entry.writeUInt8(0, 3) // riservato
  entry.writeUInt16LE(1, 4) // piani di colore
  entry.writeUInt16LE(32, 6) // bit per pixel
  entry.writeUInt32LE(png.length, 8) // dimensione dei dati
  entry.writeUInt32LE(offset, 12) // dove cominciano
  offset += png.length
  return entry
})

await writeFile(TARGET, Buffer.concat([header, ...entries, ...images]))
console.log(`favicon.ico: ${SIZES.join(', ')} px, ${offset} byte`)
