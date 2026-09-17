/**
 * Lettura dello snapshot precalcolato.
 *
 * Lo snapshot e' un file statico prodotto da `scripts/build-snapshot.ts` e rigenerato una volta
 * al giorno. L'app lo legge dal filesystem in fase di rendering: nessuna chiamata di rete a ogni
 * visita, nessun database da tenere sveglio, nessun costo.
 *
 * Quando ci sara' Postgres, questa funzione diventera' una query e null'altro cambiera': il
 * formato dello snapshot e' gia' quello delle righe.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Snapshot, SnapshotZone } from '@/lib/snapshot/types'

const SNAPSHOT_PATH = join(process.cwd(), 'public', 'data', 'snapshot.json')

/** Snapshot vuoto, per non far esplodere l'app quando il file non c'e' ancora. */
const EMPTY: Snapshot = {
  generatedAt: new Date(0).toISOString(),
  algorithmVersion: 'n/d',
  referenceDate: new Date(0).toISOString().slice(0, 10),
  zones: [],
  sources: [],
  uncalibratedParams: [],
}

export async function loadSnapshot(): Promise<Snapshot> {
  try {
    const raw = await readFile(SNAPSHOT_PATH, 'utf8')
    return JSON.parse(raw) as Snapshot
  } catch {
    // Un deploy senza snapshot deve mostrare una pagina onesta, non una schermata di errore.
    return EMPTY
  }
}

export function zoneByCode(snapshot: Snapshot, code: string): SnapshotZone | undefined {
  return snapshot.zones.find((z) => z.code === code)
}

/** Le zone ordinate per punteggio decrescente in un dato giorno. */
export function rankZones(snapshot: Snapshot, date: string): SnapshotZone[] {
  return [...snapshot.zones].sort((a, b) => mpiOn(b, date) - mpiOn(a, date))
}

export function mpiOn(zone: SnapshotZone, date: string): number {
  return zone.series.find((p) => p.date === date)?.mpi ?? zone.mpi
}

export function confidenceOn(zone: SnapshotZone, date: string): number {
  return zone.series.find((p) => p.date === date)?.confidence ?? zone.confidence
}
