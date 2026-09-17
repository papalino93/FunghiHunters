/**
 * La finestra potenziale, in linguaggio naturale.
 *
 * Il massimo potenziale non coincide col giorno della pioggia: il processo modellato ha una
 * latenza di settimane, e la finestra migliore va comunicata, non lasciata dedurre da un grafico.
 *
 * La frase si compone da quattro fatti misurati — dove cade il massimo, quanto e' larga la
 * finestra, quanto vale il massimo, qual e' il fattore che lo limita — e non da un template
 * scelto a caso. Cambiando i numeri cambia la frase, e due situazioni diverse non producono mai
 * la stessa.
 *
 * Vincolo semantico: si parla sempre di **condizioni**, mai di presenza di funghi.
 */

import { daysBetween } from '@/lib/domain/time'
import { mpiQualifier } from '@/lib/model/mpi'

export interface ForecastPoint {
  readonly date: string
  readonly mpi: number
  readonly confidence: number
}

export interface PotentialWindow {
  /** Giorno del massimo nell'orizzonte considerato. */
  readonly peakDate: string
  readonly peakMpi: number
  /** Estremi della finestra in cui il potenziale resta sopra meta' del massimo. */
  readonly start: string
  readonly end: string
  /** Variazione fra la media dei prossimi giorni e quella dei precedenti. */
  readonly trend: number
  readonly narrative: string
}

const DAY_NAMES = [
  'domenica',
  'lunedì',
  'martedì',
  'mercoledì',
  'giovedì',
  'venerdì',
  'sabato',
] as const

function dayName(date: string): string {
  const index = new Date(`${date}T12:00:00Z`).getUTCDay()
  return DAY_NAMES[index] ?? date
}

/** "oggi", "domani", "giovedi", "fra dieci giorni": la forma piu' naturale per la distanza. */
function whenPhrase(fromDate: string, targetDate: string): string {
  const delta = daysBetween(fromDate, targetDate)
  if (delta <= 0) return 'oggi'
  if (delta === 1) return 'domani'
  if (delta === 2) return 'dopodomani'
  if (delta <= 6) return dayName(targetDate)
  return `fra ${delta} giorni`
}

/**
 * Costruisce la finestra potenziale da una serie di punteggi previsti.
 *
 * @param series punteggi in ordine cronologico, dal giorno corrente in avanti
 * @param limitingFactor fattore che sta limitando il punteggio, gia' calcolato da explainScore
 */
export function potentialWindow(
  series: readonly ForecastPoint[],
  limitingFactor: string | null,
): PotentialWindow | null {
  if (series.length === 0) return null
  const firstPoint = series[0]
  if (firstPoint === undefined) return null

  let peak = firstPoint
  for (const point of series) {
    if (point.mpi > peak.mpi) peak = point
  }

  // Larghezza a meta' altezza: dice se il potenziale e' un picco stretto o un periodo lungo.
  const halfHeight = peak.mpi / 2
  const peakIndex = series.indexOf(peak)
  let startIndex = peakIndex
  let endIndex = peakIndex
  while (startIndex > 0 && (series[startIndex - 1]?.mpi ?? 0) >= halfHeight) startIndex -= 1
  while (endIndex < series.length - 1 && (series[endIndex + 1]?.mpi ?? 0) >= halfHeight) endIndex += 1

  const start = series[startIndex]?.date ?? peak.date
  const end = series[endIndex]?.date ?? peak.date

  const head = series.slice(0, Math.min(4, series.length))
  const tail = series.slice(Math.max(0, series.length - 4))
  const trend = average(tail.map((p) => p.mpi)) - average(head.map((p) => p.mpi))

  return {
    peakDate: peak.date,
    peakMpi: peak.mpi,
    start,
    end,
    trend,
    narrative: compose(firstPoint, peak, start, end, trend, limitingFactor),
  }
}

function compose(
  current: ForecastPoint,
  peak: ForecastPoint,
  start: string,
  end: string,
  trend: number,
  limitingFactor: string | null,
): string {
  const parts: string[] = []
  const windowDays = daysBetween(start, end) + 1
  const risesLater = peak.date !== current.date && peak.mpi > current.mpi + 3

  // 1. Dove sta il potenziale.
  if (peak.mpi < 15) {
    parts.push(
      `Le condizioni restano ${mpiQualifier(peak.mpi)} per tutto l'orizzonte disponibile`,
    )
  } else if (risesLater) {
    parts.push(
      `Il potenziale sale fino a ${whenPhrase(current.date, peak.date)}, quando le condizioni ` +
        `diventano ${mpiQualifier(peak.mpi)}`,
    )
  } else if (peak.date === current.date) {
    parts.push(`Il momento migliore dell'orizzonte disponibile è oggi, con condizioni ${mpiQualifier(current.mpi)}`)
  } else {
    parts.push(`Le condizioni restano ${mpiQualifier(peak.mpi)} e senza un picco marcato`)
  }

  // 2. Quanto dura.
  if (peak.mpi >= 15) {
    if (windowDays >= 5) parts.push(`e si mantengono per circa ${windowDays} giorni`)
    else if (windowDays >= 2) parts.push(`e durano circa ${windowDays} giorni`)
    else parts.push('ma per un solo giorno')
  }

  // 3. Dove sta andando, se non e' gia' evidente dal picco.
  if (!risesLater) {
    if (trend > 6) parts.push('con una tendenza in miglioramento')
    else if (trend < -6) parts.push('con una tendenza in peggioramento')
  }

  let sentence = `${parts.join(' ')}.`

  // 4. Cosa manca. E' la parte azionabile: non "quanto vale l'acqua" ma "cosa mi frena".
  if (limitingFactor !== null && peak.mpi < 70) {
    sentence += ` Il limite principale resta ${limitingFactor.toLowerCase()}.`
  }

  /*
   * 5. Quanto fidarsi, e soprattutto **perche'**.
   *
   * La confidence di un giorno futuro e' bassa quasi sempre per l'orizzonte previsionale, non
   * perche' manchino le stazioni. Attribuirlo ai dati scarsi, come faceva la prima versione,
   * dava all'utente una diagnosi sbagliata: gli avrebbe fatto credere che la zona sia poco
   * coperta quando invece il problema e' solo che parliamo di fra tre giorni.
   */
  const horizonDays = daysBetween(current.date, peak.date)
  if (horizonDays >= 2) {
    sentence +=
      horizonDays > 5
        ? ` Parliamo però di una previsione a ${horizonDays} giorni, quindi con incertezza rilevante.`
        : ` L'incertezza cresce con i giorni: il picco è una previsione a ${horizonDays} giorni.`
  } else if (current.confidence < 50) {
    sentence +=
      ' La stima è poco solida anche per oggi: su questa zona i dati osservati sono pochi.'
  }

  return sentence
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}
