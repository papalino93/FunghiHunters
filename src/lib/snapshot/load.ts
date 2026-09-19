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

/**
 * Controllo strutturale minimo, non uno schema completo: basta a distinguere "questo è uno
 * snapshot" da "questo è un JSON qualunque" — un file troncato da uno scrittura interrotta, un
 * formato precedente incompatibile, o un errore umano nella pipeline di generazione. Non sostituto
 * di una validazione di dominio: quella (range dell'MPI, coerenza delle date) resta nella pipeline
 * che genera il file, non nella lettura.
 */
export function hasValidShape(value: unknown): value is Snapshot {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<Snapshot>
  return (
    typeof v.algorithmVersion === 'string' &&
    typeof v.referenceDate === 'string' &&
    typeof v.generatedAt === 'string' &&
    Array.isArray(v.zones) &&
    Array.isArray(v.sources) &&
    // `uncalibratedParams` non è decorativo: `SourceHealth` ne legge `.length` senza guardia, e
    // uno snapshot di un formato precedente che non lo avesse passava questo controllo per poi
    // far esplodere la home — esattamente il caso che questa funzione esiste per intercettare.
    Array.isArray(v.uncalibratedParams)
  )
}

export async function loadSnapshot(): Promise<Snapshot> {
  try {
    const raw = await readFile(SNAPSHOT_PATH, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!hasValidShape(parsed)) {
      // Non un crash: uno snapshot strutturalmente rotto è lo stesso caso di uno assente per chi
      // guarda l'app, e merita la stessa pagina onesta invece di una schermata di errore.
      console.error(
        'snapshot.json non ha la struttura attesa (campi mancanti o di tipo sbagliato): ' +
          'servito lo snapshot vuoto invece di rischiare dati inventati o un crash a runtime.',
      )
      return EMPTY
    }
    return parsed
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
