/**
 * Copia il worker di MapLibre fra gli asset statici.
 *
 * MapLibre crea il proprio worker come modulo ES risolto a runtime. Sotto Turbopack quella
 * risoluzione finisce su un URL che risponde con la pagina HTML di errore, e il browser lo
 * rifiuta: "Failed to load module script: non-JavaScript MIME type". Il risultato e' una mappa
 * che si costruisce senza errori evidenti ma resta nera, perche' senza worker non elabora le
 * tile.
 *
 * La soluzione e' esplicita invece che magica: i due file del worker vengono serviti da
 * `public/maplibre/` e l'URL viene passato a `setWorkerUrl`. Si copiano a ogni `dev` e `build`,
 * cosi' non possono restare indietro rispetto alla versione installata, e non si committano.
 */

import { copyFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const packageJson = require.resolve('maplibre-gl/package.json')
const distDir = join(dirname(packageJson), 'dist')
const targetDir = join(process.cwd(), 'public', 'maplibre')

// Il worker importa il modulo condiviso con un percorso relativo: vanno entrambi, affiancati.
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

await mkdir(targetDir, { recursive: true })
for (const file of FILES) {
  await copyFile(join(distDir, file), join(targetDir, file))
}

console.log(`maplibre: copiati ${FILES.length} file in public/maplibre/`)
