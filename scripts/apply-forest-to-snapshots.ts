/**
 * Applica il bosco misurato agli snapshot di regione gia' calcolati.
 *
 *   npx tsx scripts/apply-forest-to-snapshots.ts
 *
 * **Perche' esiste, e perche' non e' un doppione di `build-snapshot-italia.ts`.** Quello e' il
 * calcolo: interroga il meteo di 1.202 localita', costa quasi 6.000 chiamate del budget
 * giornaliero e un'ora buona di attesa imposta dai limiti della fonte. Questo scrive il bosco sui
 * file gia' pronti, senza rifare niente.
 *
 * **Attenzione, dal modello 1.4.0.** Fino alla 1.3.0 il bosco era solo un'etichetta e questo
 * passo bastava. Ora il bosco **entra nel punteggio** (vedi `src/lib/model/forest.ts`), quindi
 * dopo questo aggiornamento l'etichetta e' quella nuova e il punteggio e' ancora quello vecchio.
 * Non e' un'incoerenza che si puo' lasciare a lungo: serve comunque un ricalcolo, e questo passo
 * e' solo il rattoppo che tiene le etichette giuste nel frattempo. Quando il bosco cambia
 * davvero, si lancia lo snapshot.
 *
 * Tocca solo `forest` e `forestFraction`, e solo delle zone che compaiono nei file di regione: le
 * sette zone toscane stanno in un altro file e restano intatte, con le loro etichette scritte a
 * mano — che dicono "abetina" e "castagneto", cose che la mappa dei generi non sa nominare.
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
