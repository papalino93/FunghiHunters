/**
 * Applica il bosco misurato agli snapshot di regione gia' calcolati.
 *
 *   npx tsx scripts/apply-forest-to-snapshots.ts
 *
 * **Perche' esiste, e perche' non e' un doppione di `build-snapshot-italia.ts`.** Quello e' il
 * calcolo: interroga il meteo di 1.202 localita', costa quasi 6.000 chiamate del budget
 * giornaliero e un'ora buona di attesa imposta dai limiti della fonte. Il bosco pero' **non entra
 * nel punteggio**: e' un'etichetta della zona, usata dal filtro e dai consigli su dove cercare.
 * Rifare il calcolo del meteo perche' e' cambiata un'etichetta sarebbe pagare un'ora e un budget
 * intero per un dato che quel calcolo non usa.
 *
 * Quindi: quando la copertura forestale viene rigenerata, questo passo la scrive sui file gia'
 * pronti e basta. Il prossimo calcolo giornaliero la rileggera' comunque per conto suo — le due
 * strade portano allo stesso risultato, questa ci arriva senza rifare il meteo.
 *
 * Tocca solo `forest` e `forestFraction`, e solo delle zone che compaiono nella copertura: le
 * sette zone toscane hanno codici diversi e restano intatte, con le loro etichette scritte a mano.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { Snapshot } from '@/lib/snapshot/types'
import type { ForestFile } from '@/../scripts/ingest-forest-italia'

const FOREST_FILE = 'public/data/forest-italia.json'
const REGION_DIR = 'public/data/regioni'

export interface ZoneForest {
  readonly forest: readonly string[]
  readonly forestFraction: number
}

/** Il minimo che una zona deve avere per ricevere il bosco: non serve tutto lo snapshot. */
export interface ZoneWithForest {
  readonly code: string
  readonly forest: readonly string[]
  readonly forestFraction?: number
}

/** Rimpiazza il bosco delle zone presenti nella copertura, lasciando le altre come sono. */
export function applyForest<Z extends ZoneWithForest>(
  zones: readonly Z[],
  forestByCode: ReadonlyMap<string, ZoneForest>,
): { readonly zones: Z[]; readonly updated: number } {
  let updated = 0
  const out = zones.map((zone) => {
    const measured = forestByCode.get(zone.code)
    if (measured === undefined) return zone
    updated += 1
    return { ...zone, forest: measured.forest, forestFraction: measured.forestFraction }
  })
  return { zones: out, updated }
}

async function main(): Promise<void> {
  let file: ForestFile
  try {
    file = JSON.parse(await readFile(FOREST_FILE, 'utf-8')) as ForestFile
  } catch {
    console.log(`${FOREST_FILE} non trovato: niente da applicare.`)
    return
  }

  const forestByCode = new Map<string, ZoneForest>(
    file.zones.map((zone) => [
      zone.code,
      { forest: zone.forest, forestFraction: zone.forestFraction },
    ]),
  )
  console.log(`Copertura forestale per ${forestByCode.size} zone, raggio ${file.radiusKm} km.`)

  let regions = 0
  let total = 0
  for (const name of (await readdir(REGION_DIR)).filter((n) => n.endsWith('.json')).sort()) {
    const fullPath = path.join(REGION_DIR, name)
    const parsed = JSON.parse(await readFile(fullPath, 'utf-8')) as Snapshot
    const { zones, updated } = applyForest(parsed.zones, forestByCode)
    if (updated === 0) continue
    await writeFile(fullPath, `${JSON.stringify({ ...parsed, zones })}\n`, 'utf8')
    regions += 1
    total += updated
    console.log(`  ${name}: ${updated} zone aggiornate`)
  }
  console.log(`Aggiornate ${total} zone in ${regions} file di regione.`)
}

if (process.argv[1]?.includes('apply-forest-to-snapshots')) {
  main().catch((error: unknown) => {
    console.error('Applicazione del bosco fallita:', error)
    process.exit(1)
  })
}
