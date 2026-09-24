/**
 * Configurazione versionata dell'algoritmo MPI.
 *
 * **Nessun numero del modello vive nel codice.** Soglie, pesi, decadimenti, penalita' e
 * parametri di specie stanno tutti qui, e ogni modifica genera una nuova `version` che viene
 * salvata insieme a ogni punteggio. E' cio' che rende possibile il backtest, il confronto fra
 * versioni e la calibrazione senza toccare il motore.
 *
 * Ogni parametro porta la sua provenienza:
 *   `sourced`    = valore misurato in letteratura, con citazione
 *   `calibrate`  = parametro da calibrare, dichiarato tale anche in UI
 *
 * Un parametro `sourced` senza citazione e' un errore, e lo schema del database lo rifiuta.
 */

/** Provenienza di un parametro del modello. */
export type ParamProvenance = 'sourced' | 'calibrate'

/**
 * Quanto pesa la fonte.
 *
 * Non tutte le citazioni valgono uguale, e fingere il contrario sarebbe come non citarle. Uno
 * studio sottoposto a revisione fatto sull'Amiata vale piu' di un preprint tedesco, che vale piu'
 * di una guida naturalistica. L'utente vede il livello accanto al parametro.
 *
 *   peer-reviewed  = pubblicato e sottoposto a revisione paritaria
 *   preprint       = pubblicato, non ancora revisionato
 *   institutional  = ente pubblico o istituzionale (dato ufficiale, non letteratura scientifica)
 *   local-data     = misurato da noi, sui nostri dati, sulle nostre zone (es. cross-validation
 *                    dell'interpolazione): non e' letteratura, ma e' evidenza empirica reale e va
 *                    trattata come tale, non confusa con un parametro indovinato
 *   grey           = letteratura divulgativa o manualistica, non verificabile con un DOI
 */
export type SourceTier = 'peer-reviewed' | 'preprint' | 'institutional' | 'local-data' | 'grey'

/**
 * Quanto un risultato misurato altrove vale per il porcino in Toscana.
 *
 * Il punto sollevato piu' volte su questo progetto e' semplice e giusto: un risultato osservato
 * in una faggeta tedesca, o in un singolo sito toscano, non diventa automaticamente una regola
 * valida per tutta la regione solo perche' e' citato. Questa struttura costringe a dichiararlo
 * per ogni fonte, non solo per le due o tre piu' citate nei commenti.
 */
export interface EvidenceAssessment {
  /** Specie effettivamente studiata, non quella che vorremmo. */
  readonly speciesStudied: string
  readonly habitatStudied: string
  readonly geographicArea: string
  readonly observationPeriod: string
  /** Cosa e' stato davvero misurato, e cosa il risultato dimostra — non l'interpretazione. */
  readonly demonstratedVariable: string
  readonly demonstratedResult: string
  /** Perche' vale (o non vale, o vale con cautela) per il porcino in Toscana. */
  readonly transferability: string
  readonly status: 'applicable' | 'applicable-with-caution' | 'not-applicable-without-calibration'
  /**
   * La stessa cautela in una riga, per chi usa l'app: `transferability` resta il ragionamento
   * completo per chi rivede il modello (riferimenti ad altri parametri, ricerche secondarie,
   * date di verifica), ma mostrata cosi' com'e' nella scheda "Perche'" era un appunto di lavoro
   * in arancio da 10 px, non un'avvertenza. Obbligatoria per ogni fonte non `applicable`
   * (verificato in `tests/model.test.ts`): senza, la scheda non mostrerebbe alcuna cautela.
   */
  readonly userCaution?: string
}

export interface Param {
  readonly value: number
  readonly provenance: ParamProvenance
  /** Obbligatoria quando `provenance` e' `sourced`. */
  readonly source?: string
  readonly tier?: SourceTier
  readonly note?: string
}

const sourced = (value: number, source: string, tier: SourceTier, note?: string): Param =>
  note === undefined
    ? { value, provenance: 'sourced', source, tier }
    : { value, provenance: 'sourced', source, tier, note }

const calibrate = (value: number, note?: string): Param =>
  note === undefined ? { value, provenance: 'calibrate' } : { value, provenance: 'calibrate', note }

/** Riferimenti bibliografici citati dai parametri. */
export const REFERENCES = {
  /**
   * La fonte piu' vicina a noi che esista: monitoraggio triennale di Boletus edulis
   * sul Monte Amiata, ad Abbadia San Salvatore, a 1050 m. Una delle nostre sette zone.
   * Usa gli stessi dati SIR che usiamo noi.
   *
   * ATTENZIONE, correzione del 21 settembre 2026: il bosco studiato e' **abetina**
   * (rimboschimenti artificiali di Abies alba), non faggeta come questo file dichiarava prima.
   * Vedi la scheda `EVIDENCE.salerni2023` per cosa cambia nella trasferibilita'.
   */
  salerni2023:
    'Salerni E., Paoli L., Perini C. (2023), Combined impact of forest management and climate ' +
    'change on Boletus edulis productivity. Italian Journal of Mycology 52(1): 76-88. ' +
    'https://doi.org/10.6092/issn.2531-7342/16464 - monitoraggio 2000-2002 in rimboschimenti di ' +
    'Abies alba sul Monte Amiata, Abbadia San Salvatore (SI), 1050 m s.l.m.',
  /**
   * Abetine toscane, rilievi mensili con conteggio dei carpofori. E' la prima fonte toscana del
   * progetto che non riguardi l'Amiata: copre il tipo di bosco di Casentino e Garfagnana.
   */
  lagana2002:
    'Lagana A., Angiolini C., Loppi S., Salerni E., Perini C., Barluzzi C., De Dominicis V. ' +
    '(2002), Periodicity, fluctuations and successions of macrofungi in fir forests ' +
    '(Abies alba Miller) in Tuscany, Italy. Forest Ecology and Management 169: 187-202 - ' +
    'rilievi mensili in abetine naturali e di impianto, Toscana',
  /**
   * Lo stesso disegno sperimentale da cui viene il dataset di `salerni2023`, letto dal lato della
   * gestione forestale invece che del clima: diradamento e lettiera.
   */
  salerni2004:
    'Salerni E., Perini C. (2004), Experimental study for increasing productivity of Boletus ' +
    'edulis s.l. in Italy. Forest Ecology and Management 201: 161-170 - quattro rimboschimenti ' +
    'di Abies alba sul Monte Amiata, due classi d\'eta\' (30 e 60 anni), sei trattamenti',
  salerni2002:
    'Salerni E., Lagana A., Perini C., Loppi S., De Dominicis V. (2002), Effects of temperature ' +
    'and rainfall on fruiting of macrofungi in oak forests of the Mediterranean area. ' +
    'Israel Journal of Plant Sciences 50: 189-198 - querceti della Toscana meridionale',
  habitatItalia:
    'Letteratura divulgativa e micologica italiana concorde sulla fascia altimetrica: la faggeta ' +
    'fra 900 e 1400 m e\' l\'habitat classico del porcino autunnale, mentre i porcini estivi si ' +
    'trovavano fra 500 e 700 m e negli ultimi decenni sono saliti di 200-300 m',
  brejon2026:
    'Brejon Lamartiniere E., Hoffman J.I. (2026), Predicting porcini: a decade of sporocarp ' +
    'monitoring reveals the meteorological triggers of Boletus edulis fruiting in central ' +
    'European beech forests. bioRxiv 10.64898/2025.12.12.693895 (preprint, non sottoposto a ' +
    'peer review)',
  karavani2018:
    'Karavani A. et al. (2018), Effect of climatic and soil moisture conditions on mushroom ' +
    'productivity and related ecosystem services in Mediterranean pine stands facing climate ' +
    'change. Agricultural and Forest Meteorology 248: 432-440',
  /**
   * Non letteratura: e' la nostra cross-validation, sui nostri dati, sulle sette zone.
   * Leave-one-out su 50 stazioni SIR (134-1716 m, distanza media dalla piu' vicina 6.0 km),
   * 40 giorni dal 2026-08-08 al 2026-09-16. Confrontata con "prendi la stazione piu' vicina in
   * distanza efficace" — il paragone piu' severo, perche' gia' corregge la quota.
   * Numeri completi in docs/DISCOVERY-AND-ARCHITECTURE.md, Appendice C.
   */
  sirCrossValidation2026:
    'FungiCast (2026), leave-one-out cross-validation dell\'interpolazione su 50 stazioni ' +
    'SIR attorno alle sette zone di taratura, 2026-08-08/2026-09-16. Non pubblicata, riproducibile ' +
    'con scripts/validate-interpolation.ts. MAE: pioggia 2.37 mm (+9.7% sulla stazione piu\' ' +
    'vicina), massima 0.96 C (+56.9%), minima 1.50 C (+16.6%). Dettaglio in ' +
    'docs/DISCOVERY-AND-ARCHITECTURE.md, Appendice C.',
} as const

/**
 * Valutazione dell'evidenza per ciascun riferimento, secondo lo schema richiesto: specie e
 * habitat studiati, area geografica, periodo, cosa e' stato dimostrato davvero, e se e quanto e'
 * trasferibile al porcino in Toscana. Una chiave per ogni voce di `REFERENCES`: nessuna citazione
 * entra nel modello senza passare da questa valutazione esplicita.
 */
export const EVIDENCE: Readonly<Record<keyof typeof REFERENCES, EvidenceAssessment>> = {
  salerni2023: {
    speciesStudied: 'Boletus edulis',
    habitatStudied:
      'Abetina: rimboschimenti artificiali di Abies alba, di gestione forestale nota ' +
      '(diradata vs. non diradata), due classi d\'eta\'',
    geographicArea: 'Monte Amiata, Abbadia San Salvatore (SI), 1050 m — una delle sette zone del modello',
    observationPeriod: '2000-2002, monitoraggio con raccolta giornaliera durante la stagione',
    demonstratedVariable:
      'Relazione fra eventi di pioggia intensa (R20 ETCCDI), ritardo di fruttificazione, e ' +
      'impennate della temperatura massima rispetto alla media del periodo',
    demonstratedResult:
      'Effetto positivo della pioggia intensa massimo a 12 giorni dall\'evento; impennate di ' +
      'temperatura massima di circa 8 C sopra la media del periodo inibiscono la produzione, con ' +
      'correlazioni negative a 4, 14 e 19 giorni. L\'inibizione da caldo NON e\' incondizionata: ' +
      'vale nei siti non diradati o diradati poco, mentre dove il diradamento e\' stato forte la ' +
      'temperatura alta sembra favorire la produzione a partire dal ventesimo giorno dopo ' +
      'l\'evento — vedi la nota su `penalties.heatShock`.',
    transferability:
      'Resta la fonte piu\' vicina a noi: stessa specie, stessa regione, una delle sette zone di ' +
      'taratura, stessi dati SIR che l\'app usa in produzione. Il bosco pero\' e\' ABETINA, non ' +
      'faggeta (corretto il 21 settembre 2026: questo campo dichiarava "faggeta appenninica", ed ' +
      'era sbagliato). Conseguenza concreta: i parametri che ne derivano — innesco a 12 giorni, ' +
      'soglia R20, heatShock — sono piu\' trasferibili alle zone con abetina (Casentino, ' +
      'Garfagnana) di quanto il progetto dichiarasse, e MENO alle faggete pure, per le quali la ' +
      'fonte resta `brejon2026`, tedesca. Resta comunque un singolo sito e tre anni.',
    status: 'applicable',
  },
  lagana2002: {
    speciesStudied: 'Macrofunghi in generale, con censimento dei carpofori per specie',
    habitatStudied: 'Abetine di Abies alba, naturali e di impianto',
    geographicArea: 'Toscana',
    observationPeriod: 'Rilievi mensili; serie pluriennale, con confronto su scala decennale',
    demonstratedVariable:
      'Periodicita\', fluttuazioni e successioni delle comunita\' di macrofunghi in rapporto ai ' +
      'parametri meteorologici e all\'evoluzione del popolamento',
    demonstratedResult:
      'Sul breve periodo i parametri meteorologici dominano periodicita\' e fluttuazioni della ' +
      'fruttificazione; su scala decennale contano invece i parametri vegetazionali e ' +
      'l\'evoluzione del bosco',
    transferability:
      'Toscana e abetina: copre il tipo di bosco di Casentino e Garfagnana, che finora non aveva ' +
      'nessuna fonte propria. Riguarda pero\' i macrofunghi nel loro insieme, non Boletus edulis ' +
      'in particolare, e dimostra una gerarchia di fattori (meteo nel breve, bosco nel lungo), ' +
      'non un valore numerico. Per ora sostiene l\'impianto del modello — il meteo come predittore ' +
      'a breve termine — non un singolo parametro.',
    status: 'applicable-with-caution',
    userCaution: 'Studio sui funghi in generale, non sul porcino, nelle abetine toscane: un\'indicazione.',
  },
  salerni2004: {
    speciesStudied: 'Boletus edulis s.l.',
    habitatStudied: 'Rimboschimenti di Abies alba, due classi d\'eta\' (30 e 60 anni), sei trattamenti',
    geographicArea: 'Monte Amiata (SI) — stesso disegno sperimentale da cui viene `salerni2023`',
    observationPeriod: 'Osservazioni di campo pluriennali (dataset poi ripreso e ampliato nel 2023)',
    demonstratedVariable: 'Effetto del diradamento e dell\'asportazione della lettiera sulla fruttificazione',
    demonstratedResult:
      'Il diradamento medio ha effetto positivo sulla fruttificazione di B. edulis; ' +
      'l\'asportazione dello strato di lettiera ha effetto negativo; nei popolamenti piu\' vecchi ' +
      'B. edulis tende a essere sostituito da B. badius',
    transferability:
      'Stessa specie, stessa zona, stesso bosco di `salerni2023`. Riguarda pero\' variabili che ' +
      'il modello oggi NON ha: densita\' del popolamento, gestione forestale, spessore della ' +
      'lettiera. Non sostiene nessun parametro attuale — e\' la fonte che servirebbe se un domani ' +
      'si volesse introdurre un fattore di gestione forestale, e la ragione per cui ' +
      '`water.canopyDensity` (oggi sempre nullo) non e\' un dettaglio cosmetico.',
    status: 'applicable-with-caution',
    userCaution: 'Misurato in rimboschimenti di abete sul Monte Amiata: altrove è un\'indicazione, non una misura.',
  },
  salerni2002: {
    speciesStudied: 'Macrofunghi in generale (non solo Boletus edulis)',
    habitatStudied: 'Querceti (Quercus spp.)',
    geographicArea: 'Toscana meridionale',
    observationPeriod: 'Non riportato nei parametri usati qui (citazione di corroborazione)',
    demonstratedVariable: 'Ritardo fra evento di pioggia e picco di specie fruttificanti',
    demonstratedResult: 'Massimo numero di specie fruttificanti a circa 10 giorni dalla pioggia',
    transferability:
      'Area toscana, ma specie e habitat diversi (macrofunghi generici in querceto, non porcino in ' +
      'faggeta). Usata solo come corroborazione indipendente del ritardo di 12 giorni misurato da ' +
      'Salerni 2023 sull\'Amiata, non come fonte primaria di nessun parametro.',
    status: 'applicable-with-caution',
    userCaution: 'Studio sui funghi in generale, non sul porcino, nei querceti toscani: un\'indicazione.',
  },
  habitatItalia: {
    speciesStudied: 'Boletus edulis (porcino estivo e autunnale, distinzione tradizionale)',
    habitatStudied: 'Faggeta (autunnale, 900-1400 m); querceto/castagneto di bassa quota (estivo)',
    geographicArea: 'Italia, generico — non un sito o studio specifico',
    observationPeriod: 'Non applicabile: sintesi di conoscenza tradizionale/divulgativa, non uno studio',
    demonstratedVariable: 'Fascia altimetrica e finestra stagionale di fruttificazione osservata',
    demonstratedResult:
      'Consenso qualitativo su dove e quando si trova il porcino in Italia, incluso lo spostamento ' +
      'in quota di 200-300 m osservato negli ultimi decenni',
    transferability:
      'Utile per fissare l\'ordine di grandezza (quota, mese) quando non esiste altro, ma non e\' ' +
      'uno studio quantitativo: nessun numero qui ha un margine d\'errore dichiarato. Trattata come ' +
      'punto di partenza da correggere col diario, non come misura.',
    status: 'applicable-with-caution',
    userCaution: 'Indicazione generale della letteratura italiana, non uno studio su un sito preciso.',
  },
  brejon2026: {
    speciesStudied: 'Boletus edulis',
    habitatStudied: 'Faggeta',
    geographicArea: 'Europa centrale (Germania) — non Italia, non Mediterraneo',
    observationPeriod: 'Un decennio di censimento giornaliero di sporocarpi',
    demonstratedVariable:
      'Finestre ottimali di temperatura (20 giorni, ottimo 13 C) e precipitazione (26 giorni, ' +
      'senza soglia superiore), selezionate per AIC su tutte le combinazioni fra 2 e 35 giorni',
    demonstratedResult:
      'Relazione quadratica temperatura-fruttificazione con ottimo a 13 C, stabile entro 0.6 C fra ' +
      'tre specificazioni di modello; effetto lineare della pioggia cumulata su 26 giorni',
    transferability:
      'Preprint, non ancora revisionato: il metodo (selezione di finestra per AIC su dati reali) e\' ' +
      'solido, ma il sito e\' una faggeta tedesca di clima continentale, non mediterraneo. Usata per ' +
      'il regime autunnale d\'alta quota, dove il tipo di bosco (faggeta) coincide; ESPLICITAMENTE ' +
      'non usata per il regime estivo di bassa quota (cerrete/castagneti), dove trasferirla sarebbe ' +
      'l\'errore peggiore possibile — vedi `optSummerC` in questo file, lasciato senza fonte apposta. ' +
      'Verifica di plausibilita\' (17 settembre 2026, ricerca secondaria, non lettura del testo ' +
      'integrale): uno studio su pineta della Soria, Spagna centrale, 2011-2015 (de-Miguel, ' +
      'Martinez-Pena et al., non letto per intero, paywall) non trova un effetto significativo ' +
      'della temperatura sulla fruttificazione di B. edulis, a differenza di questo preprint. Non ' +
      'e\' una contraddizione che invalida il valore: sono habitat diversi (pineta vs faggeta) e ' +
      'clima diverso (Mediterraneo continentale interno vs Europa centrale), ma conferma che ' +
      '"quanto conta la temperatura" non e\' universale nemmeno fra siti europei, e rafforza — non ' +
      'indebolisce — la cautela gia\' dichiarata qui.',
    status: 'applicable-with-caution',
    userCaution: 'Studio su una faggeta tedesca, non ancora revisionato: usato solo per l\'autunno in quota.',
  },
  karavani2018: {
    speciesStudied: 'Funghi ectomicorrizici in generale (non Boletus edulis specificamente)',
    habitatStudied: 'Pinete (Pinus spp.)',
    geographicArea: 'Spagna/area mediterranea occidentale',
    observationPeriod: 'Non riportato nei parametri usati qui (citazione di corroborazione)',
    demonstratedVariable: 'Ritardo fra precipitazione e risposta dell\'umidita\' del suolo',
    demonstratedResult: 'Ritardo osservato fino a un mese fra pioggia e umidita\' del suolo in ambiente mediterraneo',
    transferability:
      'Clima mediterraneo pertinente, ma specie e habitat diversi (ectomicorrizici generici in ' +
      'pineta, non porcino in faggeta/querceto). Usata solo per corroborare l\'ordine di grandezza ' +
      'della finestra idrica di 26 giorni, non come fonte primaria di nessun parametro.',
    status: 'applicable-with-caution',
    userCaution: 'Studio sui funghi micorrizici in generale, non sul porcino, in pinete spagnole: un\'indicazione.',
  },
  sirCrossValidation2026: {
    speciesStudied: 'Non applicabile — non riguarda il fungo, riguarda l\'interpolazione meteo',
    habitatStudied: 'Non applicabile',
    geographicArea: 'Toscana, intorno alle sette zone di taratura',
    observationPeriod: '2026-08-08 / 2026-09-16 (40 giorni)',
    demonstratedVariable: 'Errore di interpolazione (regressione + IDW sui residui) contro la stazione piu\' vicina',
    demonstratedResult:
      'MAE pioggia 2.37 mm (+9.7% rispetto alla stazione piu\' vicina), massima 0.96 C (+56.9%), ' +
      'minima 1.50 C (+16.6%), bias trascurabile su tutte e tre',
    transferability:
      'E\' la misura piu\' diretta possibile: sulle nostre zone, sui nostri dati, non serve ' +
      'trasferire nulla. Riguarda pero\' la qualita\' del dato meteo in ingresso, non il modello ' +
      'biologico: dice quanto fidarsi della temperatura o della pioggia stimata, non di quanto ' +
      'porcini ci siano.',
    status: 'applicable',
  },
} as const

/** Trova la valutazione dell'evidenza a partire dal testo di citazione salvato in `Param.source`. */
const EVIDENCE_BY_CITATION_TEXT: ReadonlyMap<string, EvidenceAssessment> = new Map(
  (Object.keys(REFERENCES) as Array<keyof typeof REFERENCES>).map((key) => [
    REFERENCES[key],
    EVIDENCE[key],
  ]),
)

export function evidenceForSource(source: string | undefined): EvidenceAssessment | undefined {
  return source === undefined ? undefined : EVIDENCE_BY_CITATION_TEXT.get(source)
}

/**
 * La riga di cautela da mostrare accanto a una fonte, oppure `undefined` se la fonte vale cosi'
 * com'e'. Cerca per testo di citazione, come `evidenceForSource`: la scheda la usa sulla fonte
 * salvata nello snapshot invece del testo di cautela salvato insieme, cosi' anche gli snapshot gia'
 * pubblicati (che contengono ancora il ragionamento completo) mostrano la versione breve.
 */
export function userCautionForSource(source: string | undefined): string | undefined {
  const evidence = evidenceForSource(source)
  return evidence === undefined || evidence.status === 'applicable' ? undefined : evidence.userCaution
}

// ============================================================================
// BILANCIO IDRICO
// ============================================================================

export interface WaterConfig {
  /** Giorni di storia considerati nel bilancio. */
  readonly windowDays: Param
  /** Decadimento giornaliero di base, prima dei modulatori. */
  readonly lambdaBase: Param
  /** Sensibilita' del decadimento alla temperatura, per grado sopra il riferimento. */
  readonly lambdaTempCoeff: Param
  /** Temperatura di riferimento del decadimento. */
  readonly lambdaTempRef: Param
  /** Sensibilita' del decadimento a ET0, normalizzata sul valore di riferimento. */
  readonly lambdaEt0Coeff: Param
  readonly lambdaEt0Ref: Param
  /** Sensibilita' del decadimento al vento. */
  readonly lambdaWindCoeff: Param
  readonly lambdaWindRef: Param
  /** Moltiplicatore del decadimento sotto chioma densa (< 1: l'acqua dura di piu'). */
  readonly canopyShelter: Param
  /** Moltiplicatore del decadimento sui versanti esposti a sud (> 1: asciuga prima). */
  readonly southFacingPenalty: Param
  /** Acqua efficace che corrisponde al punteggio pieno, su suolo gia' umido. */
  readonly referenceMm: Param
  /**
   * Esponente della curva idrica. Sopra 1 penalizza la parte bassa della scala, mantenendo
   * la monotonia: piu' acqua da' sempre un punteggio piu' alto, anche fra due situazioni
   * entrambe sfavorevoli.
   */
  readonly shapeExponent: Param
  /** Deficit iniziale massimo, quando il suolo parte completamente secco. */
  readonly maxInitialDeficitMm: Param
  /** Umidita' del suolo (m3/m3) sopra cui il deficit iniziale e' nullo. */
  readonly wetSoilThreshold: Param
  /** Umidita' del suolo sotto cui il deficit iniziale e' massimo. */
  readonly drySoilThreshold: Param
  /**
   * Tetto del termine idrico. Sopra 1 perche' due studi indipendenti non trovano una soglia
   * superiore di precipitazione: piu' pioggia continua ad aiutare, con rendimento decrescente.
   */
  readonly cap: Param
}

// ============================================================================
// INNESCO DA EVENTO INTENSO
// ============================================================================

/**
 * La buttata, e il suo ritardo.
 *
 * Il bilancio idrico a 26 giorni descrive lo **stato** del suolo. Non descrive la buttata, che e'
 * un evento: piove forte, e una decina di giorni dopo il bosco si riempie. Sono due cose diverse
 * e servono entrambe.
 *
 * Questo blocco ha la fonte migliore di tutto il modello, e non e' tedesca: Salerni, Paoli e
 * Perini hanno monitorato Boletus edulis per tre anni **sul Monte Amiata, ad Abbadia San
 * Salvatore, a 1050 m**, cioe' dentro una delle nostre sette zone, usando gli stessi dati SIR che
 * usiamo noi.
 *
 * LIMITE STRUTTURALE, DICHIARATO.
 *
 * Questo termine alza il punteggio nella finestra giusta — al giorno 12 il guadagno e' massimo,
 * circa il 35 % — ma **non sposta il massimo della curva**, che resta subito dopo la pioggia
 * perche' il bilancio idrico decade in modo monotono dal primo giorno. Misurato: senza innesco il
 * punteggio va da 52.7 a 19.4 fra il secondo e il ventesimo giorno, con innesco da 53.5 a 20.3,
 * e in entrambi i casi il massimo e' al secondo.
 *
 * Per riprodurre davvero il picco misurato al dodicesimo giorno serve un cambiamento di struttura,
 * non un ritocco di questo peso: dopo una pioggia forte il suolo si satura e **resta** carico per
 * qualche giorno prima di iniziare a perdere acqua, mentre il nostro decadimento esponenziale
 * parte subito. Nessun valore del peso puo' compensarlo, e alzarlo fino a farlo sembrare giusto
 * significherebbe far dire alla tempistica piu' di quanto la fonte dica.
 *
 * Il diario uscite e' il modo per decidere quale delle due forme descrive meglio la realta'.
 */
export interface TriggerConfig {
  /** Pioggia giornaliera oltre cui l'evento e' "intenso". */
  readonly intenseEventMm: Param
  /** Giorni fra l'evento e il picco di fruttificazione. */
  readonly lagDays: Param
  /** Larghezza della finestra attorno al picco, in giorni. */
  readonly lagSigmaDays: Param
  /** Quanto l'innesco puo' alzare il punteggio, in frazione. */
  readonly weight: Param
  /**
   * Quota della parte mancante del punteggio idrico che la pioggia intensa restituisce nel pieno
   * della finestra (moltiplicata per quanto si e' vicini al picco atteso). Vedi `computeMpi` e la
   * nota della versione 1.5.0.
   */
  readonly waterRelief: Param
}

// ============================================================================
// IDONEITA' TERMICA
// ============================================================================

export interface ThermalConfig {
  /** Ampiezza della finestra su cui si media la temperatura dell'aria. */
  readonly airWindowDays: Param
  /** Ottimo termico del regime autunnale d'alta quota. */
  readonly optAutumnC: Param
  /** Ottimo termico del regime estivo di bassa quota. */
  readonly optSummerC: Param
  /** Larghezza della campana di idoneita' SOTTO l'ottimo, in gradi. */
  readonly sigmaC: Param
  /**
   * Larghezza della campana di idoneita' SOPRA l'ottimo, in gradi.
   *
   * Deliberatamente piu' larga di `sigmaC`: vedi il commento su `asymmetricGaussian` in
   * `model/mpi.ts` e la nota su questo valore piu' sotto.
   */
  readonly sigmaWarmC: Param
  /** Ampiezza della finestra sulla temperatura del suolo. */
  readonly soilWindowDays: Param
  readonly soilOptC: Param
  readonly soilSigmaC: Param
  /** Peso della temperatura del suolo rispetto a quella dell'aria. */
  readonly soilWeight: Param
}

// ============================================================================
// STAGIONALITA'
// ============================================================================

export interface PhenologyConfig {
  /** Giorno dell'anno del picco estivo. */
  readonly summerPeakDay: Param
  readonly summerSigmaDays: Param
  /** Giorno dell'anno del picco autunnale. */
  readonly autumnPeakDay: Param
  readonly autumnSigmaDays: Param
  /** Quota sotto cui domina il regime estivo. */
  readonly lowElevationM: Param
  /** Quota sopra cui domina il regime autunnale. */
  readonly highElevationM: Param
  /** Valore minimo del fattore stagionale: fuori stagione il potenziale non e' mai esattamente zero. */
  readonly floor: Param
  /** Peso dell'anomalia climatica rispetto alla normale della cella. */
  readonly anomalyWeight: Param
}

// ============================================================================
// PENALITA'
// ============================================================================

export interface PenaltyConfig {
  readonly frost: PenaltySpec
  readonly heat: PenaltySpec
  readonly vpd: PenaltySpec
  readonly wind: PenaltySpec
  /** Impennata della massima rispetto alla media del periodo: inibisce. Ha una fonte toscana. */
  readonly heatShock: PenaltySpec
  /** Calo termico seguito da stabilizzazione: nessun supporto di campo trovato, peso zero. */
  readonly thermalShock: PenaltySpec
}

export interface PenaltySpec {
  /** Soglia oltre la quale la penalita' inizia ad agire. */
  readonly threshold: Param
  /** Valore minimo del moltiplicatore: una penalita' riduce, non azzera. */
  readonly floor: Param
  /** Peso complessivo: a 0 la penalita' e' calcolata e registrata ma non applicata. */
  readonly weight: Param
}

// ============================================================================
// CONFIDENCE
// ============================================================================

export interface ConfidenceConfig {
  /** Distanza a cui il contributo di una stazione scende a 1/e, per variabile. */
  readonly distanceScaleKm: Readonly<Record<string, Param>>
  /** Dislivello a cui il contributo scende a 1/e. */
  readonly elevationScaleM: Param
  /** Numero di stazioni a cui il contributo di densita' si considera saturo. */
  readonly densitySaturation: Param
  /** Orizzonte previsionale a cui il contributo scende a 1/e. */
  readonly horizonScaleDays: Param
  /** Fattori di qualita' per provenienza. */
  readonly provenanceQuality: Readonly<Record<string, Param>>
}

// ============================================================================
// INTERPOLAZIONE SPAZIALE
// ============================================================================

export interface SpatialConfig {
  /**
   * Quanti chilometri "vale" un metro di dislivello nella distanza efficace.
   *
   * E' il parametro che risolve il caso Garfagnana: la stazione piu' vicina e' a 2.6 km ma
   * 502 m piu' in basso, quella giusta a 2.7 km e 169 m di dislivello. Con 0.01 km/m, cento
   * metri di quota pesano come un chilometro di distanza e la seconda vince.
   */
  readonly elevationPenaltyKmPerM: Param
  /** Esponente dell'inverso della distanza nell'interpolazione dei residui. */
  readonly idwPower: Param
  /** Raggio di ricerca delle stazioni, in distanza efficace. */
  readonly searchRadiusKm: Param
  /** Numero massimo di stazioni usate per un punto. */
  readonly maxNeighbours: Param
  /** Stazioni minime sotto cui non si stima il trend e si ricade sul modello. */
  readonly minStationsForTrend: Param
  /** Regolarizzazione della regressione, per non esplodere quando i predittori sono collineari. */
  readonly ridge: Param
  /**
   * Gradiente termico verticale di ripiego, in gradi per metro.
   * Si usa solo quando le stazioni disponibili non bastano a stimarlo dai dati.
   */
  readonly fallbackLapseRateCPerM: Param
  /** Distanza efficace oltre cui il peso dell'osservato scende sotto quello del modello. */
  readonly fusionHalfDistanceKm: Param
}

// ============================================================================
// HABITAT — IL BOSCO
// ============================================================================

/**
 * Il termine che fa pesare il bosco misurato sul punteggio.
 *
 * **Nessun valore qui e' misurato in letteratura, e nessuno finge di esserlo.** Sono tutti
 * `calibrate`: la letteratura dice *quali* piante ospitano il porcino, e su quello i numeri qui
 * sotto si appoggiano, ma nessuno studio dice "una faggeta produce 1.4 volte una pineta a parita'
 * di meteo". Quel rapporto e' esattamente cio' che il diario uscite potra' misurare.
 *
 * Il dato in ingresso e' la mappa dei generi arborei ForestPaths (10 m, 2020, CC BY 4.0,
 * DOI 10.5281/zenodo.13341104), campionata su un disco attorno al punto della zona: vedi
 * `src/lib/sources/forest-genus.ts` e `scripts/ingest-forest-italia.ts`.
 */
export interface HabitatConfig {
  /** Copertura di bosco oltre la quale il termine non toglie piu' nulla, 0-1. */
  readonly coverReference: Param
  /** Moltiplicatore minimo della copertura: quanto resta a una zona quasi spoglia. */
  readonly coverFloor: Param
  /** Peso del termine di copertura. A 0 viene calcolato e mostrato, ma non applicato. */
  readonly coverWeight: Param
  /** Peso del termine di ospite. A 0 viene calcolato e mostrato, ma non applicato. */
  readonly hostWeight: Param
  /** Idoneita' di un tipo di bosco che la tabella non conosce: neutra per scelta. */
  readonly hostUnknown: Param
  /**
   * Quanto scende la **confidence** quando il bosco sta nelle classi generiche della mappa.
   * Non tocca il punteggio: l'incertezza della fonte non e' un bosco peggiore.
   */
  readonly ambiguousCertainty: Param
  /** Idoneita' come ospite, per tipo di bosco della legenda ForestPaths. */
  readonly host: Readonly<Record<string, Param>>
}

export interface AlgorithmConfig {
  readonly version: string
  readonly water: WaterConfig
  readonly trigger: TriggerConfig
  readonly thermal: ThermalConfig
  readonly phenology: PhenologyConfig
  readonly penalties: PenaltyConfig
  readonly habitat: HabitatConfig
  readonly confidence: ConfidenceConfig
  readonly spatial: SpatialConfig
}

/**
 * MPI v1.
 *
 * I due parametri meglio fondati dell'intero modello sono la finestra termica di 20 giorni con
 * ottimo a 13 gradi e la finestra di precipitazione di 26 giorni senza soglia superiore. Vengono
 * da dieci anni di censimento giornaliero di sporocarpi in faggeta, con selezione delle finestre
 * per AIC su tutte le combinazioni fra 2 e 35 giorni.
 *
 * Quasi tutto il resto e' da calibrare, ed e' dichiarato come tale.
 *
 * v1.2.0: disattivati due doppi conteggi del vento sul potenziale — il termine diretto nel
 * bilancio idrico (ridondante con ET0, che include gia' il vento) e la penalita' che lo
 * mescolava con la sicurezza dell'uscita, ora un segnale separato. Vedi i commenti su
 * `water.lambdaWindCoeff` e `penalties.wind`.
 *
 * v1.3.0: campana termica resa asimmetrica (`thermal.sigmaWarmC`). Segnalazione dal campo (20
 * settembre 2026): con notti gia' fresche (10-15 gradi) e giornate calde ma non estreme (28-32),
 * la media a 20 giorni finiva 18-20 gradi e la vecchia campana simmetrica (sigma 4.2 sia sopra che
 * sotto l'ottimo) tagliava il punteggio termico a meta' o meno — "Temperatura" risultava il
 * fattore limitante in 4 zone su 7 lo stesso giorno. Sotto l'ottimo la fonte (`brejon2026`) misura
 * la fruttificazione "quasi assente" gia' pochi gradi sotto: li' la campana resta stretta com'era.
 * Sopra l'ottimo la fonte non dice altrettanto — ed e' un bosco di faggio d'Europa centrale, non
 * l'Appennino mediterraneo dove le giornate calde sono la norma — e il caldo vero ha gia' due
 * penalita' dedicate (`penalties.heat`, `penalties.heatShock`) che intervengono per conto proprio:
 * non serve che la campana termica lo penalizzi una seconda volta. `sigmaWarmC` resta un valore da
 * calibrare, non una misura.
 *
 * v1.4.0: entra il **bosco** (`habitat`). Fino a qui il punteggio conosceva soltanto meteo, quota
 * e stagione: due zone con lo stesso meteo prendevano lo stesso numero anche se una era faggeta
 * all'80 per cento e l'altra un altopiano spoglio. Per una specie micorrizica era il limite piu'
 * grosso del modello, piu' grosso di qualunque soglia sbagliata, e si vedeva nella classifica
 * nazionale: il 21 settembre 2026, 230 zone su 1.202 segnavano esattamente 100. Ora il bosco
 * misurato su tutte le zone (ForestPaths) entra con due termini distinti — quanto bosco c'e' e
 * che bosco e' — applicati dopo la saturazione, perche' il posto non cambia col giorno. Dove la
 * mappa e' generica il punteggio non scende: scende la confidence. Vedi `src/lib/model/forest.ts`.
 */
export const ALGORITHM_V1: AlgorithmConfig = {
  /*
   * 1.5.0 (24/09/2026): la pioggia intensa di due settimane prima non viene piu' annullata dal
   * terreno che nel frattempo si e' asciugato. Motivo e dato: `trigger.waterRelief`.
   */
  version: '1.5.0-porcino',

  water: {
    windowDays: sourced(
      26,
      REFERENCES.brejon2026,
      'preprint',
      'Finestra selezionata per AIC fra 2 e 35 giorni. Coerente con Karavani 2018, che trova ' +
        'un ritardo fino a un mese fra precipitazione e umidita\' del suolo in ambiente mediterraneo.',
    ),
    lambdaBase: calibrate(
      0.055,
      'Con i modulatori a 1 corrisponde a un tempo di dimezzamento di circa 12-13 giorni, ' +
        'compatibile con una finestra utile di 26 giorni.',
    ),
    lambdaTempCoeff: calibrate(0.045, 'Il decadimento accelera col caldo.'),
    lambdaTempRef: sourced(
      13,
      REFERENCES.brejon2026,
      'preprint',
      'Usiamo l\'ottimo termico misurato come riferimento del decadimento, invece di un valore ' +
        'arbitrario: sopra questa soglia il suolo perde acqua piu\' in fretta di quanto il ' +
        'micelio possa sfruttarla.',
    ),
    lambdaEt0Coeff: calibrate(
      0.6,
      'E\' il termine che il modello baseline non ha affatto, e che spiega perche\' una buona ' +
        'pioggia puo\' essere annullata da giorni caldi e ventosi.',
    ),
    lambdaEt0Ref: calibrate(3.5, 'ET0 giornaliera tipica di settembre in Appennino, in mm.'),
    /*
     * DISATTIVATO (valore 0): era un secondo termine di vento nel decadimento, ridondante con
     * ET0. `et0_fao_evapotranspiration` (Open-Meteo) e' calcolato con Penman-Monteith FAO-56, la
     * cui formula usa la velocita' del vento a 2 m come input diretto: il vento sta gia' dentro
     * `lambdaEt0Coeff` per la via fisicamente corretta (piu' vento -> ET0 piu' alta -> decadimento
     * piu' rapido). Sommarci sopra un secondo moltiplicatore di vento — questo, quello che c'era
     * qui — contava lo stesso vento due volte sullo stesso bilancio idrico.
     *
     * Resta calcolato (`dailyDecay` lo applica ancora, a moltiplicatore neutro con valore 0) per
     * lo stesso motivo di `thermalShock`: se in futuro si trovasse un canale fisico realmente
     * separato da ET0 — ad esempio l'essiccamento della lettiera superficiale, che risponde al
     * vento piu' in fretta della riserva idrica del suolo che ET0 descrive — il confronto storico
     * resta possibile senza dover ricalcolare tutto da capo.
     */
    lambdaWindCoeff: calibrate(
      0,
      'Disattivato: ridondante con ET0, che include gia\' il vento (Penman-Monteith FAO-56). ' +
        'Vedi il commento sopra per il dettaglio.',
    ),
    lambdaWindRef: calibrate(3.0),
    canopyShelter: calibrate(0.8, 'Sotto chioma densa l\'evaporazione e\' ridotta.'),
    southFacingPenalty: calibrate(1.25, 'I versanti a sud asciugano prima.'),
    referenceMm: calibrate(
      55,
      'Acqua efficace che corrisponde al punteggio idrico pieno su suolo gia\' umido. ' +
        'Non e\' una soglia di pioggia: il fabbisogno cresce col deficit iniziale, quindi su ' +
        'terreno secco ne servono un centinaio.',
    ),
    shapeExponent: calibrate(
      1.5,
      'Scelto per mantenere la scala discriminante in basso senza mai azzerarla. Con la ' +
        'sottrazione secca che avevo scritto prima, cinque zone su sette davano esattamente 0.0 ' +
        'il 17 settembre 2026 e diventavano indistinguibili fra loro: e\' lo stesso salto ' +
        'binario che rimprovero al modello baseline.',
    ),
    maxInitialDeficitMm: calibrate(
      45,
      'Quanto in piu\' serve quando il terreno parte secco. E\' il meccanismo che rende la ' +
        'soglia funzione dell\'umidita\' di partenza invece che un numero fisso.',
    ),
    wetSoilThreshold: calibrate(0.32, 'm3/m3 sopra cui il suolo e\' gia\' carico.'),
    drySoilThreshold: calibrate(0.14, 'm3/m3 sotto cui il suolo e\' molto secco.'),
    cap: sourced(
      1.15,
      REFERENCES.brejon2026,
      'preprint',
      'La precipitazione ha effetto lineare senza soglia superiore identificata. Il tetto sopra ' +
        '1 riflette che piu\' pioggia continua ad aiutare, con rendimento decrescente.',
    ),
  },

  trigger: {
    intenseEventMm: sourced(
      20,
      REFERENCES.salerni2023,
      'peer-reviewed',
      'Indice R20 dell\'ETCCDI, giorni con precipitazione molto intensa. E\' la soglia con cui lo ' +
        'studio dell\'Amiata definisce l\'evento estremo, non un numero scelto da noi.',
    ),
    lagDays: sourced(
      12,
      REFERENCES.salerni2023,
      'peer-reviewed',
      'Effetto positivo della pioggia intensa massimo al dodicesimo giorno successivo all\'evento, ' +
        'misurato sull\'Amiata. Coerente con Salerni et al. 2002, che nei querceti della Toscana ' +
        'meridionale trovava il massimo di specie fruttificanti a dieci giorni dalla pioggia.',
    ),
    lagSigmaDays: calibrate(
      4,
      'La larghezza non e\' misurata: lo studio riporta correlazioni significative sparse fra il ' +
        'secondo e il diciannovesimo giorno, quindi la finestra e\' ampia, ma quanto e\' da calibrare.',
    ),
    weight: calibrate(
      0.35,
      'Quanto l\'innesco alza il punteggio. La direzione e il ritardo hanno una fonte, ' +
        'l\'ampiezza no.',
    ),
    /*
     * Il primo parametro tarato su un'osservazione sul campo, non su un ragionamento.
     *
     * Il 23 e 24 settembre 2026 nel Mugello si trovavano porcini in abbondanza (segnalazione
     * certa del proprietario del progetto; in tutta la Toscana voci concordi, senza luoghi
     * precisi). Il modello 1.4.0 dava 12/100, «condizioni sfavorevoli»: dopo i 36 mm del 10
     * settembre il bilancio idrico, con un dimezzamento di circa 12 giorni e il fabbisogno
     * alzato a 100 mm perche' il terreno partiva secco, contava 27 mm efficaci e il fattore acqua
     * scendeva a 0.14, schiacciando per moltiplicazione tutto il resto — compreso l'innesco,
     * che pure segnalava il picco atteso proprio quei giorni.
     *
     * Nessun ritocco ai parametri del bilancio bastava (provati: senza deficit iniziale,
     * decadimento dimezzato, innesco a peso pieno, e le combinazioni: il Mugello restava sotto
     * 25). Il difetto e' di struttura: la fruttificazione segue la pioggia intensa con un ritardo
     * (Salerni 2023, 12 giorni, fonte peer-reviewed gia' in `lagDays`), e in quel ritardo il
     * suolo superficiale si asciuga per forza. Un bilancio che lo punisce contraddice la fonte
     * stessa dell'innesco. Qui, nella finestra, la pioggia intensa restituisce questa quota di cio'
     * che manca al fattore acqua, in proporzione alla vicinanza al picco: fuori finestra non cambia
     * niente, e piu' acqua resta sempre meglio di meno acqua.
     *
     * Il valore e' tarato su un solo luogo e due giorni: e' un'ipotesi da verificare con le
     * uscite del diario, non una misura.
     */
    waterRelief: calibrate(
      0.8,
      'Tarato sul Mugello, 23-24 settembre 2026 (porcini abbondanti con 12/100 del modello 1.4.0): ' +
        'nella finestra dopo una pioggia intensa l\'acqua non azzera piu\' il punteggio.',
    ),
  },

  thermal: {
    airWindowDays: sourced(
      20,
      REFERENCES.brejon2026,
      'preprint',
      'Finestra selezionata per AIC. La temperatura e\' il predittore a breve termine principale.',
    ),
    optAutumnC: sourced(
      13,
      REFERENCES.brejon2026,
      'preprint',
      'Ottimo della relazione quadratica, stabile entro 0.6 gradi fra tre modelli. Fruttificazione ' +
        'concentrata fra 10 e 15 gradi di media a 20 giorni, quasi assente fra 5 e 10.',
    ),
    optSummerC: calibrate(
      19,
      'Regime estivo di bassa quota. NESSUNA FONTE: lo studio disponibile riguarda la faggeta ' +
        'autunnale d\'Europa centrale, e trasferirne i parametri alle cerrete toscane di giugno ' +
        'sarebbe l\'errore peggiore possibile. Da calibrare col diario uscite.',
    ),
    sigmaC: calibrate(
      4.2,
      'Lato FREDDO della campana (sotto l\'ottimo). Scelta perche\' riproduce la zona di ' +
        'fruttificazione osservata, 10-15 gradi, come intervallo entro cui il fattore resta sopra ' +
        '0.75 — coerente con la fonte, che misura la fruttificazione quasi assente gia\' fra 5 e 10.',
    ),
    sigmaWarmC: calibrate(
      7.5,
      'Lato CALDO della campana (sopra l\'ottimo), volutamente piu\' largo del lato freddo. La ' +
        'fonte non misura un crollo altrettanto netto sopra l\'ottimo, ed e\' comunque un bosco di ' +
        'faggio d\'Europa centrale: l\'Appennino mediterraneo ha giornate calde per norma, non per ' +
        'eccezione. Il caldo vero resta comunque penalizzato per conto proprio da ' +
        '`penalties.heat` e `penalties.heatShock`, quindi non serve che anche questa campana lo ' +
        'punisca due volte. Introdotto il 20 settembre 2026 perche\' con notti gia\' fresche ' +
        '(10-15 gradi) e giornate calde ma non estreme (28-32) la campana simmetrica dimezzava il ' +
        'punteggio termico di 4 zone su 7 nello stesso giorno.',
    ),
    soilWindowDays: calibrate(7),
    soilOptC: calibrate(14, 'Leggermente sopra l\'ottimo dell\'aria: il suolo e\' piu\' inerte.'),
    soilSigmaC: calibrate(5),
    soilWeight: calibrate(
      0.35,
      'La temperatura del suolo e\' modellata, non osservata: pesa meno di quella dell\'aria, ' +
        'che sulle zone di taratura viene da stazioni reali.',
    ),
  },

  phenology: {
    summerPeakDay: calibrate(200, 'Circa il 19 luglio.'),
    summerSigmaDays: calibrate(35),
    autumnPeakDay: sourced(
      273,
      REFERENCES.habitatItalia,
      'grey',
      'Il porcino autunnale in faggeta ha il massimo fra settembre e ottobre: il picco cade ' +
        'attorno al 30 settembre. Prima era il 15 ottobre, scelto da me senza riferimenti.',
    ),
    autumnSigmaDays: calibrate(30),
    lowElevationM: sourced(
      700,
      REFERENCES.habitatItalia,
      'grey',
      'I porcini estivi si trovavano fra 500 e 700 m e negli ultimi decenni sono saliti di ' +
        '200-300 m: 700 e\' il limite superiore storico della fascia estiva.',
    ),
    highElevationM: sourced(
      900,
      REFERENCES.habitatItalia,
      'grey',
      'La faggeta fra 900 e 1400 m e\' l\'habitat classico del porcino autunnale: da 900 in su ' +
        'domina quel regime. Prima avevo messo 1100, senza alcun riferimento.',
    ),
    floor: calibrate(
      0.05,
      'Fuori stagione il potenziale non e\' esattamente zero: un modello che azzera nasconde ' +
        'le annate anomale, che sono proprio quelle interessanti.',
    ),
    anomalyWeight: calibrate(
      0.2,
      'L\'anomalia rispetto alla normale della cella modula, non sostituisce il bilancio idrico, ' +
        'che gia\' cattura gran parte dell\'effetto tramite il deficit iniziale.',
    ),
  },

  penalties: {
    frost: {
      threshold: calibrate(-1, 'Minima sotto cui la gelata inizia a pesare, in gradi.'),
      floor: calibrate(
        0.25,
        'Una gelata riduce fortemente ma non annulla: danneggia i carpofori esistenti piu\' di ' +
          'quanto azzeri il potenziale del micelio.',
      ),
      weight: calibrate(1),
    },
    heat: {
      threshold: calibrate(30, 'Massime sopra cui si conta lo stress da caldo.'),
      floor: calibrate(0.5),
      weight: calibrate(1),
    },
    vpd: {
      threshold: calibrate(1.6, 'Deficit di pressione di vapore medio a 7 giorni, in kPa.'),
      floor: calibrate(0.7),
      weight: calibrate(1),
    },
    /*
     * DISATTIVATA (peso 0): il vento come penalita' diretta al potenziale ecologico confondeva
     * due domande diverse — "le condizioni sono compatibili con la fruttificazione?" e "e'
     * prudente uscire con questo vento?" — nella stessa cifra. Un'area con ottime condizioni ma
     * vento forte previsto diventava indistinguibile da un'area davvero sfavorevole: l'utente non
     * poteva più sapere se "conviene aspettare" o "conviene andare ma con attenzione". La
     * sicurezza ora e' un segnale separato, mai moltiplicato nell'MPI — vedi
     * `src/lib/model/wind.ts` e `SnapshotZone.windSafety`.
     *
     * Resta calcolata (come le altre penalita' disattivate) per il confronto storico. La soglia
     * sotto e' inoltre imprecisa quanto dichiarata: il dato di Open-Meteo usato qui
     * (`wind_speed_10m_max`) e' il **massimo** giornaliero, non una media — la media dei massimi
     * di sette giorni e' sistematicamente piu' alta di una vera media settimanale del vento.
     */
    wind: {
      threshold: calibrate(
        6,
        'Soglia sulla media dei MASSIMI giornalieri a 7 giorni (non una vera media del vento), ' +
          'in m/s — vedi il commento sopra.',
      ),
      floor: calibrate(0.8),
      weight: calibrate(
        0,
        'Disattivata: il vento non deve abbassare il potenziale ecologico, solo informare un ' +
          'segnale di sicurezza separato. Vedi il commento sopra.',
      ),
    },
    /*
     * Shock di CALDO, non di freddo. E qui devo correggere me stesso.
     *
     * Avevo concluso che lo shock termico non avesse supporto di campo, basandomi su uno studio
     * tedesco che non lo testava. Lo studio sull'Amiata lo testa eccome, e trova un effetto
     * chiaro: un'impennata della temperatura massima di circa 8 gradi sopra la media del periodo
     * **inibisce** la produzione di B. edulis, con correlazioni negative significative al quarto,
     * quattordicesimo e diciannovesimo giorno successivo.
     *
     * Il segno e' opposto a quello che la specifica di progetto ipotizzava: non e' il calo che
     * innesca, e' l'impennata che blocca.
     *
     * LIMITE NOTO, non catturato dal modello (dichiarato il 21 settembre 2026).
     * Nello studio l'inibizione vale nei siti non diradati o diradati poco. Dove il diradamento
     * e' stato forte, la temperatura alta sembra invece FAVORIRE la produzione, a partire dal
     * ventesimo giorno dall'evento. Noi applichiamo la penalita' uguale ovunque, perche' non
     * sappiamo quanto sia diradato il bosco di una cella: `water.canopyDensity` esiste nel
     * modello ma e' sempre nullo, in mancanza di una maschera forestale reale. Quindi su un
     * bosco molto aperto questa penalita' puo' avere il segno sbagliato. Si corregge quando
     * arrivera' la copertura forestale vera, non prima — vedi docs/CATALOGO-FONTI.md.
     */
    heatShock: {
      threshold: sourced(
        8,
        REFERENCES.salerni2023,
        'peer-reviewed',
        'Aumento improvviso della massima rispetto alla media del periodo, in gradi. Vale nei ' +
          'siti poco o nulla diradati: vedi il limite dichiarato nel commento sopra.',
      ),
      floor: calibrate(0.55, 'L\'entita\' dell\'inibizione non e\' quantificata nello studio.'),
      weight: calibrate(1),
    },
    thermalShock: {
      threshold: calibrate(5, 'Calo termico in gradi su tre giorni, seguito da stabilizzazione.'),
      floor: calibrate(1),
      weight: calibrate(
        0,
        'DISATTIVATA. Lo shock da RAFFREDDAMENTO resta senza supporto: non compare fra i ' +
          'predittori degli studi di campo consultati, e le prove sperimentali riguardano ' +
          'saprotrofi coltivati. Viene comunque calcolata e registrata a peso zero, cosi\' quando ' +
          'il diario avra\' abbastanza uscite il confronto sara\' possibile senza ricalcolare il ' +
          'passato. Da non confondere con heatShock, che ha una fonte e agisce.',
      ),
    },
  },

  habitat: {
    coverReference: calibrate(
      0.4,
      'Oltre il 40% di bosco attorno al punto il termine non toglie nulla. Non e\' una soglia ' +
        'biologica: e\' la quota oltre la quale, sul campione di 1.202 zone italiane, "qui c\'e\' ' +
        'bosco" smette di distinguere — la copertura mediana e\' 70%, e sopra il 40% ci sta la ' +
        'grande maggioranza delle zone di montagna.',
    ),
    coverFloor: calibrate(
      0.6,
      'Quanto resta del punteggio a una zona quasi spoglia. NON zero, e il motivo e\' il dato, non ' +
        'la biologia: misuriamo un disco di 3 km attorno a un punto, non il comune intero, quindi ' +
        'poco bosco li\' non vuol dire nessun bosco in zona. Azzerare vorrebbe dire far sparire ' +
        'dalla classifica un posto che magari ha la faggeta a quattro chilometri.',
    ),
    coverWeight: calibrate(1, 'A 0 il termine si calcola e si mostra, ma non agisce.'),
    hostWeight: calibrate(1, 'A 0 il termine si calcola e si mostra, ma non agisce.'),
    hostUnknown: calibrate(
      1,
      'Un tipo di bosco che questa tabella non conosce resta neutro. Penalizzarlo vorrebbe dire ' +
        'togliere punti per ignoranza nostra: quel caso si paga sulla confidence, non sul punteggio.',
    ),
    ambiguousCertainty: calibrate(
      0.85,
      'Confidence che resta a una zona il cui bosco sta tutto nelle classi generiche della mappa ' +
        '("altre latifoglie", "altre conifere"). Non tocca il punteggio.',
    ),
    /*
     * La tabella degli ospiti.
     *
     * Il porcino in senso lato sono quattro specie con piante ospiti diverse, e la mappa ci dice
     * il genere dominante: e\' il primo pezzo di "che bosco e\'" che il modello abbia mai avuto.
     * I valori sono relativi fra loro, non assoluti: 1 vuol dire "ospite classico, non tolgo
     * niente", non "qui ci sono i funghi".
     */
    host: {
      faggeta: calibrate(
        1,
        'Ospite classico del porcino autunnale, ed e\' il bosco della fonte su cui sono tarati ' +
          'la finestra termica e l\'ottimo di 13 gradi (brejon2026).',
      ),
      pecceta: calibrate(
        1,
        'Ospite classico in quota, sia per B. edulis sia per B. pinophilus. In Italia e\' il bosco ' +
          'da porcino delle Alpi orientali.',
      ),
      querceto: calibrate(
        1,
        'Ospite classico del porcino estivo: B. aereus e B. reticulatus stanno nei querceti, e ' +
          'salerni2002 misura proprio la fruttificazione nei querceti della Toscana meridionale.',
      ),
      pineta: calibrate(
        0.9,
        'B. pinophilus e\' letteralmente "quello del pino" e il porcino nelle pinete c\'e\'; il ' +
          'valore sta poco sotto 1 perche\' una parte delle pinete italiane sono rimboschimenti ' +
          'mediterranei di bassa quota, dove il porcino e\' molto meno costante.',
      ),
      'altre conifere': calibrate(
        0.9,
        'Sopra i 600 m in Italia questa classe e\' quasi sempre abete bianco, che e\' il bosco ' +
          'della fonte dell\'Amiata (salerni2023) e quindi un ospite ottimo. Non sta a 1 perche\' ' +
          'la stessa classe raccoglie anche cipresso, cedro e douglasia.',
      ),
      'altre latifoglie': calibrate(
        0.85,
        'Classe mista: dentro c\'e\' il castagno, fra i boschi da porcino migliori d\'Italia, ma ' +
          'anche carpino e betulla (ospiti) e ontano, pioppo e frassino (non ospiti). 0.85 e\' il ' +
          'valore atteso su quella mescolanza, non un giudizio sul castagneto.',
      ),
      lariceto: calibrate(
        0.7,
        'Il piu\' basso dei sette. Il larice non e\' un ospite classico del porcino — il suo fungo ' +
          'tipico e\' il Suillus grevillei — e dove il porcino si trova nei lariceti alpini, di ' +
          'solito ci arriva dagli abeti e dai pini mescolati dentro.',
      ),
    },
  },

  confidence: {
    distanceScaleKm: {
      // La pioggia decorrela piu' in fretta della temperatura: un temporale e' locale,
      // un'ondata di calore no. Le tre grandezze validate hanno una fonte locale (sotto); le
      // altre tre non sono state misurate e restano da calibrare.
      precipitation: sourced(
        18,
        REFERENCES.sirCrossValidation2026,
        'local-data',
        'Il MAE (2.37 mm, +9.7% sulla stazione piu\' vicina) e\' misurato; la scala in km e\' una ' +
          'scelta informata da quel numero, non una misura diretta della decorrelazione spaziale ' +
          'della pioggia — quella richiederebbe un variogramma, non ancora fatto.',
      ),
      temperature_max: sourced(
        35,
        REFERENCES.sirCrossValidation2026,
        'local-data',
        'Guadagno maggiore fra le tre grandezze (+56.9%): il gradiente verticale forte e regolare ' +
          'giustifica una scala di decorrelazione orizzontale ampia. Stesso avvertimento della ' +
          'pioggia sul valore esatto in km.',
      ),
      temperature_min: sourced(
        30,
        REFERENCES.sirCrossValidation2026,
        'local-data',
        'Guadagno piu\' modesto (+16.6%): la minima e\' dominata dall\'accumulo locale di aria ' +
          'fredda in conca, un fenomeno che nessuna scala di decorrelazione regolare cattura del ' +
          'tutto — per la gelata serve la misura, non la stima, come nota anche l\'Appendice C.',
      ),
      temperature_mean: calibrate(35, 'Non validata separatamente: eredita il valore della massima.'),
      relative_humidity_mean: calibrate(22, 'Non misurata in Appendice C.'),
      wind_speed_mean: calibrate(15, 'Non misurata in Appendice C.'),
      default: calibrate(25, 'Ripiego per grandezze non validate.'),
    },
    elevationScaleM: calibrate(
      600,
      `Volutamente largo, e molto più largo del criterio con cui si scelgono le stazioni
       (elevationPenaltyKmPerM). La differenza non è una svista: il trend della regressione
       corregge già l'effetto della quota, quindi la penalità residua nel confidence deve essere
       mite. Penalizzarla due volte era il motivo per cui una stazione a 3 km dava meno
       confidence del non avere alcuna stazione.`,
    ),
    densitySaturation: calibrate(4),
    horizonScaleDays: calibrate(9),
    provenanceQuality: {
      OBSERVED: calibrate(1),
      REANALYSIS: calibrate(0.85),
      MODELLED: calibrate(0.7),
      FORECAST: calibrate(0.6),
    },
  },

  spatial: {
    elevationPenaltyKmPerM: calibrate(
      0.01,
      'Cento metri di dislivello pesano come un chilometro di distanza. E\' il criterio con cui, ' +
        'sulle sette zone, si sceglie Orecchiella (2.7 km, 169 m) invece di Villacollemandina ' +
        '(2.6 km, 502 m).',
    ),
    idwPower: calibrate(2),
    searchRadiusKm: calibrate(60, 'In distanza efficace, quindi comprensiva del dislivello.'),
    maxNeighbours: calibrate(8),
    minStationsForTrend: calibrate(
      6,
      'Sotto questa soglia il trend non e\' stimabile e si ricade sul modello: meglio dichiarare ' +
        'un dato modellato che spacciare per osservata una regressione su quattro punti.',
    ),
    ridge: calibrate(1e-6),
    fallbackLapseRateCPerM: calibrate(
      -0.0065,
      'Gradiente termico standard di -6.5 gradi per chilometro. E\' solo un ripiego: quando le ' +
        'stazioni bastano il gradiente si stima dai dati del giorno, che in inversione termica ' +
        'puo\' anche cambiare segno.',
    ),
    fusionHalfDistanceKm: calibrate(
      20,
      'Distanza efficace a cui osservato e modellato pesano uguale.',
    ),
  },
}

/** Tutti i parametri da calibrare, per mostrarli come tali nel pannello admin. */
export function uncalibratedParams(config: AlgorithmConfig = ALGORITHM_V1): string[] {
  const out: string[] = []
  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== 'object') return
    if (isParam(node)) {
      if (node.provenance === 'calibrate') out.push(path)
      return
    }
    for (const [key, child] of Object.entries(node)) {
      walk(child, path === '' ? key : `${path}.${key}`)
    }
  }
  walk(config, '')
  return out
}

function isParam(node: object): node is Param {
  return 'value' in node && 'provenance' in node
}
