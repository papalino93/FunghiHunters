/**
 * Tempo, fusi e semantica delle finestre giornaliere.
 *
 * Tre fatti verificati sul campo il 2026-09-17 che questo modulo codifica:
 *
 * 1. Il GeoServer SIR espone `dataora` in **UTC**, mentre `dati.php` la espone in **ora locale**.
 *    Lo stesso dato appare come `2026-09-16T07:00:00Z` nel primo e `2026-09-16 09:00:00` nel
 *    secondo. D'inverno lo stesso istante locale e' `08:00Z`: l'offset non e' una costante.
 *
 * 2. Per la finestra `9_9` l'etichetta e' la **fine** della finestra (le 9:00 locali del giorno t).
 *    Per la finestra `0_24` e' l'**inizio** (mezzanotte locale del giorno t). In entrambi i casi
 *    la data locale dell'etichetta coincide con il giorno da attribuire, ed e' questo che rende
 *    corretta un'unica regola di conversione.
 *
 * 3. Open-Meteo aggrega 0-24 sul fuso richiesto. Chiedendo `timezone=Europe/Rome` i suoi giorni
 *    e quelli della serie SIR `pluvio0_24` sono lo stesso giorno, senza correzioni.
 */

import type { AggregationWindow } from './types'

/** Fuso di riferimento per tutto il progetto. */
export const PROJECT_TIMEZONE = 'Europe/Rome'

const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: PROJECT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const LOCAL_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: PROJECT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** `true` se la stringa e' una data locale ben formata. */
export function isLocalDate(value: string): boolean {
  return ISO_DATE_RE.test(value)
}

function assertLocalDate(value: string): void {
  if (!isLocalDate(value)) {
    throw new Error(`Data locale non valida: "${value}" (atteso YYYY-MM-DD)`)
  }
}

/**
 * Data locale (`YYYY-MM-DD`, fuso del progetto) di un istante UTC.
 *
 * E' la funzione che traduce la `dataora` del GeoServer nel giorno da attribuire. Un
 * `2026-09-15T22:00:00Z` diventa `2026-09-16`, perche' in ora legale italiana sono gia' le
 * 00:00 del giorno dopo.
 */
export function toLocalDate(instant: Date | string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Istante non valido: ${String(instant)}`)
  }
  return LOCAL_DATE_FORMATTER.format(date)
}

/** Ora locale (0-23) di un istante UTC, nel fuso del progetto. */
export function localHour(instant: Date | string): number {
  const date = typeof instant === 'string' ? new Date(instant) : instant
  const hourPart = LOCAL_PARTS_FORMATTER.formatToParts(date).find((p) => p.type === 'hour')
  if (hourPart === undefined) {
    throw new Error(`Impossibile estrarre l'ora da ${String(instant)}`)
  }
  // Intl con hour12:false puo' restituire "24" per la mezzanotte in alcune versioni di ICU.
  return Number(hourPart.value) % 24
}

/** Offset del fuso del progetto rispetto a UTC, in minuti, per un dato istante. */
export function localOffsetMinutes(instant: Date | string): number {
  const date = typeof instant === 'string' ? new Date(instant) : instant
  const parts = LOCAL_PARTS_FORMATTER.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type)
    if (found === undefined) throw new Error(`Parte di data mancante: ${type}`)
    return Number(found.value)
  }
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
  return Math.round((asUtc - date.getTime()) / 60_000)
}

/**
 * L'istante UTC che corrisponde a una data e ora locali.
 * Risolve l'offset in modo iterativo, quindi e' corretto anche a cavallo del cambio d'ora.
 */
export function localToInstant(localDate: string, hour = 0, minute = 0): Date {
  assertLocalDate(localDate)
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number]
  // Prima stima: tratta i campi come se fossero UTC, poi correggi con l'offset che ne risulta.
  let guess = new Date(Date.UTC(y, m - 1, d, hour, minute))
  for (let i = 0; i < 3; i += 1) {
    const offset = localOffsetMinutes(guess)
    const corrected = new Date(Date.UTC(y, m - 1, d, hour, minute) - offset * 60_000)
    if (corrected.getTime() === guess.getTime()) break
    guess = corrected
  }
  return guess
}

/** Somma (o sottrae) giorni a una data locale, restando su date locali. */
export function addDays(localDate: string, days: number): string {
  assertLocalDate(localDate)
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number]
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return shifted.toISOString().slice(0, 10)
}

/** Numero di giorni fra due date locali (`to - from`). */
export function daysBetween(from: string, to: string): number {
  assertLocalDate(from)
  assertLocalDate(to)
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** Tutte le date locali da `start` a `end`, estremi inclusi. */
export function eachDay(start: string, end: string): string[] {
  const n = daysBetween(start, end)
  if (n < 0) return []
  const out: string[] = []
  for (let i = 0; i <= n; i += 1) out.push(addDays(start, i))
  return out
}

/**
 * Intervallo fisico coperto da (data, finestra), come istanti UTC.
 *
 * Serve ai test e al confronto fra fonti: e' l'unico posto dove la differenza fra `0_24` e `9_9`
 * e' scritta come intervallo e non come convenzione implicita.
 */
export function windowInterval(
  localDate: string,
  window: AggregationWindow,
): { start: Date; end: Date } {
  assertLocalDate(localDate)
  switch (window) {
    case '0_24':
      return { start: localToInstant(localDate, 0), end: localToInstant(addDays(localDate, 1), 0) }
    case '9_9':
      return { start: localToInstant(addDays(localDate, -1), 9), end: localToInstant(localDate, 9) }
    case 'instant':
      return { start: localToInstant(localDate, 12), end: localToInstant(localDate, 12) }
  }
}

/**
 * Giorno da attribuire a un'etichetta temporale del GeoServer SIR.
 *
 * Vale per entrambe le finestre proprio perche' l'etichetta cade dentro il giorno locale giusto
 * in tutti e due i casi (mezzanotte per `0_24`, le 9:00 per `9_9`).
 */
export function attributedDateFromLabel(instant: Date | string): string {
  return toLocalDate(instant)
}

/** Oggi nel fuso del progetto. */
export function today(now: Date = new Date()): string {
  return toLocalDate(now)
}
