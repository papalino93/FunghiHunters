/**
 * Come si legge il punteggio attuale di una zona seguita.
 *
 * Una zona seguita non porta con sé nessun numero: solo l'identità (vedi il commento in
 * `types.ts`). Il potenziale, l'etichetta e l'affidabilità si leggono sempre dal vivo, da una di
 * due fonti, mai da un valore congelato al momento del "segui":
 *
 * 1. Lo snapshot già caricato per la regione di riferimento (il caso comune: segui zone della tua
 *    regione). Qui c'è il dettaglio completo, inclusa `dataQuality` — la qualità dei dati distinta
 *    dall'affidabilità complessiva, la distinzione che B2 in `docs/AUDIT.md` ha introdotto apposta.
 * 2. L'indice nazionale leggero (`italia-index.json`), quando segui una zona di un'altra regione.
 *    Quell'indice porta solo `confidence` (la stima complessiva), non `dataQuality`: sono due
 *    numeri diversi, e non vanno mai fatti passare per lo stesso. Il chiamante lo sa dal campo
 *    `reliability.kind` e li presenta con parole diverse.
 *
 * Se nessuna delle due fonti ha la zona (successo raro: una delle sette zone di taratura toscane,
 * seguita mentre la regione di riferimento non è più la Toscana — quelle sette non sono
 * nell'indice nazionale, vedi `docs/DECISIONS.md`), la funzione torna `null`: l'interfaccia mostra
 * "dati non disponibili qui", mai un numero vecchio spacciato per quello di oggi.
 */

import type { ItaliaIndexEntry } from '@/../scripts/build-snapshot-italia'
import type { SnapshotZone } from '@/lib/snapshot/types'

export type ZoneReliability =
  | { readonly kind: 'quality'; readonly dataQuality: number }
  | { readonly kind: 'confidence'; readonly confidence: number }

export interface ResolvedZoneData {
  readonly mpi: number
  readonly label: string
  readonly referenceDate: string
  readonly reliability: ZoneReliability
}

export interface SnapshotSource {
  readonly zones: readonly Pick<SnapshotZone, 'code' | 'mpi' | 'label' | 'dataQuality'>[]
  readonly referenceDate: string
}

export interface IndexSource {
  readonly zones: readonly Pick<ItaliaIndexEntry, 'code' | 'mpi' | 'label' | 'confidence'>[]
  readonly referenceDate: string
}

export function resolveFollowedZone(
  zoneCode: string,
  snapshot: SnapshotSource,
  index: IndexSource | null,
): ResolvedZoneData | null {
  const inSnapshot = snapshot.zones.find((z) => z.code === zoneCode)
  if (inSnapshot !== undefined) {
    return {
      mpi: inSnapshot.mpi,
      label: inSnapshot.label,
      referenceDate: snapshot.referenceDate,
      reliability: { kind: 'quality', dataQuality: inSnapshot.dataQuality },
    }
  }

  const inIndex = index?.zones.find((z) => z.code === zoneCode)
  if (inIndex !== undefined && index !== null) {
    return {
      mpi: inIndex.mpi,
      label: inIndex.label,
      referenceDate: index.referenceDate,
      reliability: { kind: 'confidence', confidence: inIndex.confidence },
    }
  }

  return null
}
