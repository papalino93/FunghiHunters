/**
 * Statistiche del pannello amministratore.
 *
 * Funzioni pure su righe gia' lette: nessuna rete, nessun Supabase, nessun `process.env`. E' cio'
 * che le rende verificabili con dei test invece che "sembrano giuste guardando la pagina" - e
 * queste sono proprio le cifre su cui poi si decide se il modello vale qualcosa, quindi sbagliarle
 * in silenzio sarebbe peggio che non averle.
 *
 * Il modulo non conosce le note ne' l'identita' di nessuno: prende i campi che gli servono e
 * basta. Chi vuole leggere le uscite una per una lo fa dalla tabella, non da qui.
 */

import { ABUNDANCE_RANK, type Abundance } from '@/lib/diary/types'
import { BANDS } from '@/lib/recommend/verdict'

/** Una riga di `user_observations`, ridotta a cio' che serve alle statistiche. */
export interface StatRow {
  readonly userId: string
  readonly date: string
  readonly zoneCode: string
  readonly abundance: Abundance
  readonly mpiAtEntry: number | null
}

export interface BandStat {
  readonly label: string
  readonly from: number
  readonly to: number
  /** Uscite registrate con un punteggio in questa fascia. */
  readonly outings: number
  /** Di quelle, quante hanno trovato almeno qualcosa. */
  readonly withFinds: number
  /** `null` quando la fascia e' vuota: zero uscite non fanno «0%», fanno «non lo so». */
  readonly hitRate: number | null
}

export interface AdminStats {
  readonly totalOutings: number
  readonly distinctUsers: number
  readonly distinctZones: number
  readonly withScore: number
  readonly firstDate: string | null
  readonly lastDate: string | null
  readonly bands: readonly BandStat[]
  /** Le zone piu' battute, dalla piu' frequentata. */
  readonly topZones: ReadonlyArray<{ zoneCode: string; outings: number; withFinds: number }>
  /** Uscite per mese (`YYYY-MM`), dal mese piu' vecchio. */
  readonly byMonth: ReadonlyArray<{ month: string; outings: number }>
}

function isSuccess(row: StatRow): boolean {
  return (ABUNDANCE_RANK[row.abundance] ?? 0) > 0
}

/**
 * Tasso di ritrovamento per fascia di punteggio previsto.
 *
 * E' la sola cifra che dice se il modello ordina qualcosa: se scendendo di fascia la percentuale
 * non cala, il punteggio non sta separando le giornate buone da quelle scarse, per quanto le
 * medie generali possano sembrare lusinghiere.
 */
export function bandStats(rows: readonly StatRow[]): BandStat[] {
  let from = 0
  return BANDS.map((band) => {
    const lower = from
    from = band.upTo
    const inBand = rows.filter(
      (r) => r.mpiAtEntry !== null && r.mpiAtEntry >= lower && (r.mpiAtEntry < band.upTo || band.upTo === 100),
    )
    const withFinds = inBand.filter(isSuccess).length
    return {
      label: band.name,
      from: lower,
      to: band.upTo,
      outings: inBand.length,
      withFinds,
      hitRate: inBand.length === 0 ? null : withFinds / inBand.length,
    }
  })
}

export function computeStats(rows: readonly StatRow[]): AdminStats {
  const dates = rows.map((r) => r.date).filter((d) => d !== '').sort()

  const byZone = new Map<string, { outings: number; withFinds: number }>()
  for (const row of rows) {
    const current = byZone.get(row.zoneCode) ?? { outings: 0, withFinds: 0 }
    byZone.set(row.zoneCode, {
      outings: current.outings + 1,
      withFinds: current.withFinds + (isSuccess(row) ? 1 : 0),
    })
  }

  const months = new Map<string, number>()
  for (const row of rows) {
    // `slice(0, 7)` su una data ISO da' `YYYY-MM`. Le righe con data vuota non finiscono in un
    // mese inventato: restano fuori, e il totale generale le conta comunque.
    if (row.date.length < 7) continue
    const month = row.date.slice(0, 7)
    months.set(month, (months.get(month) ?? 0) + 1)
  }

  return {
    totalOutings: rows.length,
    distinctUsers: new Set(rows.map((r) => r.userId)).size,
    distinctZones: byZone.size,
    withScore: rows.filter((r) => r.mpiAtEntry !== null).length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    bands: bandStats(rows),
    topZones: [...byZone.entries()]
      .map(([zoneCode, v]) => ({ zoneCode, ...v }))
      .sort((a, b) => b.outings - a.outings || a.zoneCode.localeCompare(b.zoneCode))
      .slice(0, 15),
    byMonth: [...months.entries()]
      .map(([month, outings]) => ({ month, outings }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  }
}

/**
 * CSV per le statistiche che ti costruisci da te, in Excel o dove vuoi.
 *
 * Separatore `,` e virgolette raddoppiate secondo RFC 4180: le note sono testo libero, e una
 * virgola o un a capo dentro una nota spaccherebbe la riga in due colonne se non fossero
 * protette. Con il BOM davanti, Excel in italiano apre il file in UTF-8 invece di mostrare
 * «perchÃ©» - chi lo riceve non deve fare un rito d'importazione per leggere gli accenti.
 */
export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const cell = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    const text = String(value)
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))]
  return `﻿${lines.join('\r\n')}`
}
