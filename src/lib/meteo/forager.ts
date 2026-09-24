/**
 * Il meteo di un luogo letto come lo legge chi cerca porcini: quanto ha piovuto, quando, e quanto
 * pioverà.
 *
 * La tabella giorno per giorno ha già tutti i numeri, ma la domanda di chi apre questa pagina è
 * un'altra: «da quanto non piove sul serio?». Rispondere richiedeva di scorrere i giorni passati e
 * sommare a mente. Qui la risposta è calcolata una volta, in modo puro e testabile.
 *
 * **Nessuna soglia nuova.** Cosa conta come «pioggia» è deciso da `detectRainEvents`, la stessa
 * funzione che il modello usa per le zone (evento di almeno 5 mm, giorno bagnato da 0,5 mm): la
 * pagina Meteo non deve raccontare una regola diversa da quella del punteggio.
 */

import { detectRainEvents, type DailyWeather } from '@/lib/model/features'
import type { PlaceDailyWeather } from '@/lib/sources/open-meteo-place'

export interface ForagerRainSummary {
  /** Pioggia degli ultimi 7 giorni, oggi compreso. `null` se mancano i dati. */
  readonly past7Mm: number | null
  /** Pioggia su tutti i giorni passati disponibili, oggi compreso. */
  readonly pastMm: number | null
  /** Quanti giorni copre `pastMm`: dipende da quanti ne restituisce Open-Meteo. */
  readonly pastDays: number
  /** L'ultimo evento di pioggia vero (non una spruzzata), o `null` se nel periodo non ce n'è. */
  readonly lastEvent: {
    readonly endDate: string
    readonly totalMm: number
    readonly durationDays: number
    readonly daysAgo: number
  } | null
  /** Pioggia prevista nei prossimi 7 giorni, oggi escluso. */
  readonly next7Mm: number | null
}

function sum(days: readonly PlaceDailyWeather[]): number | null {
  if (days.length === 0) return null
  if (days.some((d) => d.precipitationMm === null)) return null
  return days.reduce((acc, d) => acc + (d.precipitationMm ?? 0), 0)
}

export function foragerRainSummary(
  daily: readonly PlaceDailyWeather[],
  todayIso: string,
): ForagerRainSummary {
  const past = daily.filter((d) => d.date <= todayIso)
  const future = daily.filter((d) => d.date > todayIso).slice(0, 7)

  const asWeather: DailyWeather[] = past.map((d) => ({
    date: d.date,
    precipitationMm: d.precipitationMm,
    temperatureMaxC: d.temperatureMaxC,
    temperatureMinC: d.temperatureMinC,
    et0Mm: d.et0Mm,
    soilMoisture: d.soilMoistureMean,
    soilTemperatureC: d.soilTemperatureMeanC,
    vpdKpa: d.vpdMeanKpa,
    windMs: null,
    relativeHumidityPercent: d.humidityMeanPercent,
    provenance: 'MODELLED',
  }))
  const events = detectRainEvents(asWeather, todayIso)
  const last = events[events.length - 1]

  return {
    past7Mm: sum(past.slice(-7)),
    pastMm: sum(past),
    pastDays: past.length,
    lastEvent:
      last === undefined
        ? null
        : {
            endDate: last.endDate,
            totalMm: last.totalMm,
            durationDays: last.durationDays,
            daysAgo: last.daysSinceEnd,
          },
    next7Mm: sum(future),
  }
}

/** «oggi», «ieri», «13 giorni fa». */
export function daysAgoLabel(days: number): string {
  if (days <= 0) return 'oggi'
  if (days === 1) return 'ieri'
  return `${days} giorni fa`
}
