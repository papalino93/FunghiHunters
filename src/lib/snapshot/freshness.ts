/**
 * Quanto e' vecchio uno snapshot, e da quando dirlo all'utente.
 *
 * Pura e senza orologio proprio (`nowMs` arriva da chi chiama): cosi' la soglia si verifica con un
 * test invece di aspettare un giorno e mezzo.
 */

import type { Snapshot } from '@/lib/snapshot/types'

/**
 * Oltre quante ore dal calcolo lo snapshot si dichiara vecchio.
 *
 * Non 24: il cron di GitHub Actions e' best-effort e nei fatti parte da 3 a 5,5 ore dopo l'orario
 * scritto nel workflow (la corsa delle 11:40 UTC del 23/09/2026 ha scritto alle 15:41). Le regioni
 * si ricalcolano una volta al giorno sola: una corsa puntuale seguita da una in ritardo stanno gia'
 * a ~29,5 ore l'una dall'altra, e un avviso a 24 ore si accenderebbe spesso senza che nulla sia
 * rotto — cioe' diventerebbe rumore che si impara a ignorare. 30 ore stanno appena sopra il caso peggiore normale e sotto le ~48 di un
 * giorno davvero saltato. Prima la soglia era "piu' di un giorno di calendario" dalla data di
 * riferimento, cioe' in pratica 48 ore: un giorno perso passava senza avviso.
 */
export const STALE_AFTER_HOURS = 30

const HOUR_MS = 3_600_000

/**
 * Ore trascorse dal calcolo. Si usa `generatedAt`, l'istante vero della scrittura; la sola
 * `referenceDate` e' un giorno di calendario, e fa sbagliare di un giorno intero proprio intorno
 * alla soglia. Se `generatedAt` non e' leggibile si ricade sul mezzogiorno UTC della data di
 * riferimento, come faceva il pannello prima.
 */
export function snapshotAgeHours(
  snapshot: Pick<Snapshot, 'generatedAt' | 'referenceDate'>,
  nowMs: number,
): number {
  const generated = Date.parse(snapshot.generatedAt)
  const then = Number.isNaN(generated) ? Date.parse(`${snapshot.referenceDate}T12:00:00Z`) : generated
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY
  return Math.max(0, (nowMs - then) / HOUR_MS)
}

export function isSnapshotStale(ageHours: number): boolean {
  return ageHours > STALE_AFTER_HOURS
}

/** "31 ore fa" sotto i due giorni, "3 giorni fa" oltre: "1 giorni fa" non lo dice nessuno. */
export function formatAge(ageHours: number): string {
  if (!Number.isFinite(ageHours)) return 'in data sconosciuta'
  if (ageHours < 48) return `${Math.floor(ageHours)} ore fa`
  return `${Math.floor(ageHours / 24)} giorni fa`
}

/**
 * Il giorno da chiamare «oggi» per uno snapshot: la data vera (fuso di Roma), se la serie la
 * contiene, altrimenti la data di riferimento dello snapshot.
 *
 * Uno snapshot di ieri (il calcolo nazionale non gira tutte le notti, o ha fallito) contiene già
 * la previsione per oggi. Usare la sua `referenceDate` come «oggi» etichettava ieri come oggi,
 * mostrava il giorno vero due volte nel selettore e faceva dire al verdetto «Quel giorno…» su
 * quello che per l'utente era oggi. L'età del dato la dichiara comunque «Dati e fonti».
 */
export function effectiveToday(
  snapshot: { readonly referenceDate: string; readonly zones: ReadonlyArray<{ readonly series: ReadonlyArray<{ readonly date: string }> }> },
  realToday: string,
): string {
  if (realToday <= snapshot.referenceDate) return snapshot.referenceDate
  const series = snapshot.zones[0]?.series ?? []
  return series.some((p) => p.date === realToday) ? realToday : snapshot.referenceDate
}
