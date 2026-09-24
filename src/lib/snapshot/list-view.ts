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

import type { Snapshot, SnapshotSeriesPoint, SnapshotZone } from '@/lib/snapshot/types'

/** Un decimale basta a ogni numero che queste pagine mostrano o confrontano. */
function r1(value: number): number {
  return Math.round(value * 10) / 10
}

/*
 * La serie resta intera nei giorni (serve al selettore del giorno, al «meglio sabato», al calo
 * annunciato e alla pioggia forte di N giorni fa), ma perde i campi che nessuna pagina a elenco
 * legge — temperature e vento del giorno, che servono solo alla scheda della mappa — e i decimali
 * in eccesso (`windMs: 8.777777777777779`). Il 24/09/2026 la serie era il campo più pesante: 4,7 KB
 * per zona, 900 KB sulle 190 zone del Piemonte. Campi letti qui, verificato: `date`, `mpi`,
 * `mpiRaw`, `confidence`, `rainMm` (rank, verdict, EntryForm, TodayScreen, Sparkline).
 */
function toListPoint(point: SnapshotSeriesPoint): SnapshotSeriesPoint {
  return {
    date: point.date,
    mpi: r1(point.mpi),
    ...(point.mpiRaw === undefined ? {} : { mpiRaw: r1(point.mpiRaw) }),
    confidence: r1(point.confidence),
    dataQuality: r1(point.dataQuality),
    forecastCertainty: Math.round(point.forecastCertainty),
    provenance: point.provenance,
    rainMm: point.rainMm === null ? null : r1(point.rainMm),
    tMinC: null,
    tMaxC: null,
    windMs: null,
  }
}

function toListZone(zone: SnapshotZone): SnapshotZone {
  return {
    ...zone,
    series: zone.series.map(toListPoint),
    /*
     * I fattori negativi servono al verdetto solo per chiave, etichetta e contributo (la clausola
     * «Pesa anche…», `secondaryLimitClause`). La citazione completa della fonte e il vecchio testo
     * lungo della cautela, ripetuti in ogni zona, erano il grosso della pagina: il 24/09/2026 circa
     * 1,2 MB sugli 1,6 della pagina del Piemonte. Il dettaglio resta nella scheda della mappa.
     */
    negativeFactors: zone.negativeFactors.map((f) => ({
      key: f.key,
      label: f.label,
      contribution: r1(f.contribution),
      value: '',
      provenance: f.provenance,
    })),
    positiveFactors: [],
    neutralFactors: [],
    bestWindow: null,
    nearbyMunicipalities: [],
    // Le note sulle stazioni le mostra solo la scheda «Dati» della mappa.
    stationNotes: '',
  }
}

export function toListSnapshot(snapshot: Snapshot): Snapshot {
  return { ...snapshot, zones: snapshot.zones.map(toListZone) }
}
