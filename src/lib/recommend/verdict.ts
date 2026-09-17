/**
 * Il verdetto: la risposta in una frase, prima di qualunque numero.
 *
 * Il difetto dell'impostazione precedente era che il numero arrivava prima del significato.
 * «Garfagnana 24» non dice niente a nessuno: 24 è alto o basso? rispetto a cosa? e soprattutto,
 * **esco o non esco?**
 *
 * Qui la domanda si risolve in parole, e i numeri restano come verifica per chi li vuole. La
 * regola che seguo: se una frase non cambierebbe la decisione di chi la legge, non va scritta.
 *
 * Vincolo semantico invariato: si parla di condizioni, mai di presenza di funghi.
 */

import type { SnapshotZone } from '@/lib/snapshot/types'
import { mpiOn, type Suggestion } from '@/lib/recommend/rank'

export type VerdictTone = 'no' | 'weak' | 'worth' | 'good'

export interface Verdict {
  readonly tone: VerdictTone
  /** Il titolo, due o tre parole. È la risposta. */
  readonly headline: string
  /** Perché, in una frase, con i numeri veri dentro. */
  readonly reason: string
  /** Cosa succede nei prossimi giorni. `null` se non c'è nulla da dire. */
  readonly outlook: string | null
  /** Suggerimento operativo, se ne esiste uno sensato. */
  readonly advice: string | null
}

/** Le bande della scala, con il nome che compare in UI. */
export const BANDS: ReadonlyArray<{ upTo: number; name: string }> = [
  { upTo: 20, name: 'sfavorevoli' },
  { upTo: 40, name: 'poco favorevoli' },
  { upTo: 60, name: 'discrete' },
  { upTo: 80, name: 'favorevoli' },
  { upTo: 100, name: 'molto favorevoli' },
]

export function bandNameFor(mpi: number): string {
  for (const band of BANDS) {
    if (mpi < band.upTo) return band.name
  }
  return BANDS[BANDS.length - 1]?.name ?? 'sfavorevoli'
}

/**
 * Qual è il fattore che frena di più, guardando tutte le zone insieme.
 * Serve per la frase regionale: se in tutta la Toscana il limite è lo stesso, dirlo una volta
 * vale più che ripeterlo su sette schede.
 */
export function dominantLimit(zones: readonly SnapshotZone[]): string | null {
  const counts = new Map<string, number>()
  for (const zone of zones) {
    if (zone.limitingFactor === null) continue
    counts.set(zone.limitingFactor, (counts.get(zone.limitingFactor) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [factor, count] of counts) {
    if (count > bestCount) {
      best = factor
      bestCount = count
    }
  }
  // Solo se è davvero condiviso dalla maggioranza: altrimenti è una media senza significato.
  return bestCount > zones.length / 2 ? best : null
}

/** Il giorno migliore su tutte le zone nell'orizzonte disponibile. */
export function bestAhead(
  zones: readonly SnapshotZone[],
  fromDate: string,
): { date: string; mpi: number; zone: SnapshotZone } | null {
  let best: { date: string; mpi: number; zone: SnapshotZone } | null = null
  for (const zone of zones) {
    for (const point of zone.series) {
      if (point.date < fromDate) continue
      if (best === null || point.mpi > best.mpi) best = { date: point.date, mpi: point.mpi, zone }
    }
  }
  return best
}

export interface VerdictInput {
  readonly zones: readonly SnapshotZone[]
  readonly suggestions: readonly Suggestion[]
  readonly date: string
  readonly today: string
  /** Formatta una data per l'utente. Iniettata per non cablare il locale qui dentro. */
  readonly formatDate: (date: string) => string
}

export function buildVerdict(input: VerdictInput): Verdict {
  const { zones, suggestions, date, today, formatDate } = input
  const top = suggestions[0]

  if (top === undefined) {
    return {
      tone: 'no',
      headline: 'Nessuna area disponibile',
      reason: 'I filtri attivi escludono tutte le aree coperte.',
      outlook: null,
      advice: null,
    }
  }

  const best = bestAhead(zones, date)
  const tone = toneFor(top.mpi)

  /*
   * Il limite da raccontare è quello della **zona di cui parliamo**, non quello della maggioranza.
   *
   * Usando il fattore dominante regionale il verdetto diceva «manca acqua» citando i millimetri
   * della Garfagnana, che l'acqua ce l'ha: la scheda subito sotto scriveva «l'acqua c'è» con lo
   * stesso numero. Due frasi opposte sullo stesso dato, ed è il tipo di contraddizione che fa
   * perdere fiducia in tutto il resto.
   *
   * Il fattore regionale serve solo a decidere se dire «in tutta la Toscana» o «qui».
   */
  const limit = top.zone.limitingFactor
  const regional = dominantLimit(zones)

  return {
    tone,
    headline: headlineFor(tone, date === today),
    reason: reasonFor(tone, top, limit, regional, zones, date),
    outlook: outlookFor(best, top, date, formatDate),
    advice: adviceFor(tone, top, formatDate),
  }
}

function toneFor(mpi: number): VerdictTone {
  if (mpi < 20) return 'no'
  if (mpi < 40) return 'weak'
  if (mpi < 60) return 'worth'
  return 'good'
}

function headlineFor(tone: VerdictTone, isToday: boolean): string {
  const when = isToday ? 'Oggi' : 'Quel giorno'
  switch (tone) {
    case 'no':
      return `${when} no.`
    case 'weak':
      return `${when} si può tentare, senza aspettarsi molto.`
    case 'worth':
      return `${when} ci sta andare.`
    case 'good':
      return `${when} sì.`
  }
}

/**
 * Il perché, con i numeri dentro la frase e non accanto.
 *
 * Preferisco «fa ancora troppo caldo: 19 gradi di media contro i 13 dell'ottimo» a un badge con
 * scritto 19.3. Il primo si legge e si ricorda, il secondo va interpretato.
 */
function reasonFor(
  tone: VerdictTone,
  top: Suggestion,
  limit: string | null,
  regionalLimit: string | null,
  zones: readonly SnapshotZone[],
  date: string,
): string {
  const zone = top.zone
  const tMean = zone.weather.tMean20d
  const optimum = zone.thermalOptimumC
  const water = zone.weather.effectiveWaterMm
  const rain = zone.weather.rain26d

  // "In tutta la Toscana" solo se il limite è davvero lo stesso ovunque: altrimenti si
  // generalizzerebbe il problema di una zona a tutte le altre.
  const everywhere =
    zones.length > 1 && regionalLimit === limit && zones.every((z) => mpiOn(z, date) < 20)

  if (limit?.startsWith('Temperatura') === true && tMean !== null) {
    const excess = tMean - optimum
    const scope = everywhere ? 'In tutta la Toscana fa' : 'Fa'
    return (
      `${scope} ancora troppo caldo: ${tMean.toFixed(0)} °C di media negli ultimi 20 giorni, ` +
      `contro i ${optimum.toFixed(0)} a cui il porcino fruttifica. ` +
      `Sono ${excess.toFixed(0)} gradi di troppo.`
    )
  }

  if (limit?.startsWith('Acqua') === true) {
    const scope = everywhere ? 'Manca acqua ovunque' : 'Manca acqua'
    return (
      `${scope}: dopo evapotraspirazione restano ${water.toFixed(0)} mm utili nel terreno, ` +
      `su ${(rain ?? 0).toFixed(0)} mm caduti in 26 giorni.`
    )
  }

  if (tone === 'good' || tone === 'worth') {
    return (
      `Nella zona migliore ci sono ${water.toFixed(0)} mm ancora disponibili nel suolo e ` +
      `${tMean === null ? 'temperature' : `${tMean.toFixed(0)} °C`} di media a 20 giorni.`
    )
  }

  return `La zona migliore è ${bandNameFor(top.mpi)}, e nessuna delle altre fa meglio.`
}

function outlookFor(
  best: { date: string; mpi: number; zone: SnapshotZone } | null,
  top: Suggestion,
  date: string,
  formatDate: (date: string) => string,
): string | null {
  if (best === null) return null

  // Un miglioramento che non cambia banda non è una notizia: non va annunciato.
  const improves = best.mpi > top.mpi + 5 && bandNameFor(best.mpi) !== bandNameFor(top.mpi)

  if (best.date === date && !improves) {
    return 'Nei prossimi giorni il quadro non cambia.'
  }
  if (improves) {
    return (
      `Il momento migliore in vista è ${formatDate(best.date)} in ${best.zone.name}, ` +
      `con condizioni ${bandNameFor(best.mpi)}.`
    )
  }
  return 'Nei prossimi giorni non si vede un miglioramento sostanziale.'
}

function adviceFor(
  tone: VerdictTone,
  top: Suggestion,
  formatDate: (date: string) => string,
): string | null {
  const where = `${top.zone.name}${top.distanceKm === null ? '' : `, a ${top.distanceKm.toFixed(0)} km`}`

  switch (tone) {
    case 'no':
      return `Se esci lo stesso, ${where} è l'unica con qualcosa: ${strengthOf(top)}.`
    case 'weak':
      return `Se ci vai, ${where}: ${strengthOf(top)}.`
    case 'worth':
    case 'good':
      return (
        `${where}${
          top.bestDay !== null && top.bestDay.date !== top.zone.series[0]?.date
            ? `, meglio ${formatDate(top.bestDay.date)}`
            : ''
        }.`
      )
  }
}

/** La cosa buona che quella zona ha, detta in parole. */
function strengthOf(top: Suggestion): string {
  const water = top.zone.weather.effectiveWaterMm
  if (water >= 60) return `è l'unica con acqua vera nel terreno, ${water.toFixed(0)} mm utili`
  if (water >= 30) return `ha ancora ${water.toFixed(0)} mm utili nel terreno`
  return 'ha il punteggio più alto, per quanto basso'
}

/**
 * I due fatti che contano per una zona: cosa funziona e cosa no, in parole.
 *
 * Sostituisce la fila di sei numeri della versione precedente. Un cercatore non legge una
 * dashboard: vuole sapere se manca l'acqua o manca il fresco, perché sono due attese diverse.
 */
export interface ZoneFacts {
  readonly good: string | null
  readonly bad: string | null
}

export function zoneFacts(zone: SnapshotZone): ZoneFacts {
  const w = zone.weather
  const tMean = w.tMean20d
  const optimum = zone.thermalOptimumC

  const waterOk = w.effectiveWaterMm >= 45
  const tempOk = tMean !== null && Math.abs(tMean - optimum) <= 3

  const water = `${w.effectiveWaterMm.toFixed(0)} mm ancora disponibili nel suolo`
  // Un decimale qui: è un fatto misurato, e arrotondare 19.5 a 20 lo allontanerebbe
  // dall'ottimo più di quanto sia. Nella frase narrativa invece l'intero si legge meglio.
  const temp =
    tMean === null
      ? null
      : `${tMean.toFixed(1)} °C di media a 20 giorni, ottimo ${optimum.toFixed(1)}`

  return {
    good: waterOk ? `L'acqua c'è: ${water}` : tempOk && temp !== null ? `Temperatura giusta: ${temp}` : null,
    bad: !tempOk && temp !== null
      ? `Manca il fresco: ${temp}`
      : !waterOk
        ? `Manca acqua: solo ${water}`
        : null,
  }
}
