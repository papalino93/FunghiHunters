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
  /**
   * `true` se la zona di cui parla il verdetto non ha nemmeno una stazione vicina: il punteggio
   * viene solo dal modello meteo, mai confrontato con misure. Serve alla scheda per dirlo in
   * chiaro accanto al titolo, non in grigio piccolo sotto.
   */
  readonly modelOnly: boolean
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
      modelOnly: false,
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

  const modelOnly = top.zone.stations.length === 0

  return {
    tone,
    headline: headlineFor(tone, date === today, modelOnly),
    reason: reasonFor(tone, top, limit, regional, zones, date),
    outlook: outlookFor(best, top, date, formatDate),
    advice: adviceFor(tone, top, date, formatDate),
    modelOnly,
  }
}

export function toneFor(mpi: number): VerdictTone {
  if (mpi < 20) return 'no'
  if (mpi < 40) return 'weak'
  if (mpi < 60) return 'worth'
  return 'good'
}

/**
 * Il titolo del verdetto.
 *
 * **Senza stazioni il sì non è secco.** Con la copertura nazionale una zona di solo modello poteva
 * scrivere «Oggi sì.» a 98/100, mentre le sette zone toscane tarate sulle stazioni non superavano
 * 24: dove la stima è più debole l'app sembrava più sicura. Il punteggio resta quello (cambiarlo
 * senza dati vorrebbe dire cambiare il modello), ma un verdetto positivo detto dal solo modello lo
 * dichiara nel titolo. I verdetti negativi restano asciutti: sbagliare un «no» costa un'uscita
 * mancata, sbagliare un «sì» costa una giornata e un viaggio.
 */
function headlineFor(tone: VerdictTone, isToday: boolean, modelOnly: boolean): string {
  const when = isToday ? 'Oggi' : 'Quel giorno'
  if (modelOnly && tone === 'good') return `${when} buone condizioni, secondo il modello.`
  if (modelOnly && tone === 'worth') return `${when} potrebbe valerne la pena, secondo il modello.`
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
    /*
     * La temperatura può limitare da due lati, e prima se ne raccontava uno solo.
     *
     * Con la media sotto l'ottimo — novembre in quota, cioè la coda della stagione, non un caso
     * di laboratorio — usciva «fa ancora troppo caldo: 5 °C ... Sono -8 gradi di troppo»: la
     * frase diceva il contrario del dato che citava lei stessa.
     */
    const gap = tMean - optimum
    const tooWarm = gap > 0
    const scope = everywhere ? 'In tutta la Toscana fa' : 'Fa'
    return (
      `${scope} ${tooWarm ? 'ancora troppo caldo' : 'troppo freddo'}: ` +
      `${tMean.toFixed(0)} °C di media negli ultimi 20 giorni, ` +
      `contro i ${optimum.toFixed(0)} a cui il porcino fruttifica. ` +
      `Sono ${Math.abs(gap).toFixed(0)} gradi ${tooWarm ? 'di troppo' : 'sotto'}.` +
      secondaryLimitClause(zone, 'thermal')
    )
  }

  if (limit?.startsWith('Acqua') === true) {
    const scope = everywhere ? 'Manca acqua ovunque' : 'Manca acqua'
    return (
      `${scope}: dopo evapotraspirazione restano ${water.toFixed(0)} mm utili nel terreno, ` +
      `su ${(rain ?? 0).toFixed(0)} mm caduti in 26 giorni.` +
      secondaryLimitClause(zone, 'water')
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

/**
 * La frase del verdetto racconta un solo fattore — quello che, tolto, farebbe salire di più il
 * punteggio — perché è la domanda che conta: "cosa mi frena". Il rischio, segnalato da chi usa
 * l'app, è che l'unico fattore nominato sembri l'unico che il modello considera, quando in realtà
 * il punteggio è sempre un prodotto di più termini (`src/lib/model/mpi.ts`).
 *
 * Qui si aggiunge una clausola breve solo quando un secondo fattore pesa quasi quanto il primo
 * (almeno la metà del suo contributo, e comunque non trascurabile): non ogni volta, altrimenti la
 * frase torna a essere una lista di numeri invece di una risposta.
 */
function secondaryLimitClause(zone: SnapshotZone, primaryKey: string): string {
  /*
   * Il fattore nominato dalla frase (`primaryKey`) può non comparire in `negativeFactors`: quella
   * lista usa una soglia più stretta (contributo oltre -2) di `limitingFactorOf` in `explain.ts`
   * (gap oltre 1). Senza questo controllo, un ripiego sul primo elemento della lista avrebbe
   * confrontato un fattore estraneo con se stesso — attribuendo alla frase un "secondo motivo"
   * che in realtà era il primo, non trovato.
   */
  const primary = zone.negativeFactors.find((f) => f.key === primaryKey)
  const secondary = zone.negativeFactors.find((f) => f.key !== primaryKey)
  if (primary === undefined || secondary === undefined) return ''
  if (Math.abs(secondary.contribution) < 5) return ''
  if (Math.abs(secondary.contribution) < Math.abs(primary.contribution) * 0.5) return ''
  return ` Pesa anche ${secondary.label.toLowerCase()}.`
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
  date: string,
  formatDate: (date: string) => string,
): string | null {
  const where = `${top.zone.name}${top.distanceKm === null ? '' : `, a ${top.distanceKm.toFixed(0)} km`}`

  switch (tone) {
    case 'no':
      // «quella messa meglio», non «l'unica con qualcosa»: la prima è quasi sempre vera per un
      // punto o due (19 contro 18), e allora «l'unica» era falso proprio nella frase da seguire.
      return `Se esci lo stesso, ${where} è quella messa meglio: ${strengthOf(top)}.`
    case 'weak':
      return `Se ci vai, ${where}: ${strengthOf(top)}.`
    case 'worth':
    case 'good':
      return (
        `${where}${
          /*
           * Confronto con il giorno scelto e con la stessa soglia della scheda zona
           * (`SuggestionCard`). Prima si confrontava con `series[0]`, il primo giorno di storia
           * (due mesi fa): il giorno migliore non era mai quello, e usciva «meglio mer 23 set»
           * anche quando mer 23 set era oggi.
           */
          top.bestDay !== null && top.bestDay.date !== date && top.bestDay.mpi > top.mpi + 3
            ? `, meglio ${formatDate(top.bestDay.date)}`
            : ''
        }.`
      )
  }
}

/** La cosa buona che quella zona ha, detta in parole. */
function strengthOf(top: Suggestion): string {
  const water = top.zone.weather.effectiveWaterMm
  if (water >= 60) return `ha acqua vera nel terreno, ${water.toFixed(0)} mm utili`
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

  // Stessa ragione della frase del verdetto: sotto l'ottimo il problema è il freddo, e chiamarlo
  // "manca il fresco" significa contraddire il numero scritto nella riga accanto.
  const tempProblem =
    tMean === null || temp === null || tempOk
      ? null
      : tMean > optimum
        ? `Manca il fresco: ${temp}`
        : `Troppo freddo: ${temp}`

  const waterProblem = waterOk ? null : `Manca acqua: solo ${water}`

  /*
   * Il bosco, quando è lui il limite.
   *
   * Dal modello 1.4.0 il bosco entra nel punteggio, quindi può essere il fattore che lo tiene
   * basso mentre acqua e temperatura sono a posto. Senza questa riga la scheda avrebbe detto
   * "L'acqua c'è" e nient'altro, con "Limite: Bosco" scritto due centimetri più sotto: non una
   * contraddizione, ma una risposta che nasconde la cosa che conta.
   *
   * Due casi diversi, e vanno distinti: poco bosco non è la stessa cosa di bosco poco adatto.
   */
  const forestProblem =
    zone.limitingFactor !== 'Il bosco della zona'
      ? null
      : zone.forestFraction !== undefined && zone.forestFraction < 0.4
        ? `Poco bosco: copre il ${Math.round(zone.forestFraction * 100)}% dell'area attorno al punto`
        : zone.forest.length > 0
          ? `Bosco poco adatto al porcino: ${zone.forest.join(', ')}`
          : 'Il bosco di questa zona è il limite principale'

  // Le due soglie sopra (±3°C, 45mm) dicono solo "questo fattore è scomodo", non quanto pesa sul
  // punteggio: la campana termica è asimmetrica (più tollerante sopra l'ottimo), quindi un caso
  // può avere sia temperatura sia acqua "scomode" mentre il modello, che le pesa insieme, ne
  // considera una sola davvero limitante. Quando è così, va nominata per prima quella — altrimenti
  // questa frase e "Perché" (che legge `zone.limitingFactor`) raccontano due storie diverse dello
  // stesso numero, come nel caso di Garfagnana del 21/9. Vale anche per il bosco: se il modello
  // dice che il limite è quello, è quello che va scritto.
  const bad =
    forestProblem ??
    (tempProblem !== null && waterProblem !== null
      ? zone.limitingFactor === 'Acqua disponibile nel suolo'
        ? waterProblem
        : tempProblem
      : (tempProblem ?? waterProblem))

  return {
    good: waterOk ? `L'acqua c'è: ${water}` : tempOk && temp !== null ? `Temperatura giusta: ${temp}` : null,
    bad,
  }
}
