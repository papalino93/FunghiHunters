/**
 * Lettura dei dati nazionali: l'indice delle zone e il dettaglio di una regione.
 *
 * Stessa idea di `load.ts` — file statici prodotti una volta al giorno, letti dal filesystem in
 * fase di rendering — ma divisi in due livelli, perche' qui le zone sono molte. L'indice e'
 * leggero e basta al menu; il file di una regione ha il dettaglio completo e si legge solo quando
 * quella regione viene aperta.
 *
 * Quando un file non c'e' (catalogo non ancora generato) si restituisce vuoto invece di fallire:
 * la Toscana continua a funzionare per conto suo, e il resto d'Italia semplicemente non compare.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ItaliaIndex, ItaliaIndexEntry } from '@/../scripts/build-snapshot-italia'
import { hasValidShape } from '@/lib/snapshot/load'
import type { Snapshot } from '@/lib/snapshot/types'

const DATA_DIR = join(process.cwd(), 'public', 'data')

const EMPTY_INDEX: ItaliaIndex = {
  generatedAt: new Date(0).toISOString(),
  algorithmVersion: 'n/d',
  referenceDate: new Date(0).toISOString().slice(0, 10),
  regions: [],
  zones: [],
}

function looksLikeIndex(value: unknown): value is ItaliaIndex {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<ItaliaIndex>
  return Array.isArray(v.regions) && Array.isArray(v.zones)
}

export async function loadItaliaIndex(): Promise<ItaliaIndex> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(DATA_DIR, 'italia-index.json'), 'utf-8'))
    return looksLikeIndex(parsed) ? parsed : EMPTY_INDEX
  } catch {
    return EMPTY_INDEX
  }
}

/** `null` quando la regione non esiste o il suo file non e' stato ancora generato. */
export async function loadRegion(slug: string): Promise<Snapshot | null> {
  // Lo slug arriva dall'URL: senza questo controllo un `../` leggerebbe file fuori dalla cartella.
  if (!/^[a-z0-9-]+$/.test(slug)) return null
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(DATA_DIR, 'regioni', `${slug}.json`), 'utf-8'),
    )
    return hasValidShape(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Le zone di una regione, dall'indice leggero: per il menu, senza leggere il dettaglio. */
export function zonesOfRegion(index: ItaliaIndex, slug: string): ItaliaIndexEntry[] {
  return index.zones
    .filter((z) => z.regionSlug === slug)
    .sort((a, b) => b.mpi - a.mpi || (b.mpiRaw ?? b.mpi) - (a.mpiRaw ?? a.mpi))
}
