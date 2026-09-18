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
 * `algorithm.ts`. Il tipo di bosco stesso resta quello descrittivo di `zones.ts`, non la maschera
 * forestale reale (UCS 10k), come già dichiarato lì.
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
