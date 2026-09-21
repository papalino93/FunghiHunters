/**
 * Guida all'habitat, non un pin sulla mappa.
 *
 * Non esiste nessuna fonte reale di coordinate GPS legate a ritrovamenti di porcino: un punto
 * esatto sarebbe un dato fabbricato, esattamente ciò che questo progetto esclude fin dalla prima
 * decisione di design — «l'MPI indica la compatibilità delle condizioni, mai la presenza di
 * funghi» (docs/DECISIONS.md). Quello che si può dire onestamente è più generico: dove, dentro un
 * bosco compatibile, l'ecologia del porcino lo colloca più spesso.
 *
 * Sono indicazioni di ecologia generale del genere, valide ovunque compaia quel tipo di bosco —
 * non calibrate su questa zona specifica, a differenza dei parametri marcati `is_calibrated` in
 * `algorithm.ts`.
 *
 * Da dove viene il tipo di bosco cambia a seconda della zona, ed è bene saperlo leggendo questo
 * file. Per le sette zone toscane di calibrazione è ancora l'etichetta descrittiva scritta a mano
 * in `zones.ts`. Per le zone del catalogo nazionale è invece **misurato**, dalla mappa europea dei
 * generi arborei a 10 m: vedi `src/lib/sources/forest-genus.ts`, che dichiara anche cosa quella
 * carta non sa distinguere.
 */

export interface HabitatCue {
  readonly forestType: string
  readonly host: string
  readonly note: string
}

const CUES: Readonly<Record<string, HabitatCue>> = {
  faggeta: {
    forestType: 'faggeta',
    host: 'faggio',
    note:
      'Cerca ai margini di radure e sentieri, dove filtra più luce: nel folto buio della faggeta ' +
      'chiusa il porcino è raro.',
  },
  abetina: {
    forestType: 'abetina',
    host: 'abete',
    note:
      "Nelle abetine miste cerca vicino al bordo con le latifoglie: l'abete puro da solo è meno " +
      'ospitale del margine.',
  },
  castagneto: {
    forestType: 'castagneto',
    host: 'castagno',
    note:
      'Il castagneto da frutto, ripulito dal sottobosco, ospita meno del castagneto misto e più ' +
      'selvatico, con humus indisturbato.',
  },
  cerreta: {
    forestType: 'cerreta',
    host: 'cerro',
    note: 'Preferisce i margini e le radure della cerreta, non il querceto fitto e senza luce.',
  },
  leccio: {
    forestType: 'leccio',
    host: 'leccio',
    note:
      'Nella lecceta la stagione utile è più corta e legata alle piogge autunnali: cerca nei tratti ' +
      'più freschi e ombrosi, non sulle balze più assolate.',
  },

  // I sei che seguono vengono dalla copertura forestale misurata (`forest-genus.ts`), non da
  // un'etichetta scritta a mano. Gli ultimi due sono volutamente generici: la carta classifica il
  // genere e per quelle due classi non lo dice, quindi il consiglio dichiara di non saperlo invece
  // di indovinare una specie.
  querceto: {
    forestType: 'querceto',
    host: 'querce',
    note:
      'Sotto cerro e roverella il porcino arriva presto, già a fine estate dopo i primi temporali. ' +
      'Cerca ai margini e nelle radure, non nel querceto fitto dove non passa luce.',
  },
  pecceta: {
    forestType: 'pecceta',
    host: 'abete rosso',
    note:
      "Il bosco da porcino dell'arco alpino: cerca dove il muschio è spesso e il bosco si apre, " +
      'lungo le piste e ai bordi dei pascoli, più che nel folto buio.',
  },
  lariceto: {
    forestType: 'lariceto',
    host: 'larice',
    note:
      'Il lariceto è chiaro ed erboso, e qui il porcino sta spesso allo scoperto, nell\'erba fra un ' +
      'albero e l\'altro: si cammina piano e si guarda lontano, non solo sotto i piedi.',
  },
  pineta: {
    forestType: 'pineta',
    host: 'pino',
    note:
      "Sotto i pini conta il fresco: cerca dove lo strato di aghi è spesso e il terreno non si " +
      'asciuga, e considera che qui la stagione dipende dalle piogge più che dal caldo.',
  },
  'altre conifere': {
    forestType: 'altre conifere',
    host: 'conifera non distinta dalla carta',
    note:
      'La carta usata dice che è una conifera ma non quale. Se sul posto trovi abete bianco vale ' +
      "quello che si dice dell'abetina: cerca al bordo con le latifoglie, non nell'abete puro.",
  },
  'altre latifoglie': {
    forestType: 'altre latifoglie',
    host: 'latifoglia non distinta dalla carta',
    note:
      'La carta non dice quale latifoglia sia. In Italia in questa classe ricade spesso il ' +
      'castagno, che per il porcino è ottimo: guarda le foglie a terra per capire dove sei.',
  },
}

/** Un accenno per tipo di bosco presente in zona, senza doppioni, nell'ordine dato. */
export function habitatCuesFor(forestTypes: readonly string[]): HabitatCue[] {
  const seen = new Set<string>()
  const out: HabitatCue[] = []
  for (const type of forestTypes) {
    const cue = CUES[type]
    if (cue === undefined || seen.has(cue.forestType)) continue
    seen.add(cue.forestType)
    out.push(cue)
  }
  return out
}
