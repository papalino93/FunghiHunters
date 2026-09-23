/**
 * La versione "da elenco" dello snapshot: stessa forma, meno peso.
 *
 * `TodayScreen` (home, diario, `/italia/[regione]`) non apre mai il dettaglio di una zona — la
 * scheda compatta manda a `/mappa` per quello (`SuggestionCard.mapHref`). Eppure il server le
 * passa oggi lo `Snapshot` intero, dettaglio compreso: `positiveFactors`, `neutralFactors`,
 * `bestWindow` e `nearbyMunicipalities` viaggiano fino al browser senza che nessun componente di
 * quelle pagine li legga (verificato: nessun riferimento fuori da `ZoneSheet.tsx` e dallo script
 * che genera lo snapshot). Per il Piemonte, la regione più grande, sono il 30% del payload
 * (misurato il 22/09/2026: 672 KB su 2,2 MB).
 *
 * Questa funzione sostituisce quei campi con l'equivalente vuoto già previsto dal tipo — non un
 * numero inventato, lo stesso valore che lo snapshot usa quando quel dato non è mai stato
 * generato (vedi i commenti su `nearbyMunicipalities` e `bestWindow` in `snapshot/types.ts`).
 * `/mappa` continua a leggere `loadRegion`/`loadSnapshot` per conto proprio, invariato: questa
 * funzione tocca solo cosa arriva alle pagine che non aprono mai una scheda di dettaglio.
 */

import type { Snapshot, SnapshotZone } from '@/lib/snapshot/types'

function toListZone(zone: SnapshotZone): SnapshotZone {
  return {
    ...zone,
    positiveFactors: [],
    neutralFactors: [],
    bestWindow: null,
    nearbyMunicipalities: [],
  }
}

export function toListSnapshot(snapshot: Snapshot): Snapshot {
  return { ...snapshot, zones: snapshot.zones.map(toListZone) }
}
