/**
 * Le versioni del modello, per chi usa l'app: cosa è cambiato, perché, e su quale prova.
 *
 * Un punteggio che cambia senza spiegazione è un punteggio di cui non ci si fida. Il ragionamento
 * completo resta nei commenti di `config/algorithm.ts` e in `docs/EVIDENZA-MODELLO.md`; qui la
 * versione breve, mostrata nella pagina «Come calcoliamo l'indice» (`/metodo`). La prima voce è
 * sempre la versione in produzione (verificato in `tests/changelog.test.ts`).
 */
export interface ModelRelease {
  readonly version: string
  readonly date: string
  readonly title: string
  readonly what: string
  readonly why: string
}

export const MODEL_CHANGELOG: readonly ModelRelease[] = [
  {
    version: '1.5.0-porcino',
    date: '2026-09-24',
    title: 'La pioggia forte conta anche quando il terreno si asciuga',
    what:
      'Nei giorni in cui, dopo una pioggia di almeno 20 mm, ci si aspetta la fruttificazione (circa ' +
      '12 giorni dopo), il terreno che nel frattempo si asciuga non azzera più il punteggio.',
    why:
      'Il 23-24 settembre 2026 nel Mugello si trovavano porcini in abbondanza, 13-14 giorni dopo 36 mm ' +
      'di pioggia, e il modello diceva 12/100. È il ritardo misurato sul Monte Amiata (Salerni 2023): ' +
      'il modello lo contraddiceva.',
  },
  {
    version: '1.4.0-porcino',
    date: '2026-09-21',
    title: 'Entra il bosco',
    what:
      'Quanto bosco c’è attorno alla zona e di che tipo (dati ForestPaths) entrano nel punteggio.',
    why:
      'Prima due zone con lo stesso meteo prendevano lo stesso numero anche se una era faggeta e ' +
      'l’altra un altopiano spoglio: per un fungo che vive con gli alberi era il limite più grosso.',
  },
  {
    version: '1.3.0-porcino',
    date: '2026-09-20',
    title: 'Il caldo moderato non dimezza più il punteggio',
    what:
      'La curva della temperatura è più larga sopra l’ottimo che sotto: giornate calde ma non estreme ' +
      'pesano meno del freddo.',
    why:
      'Con notti fresche e giornate a 28-32 °C la temperatura risultava il limite in 4 zone su 7 lo ' +
      'stesso giorno. Il caldo vero ha già penalità sue.',
  },
  {
    version: '1.2.0-porcino',
    date: '2026-09-18',
    title: 'Il vento contato una volta sola',
    what:
      'Il vento incide sull’acqua del terreno solo attraverso l’evapotraspirazione, e la sicurezza ' +
      'dell’uscita è un avviso separato, non un pezzo del punteggio.',
    why: 'Lo stesso vento veniva contato due volte sullo stesso bilancio.',
  },
]
