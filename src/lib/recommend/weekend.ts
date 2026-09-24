/**
 * Il bollettino del fine settimana: per sabato e domenica, le zone migliori della regione.
 *
 * È la domanda di chi lavora in settimana — «vale la pena sabato?» — e il riquadro «Dove vado»
 * risponde per un giorno alla volta. Qui i due giorni del fine settimana insieme, calcolati dagli
 * stessi punteggi della serie di ogni zona: nessun testo scritto a mano, nessuna segnalazione.
 * Pura, per i test.
 */

import type { SnapshotZone } from '@/lib/snapshot/types'
import { mpiOn } from '@/lib/recommend/rank'

export interface WeekendDay {
  readonly date: string
  /** Le zone migliori quel giorno, dalla più alta. */
  readonly best: ReadonlyArray<{ readonly zone: SnapshotZone; readonly mpi: number }>
}

/** Giorno della settimana di una data ISO (0 = domenica), senza passare dal fuso del browser. */
function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}

/**
 * Il prossimo sabato e la prossima domenica (oggi compreso) fra i giorni disponibili. Se oggi è
 * domenica il fine settimana è solo oggi; se la serie non arriva a sabato, resta quello che c'è.
 */
export function weekendDates(dates: readonly string[], today: string): string[] {
  const ahead = dates.filter((d) => d >= today)
  const saturday = ahead.find((d) => weekday(d) === 6)
  const sunday = ahead.find((d) => weekday(d) === 0 && (saturday === undefined || d > saturday))
  const todayIsSunday = weekday(today) === 0 && ahead.includes(today)
  if (todayIsSunday) return [today]
  return [saturday, sunday].filter((d): d is string => d !== undefined)
}

export function weekendOutlook(
  zones: readonly SnapshotZone[],
  dates: readonly string[],
  today: string,
  perDay = 3,
): WeekendDay[] {
  return weekendDates(dates, today).map((date) => ({
    date,
    best: [...zones]
      .map((zone) => ({ zone, mpi: mpiOn(zone, date) }))
      .sort((a, b) => b.mpi - a.mpi)
      .slice(0, perDay),
  }))
}
