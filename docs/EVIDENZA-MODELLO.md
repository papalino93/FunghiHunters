# Evidenza del modello MPI — parametro per parametro

Ogni parametro del modello con provenienza `sourced` (cioè non ancora dichiarato "da calibrare")
è classificato qui secondo lo schema richiesto: fonte primaria, tipo di evidenza, specie e
habitat studiati, area geografica, periodo di osservazione, cosa è stato dimostrato davvero, e la
trasferibilità al porcino in Toscana con motivazione esplicita.

**Principio applicato:** un risultato osservato altrove (faggeta tedesca, pineta mediterranea, un
solo sito toscano) non diventa automaticamente una regola valida per tutta la Toscana solo perché
citato. Ogni riga sotto dichiara `applicable`, `applicable-with-caution` o
`not-applicable-without-calibration` — quest'ultimo stato è quello dei parametri lasciati
esplicitamente senza fonte (es. `thermal.optSummerC`), non elencati qui perché non hanno
citazione da valutare.

La fonte di verità di questa tabella è il codice: `src/lib/config/algorithm.ts` esporta
`EVIDENCE` (la valutazione strutturata) ed `evidenceForSource()` (il collegamento fra un
parametro e la sua valutazione). Se questo file e il codice divergono, **vince il codice** — qui
sotto è la vista leggibile, generata a mano da quella struttura il 17 settembre 2026, non generata
automaticamente: va riallineata a mano se i parametri cambiano.

## Le fonti, una per una

### Salerni, Paoli, Perini (2023) — Italian Journal of Mycology

| Campo | Valore |
|---|---|
| Tipo di evidenza | **peer-reviewed** |
| Specie studiata | *Boletus edulis* |
| Habitat studiato | Faggeta appenninica, gestione forestale nota (diradata vs. non diradata) |
| Area geografica | **Monte Amiata**, Abbadia San Salvatore (SI), 1050 m — una delle sette zone del modello |
| Periodo | 2000–2002, raccolta giornaliera in stagione |
| Dimostrato | Effetto della pioggia intensa (ritardo, ampiezza) e delle impennate di temperatura massima sulla fruttificazione |
| Risultato | Pioggia intensa (R20 ETCCDI): effetto massimo a 12 giorni. Impennata di +8 °C sulla massima rispetto alla media del periodo: inibisce, correlazioni negative a 4/14/19 giorni |
| **Stato** | **applicable** — stessa specie, stessa regione, una delle sette zone di taratura, stessi dati SIR usati in produzione |
| Parametri che la citano | `trigger.intenseEventMm` (20 mm), `trigger.lagDays` (12 giorni), `penalties.heatShock.threshold` (8 °C) |

### Brejon Lamartiniere & Hoffman (2026) — preprint bioRxiv

| Campo | Valore |
|---|---|
| Tipo di evidenza | **preprint** (non sottoposto a revisione paritaria) |
| Specie studiata | *Boletus edulis* |
| Habitat studiato | Faggeta |
| Area geografica | **Europa centrale (Germania)** — non Italia, non clima mediterraneo |
| Periodo | Un decennio di censimento giornaliero di sporocarpi |
| Dimostrato | Finestre ottimali di temperatura (20 giorni, selezione per AIC) e precipitazione (26 giorni, selezione per AIC) |
| Risultato | Relazione quadratica temperatura-fruttificazione, ottimo 13 °C, stabile entro 0.6 °C fra tre modelli; effetto lineare della pioggia cumulata su 26 giorni, senza soglia superiore |
| **Stato** | **applicable-with-caution** — metodo solido, sito non mediterraneo. Usata per il regime **autunnale d'alta quota** (stesso tipo di bosco, faggeta); esplicitamente **non usata** per il regime estivo di bassa quota |
| Parametri che la citano | `water.windowDays` (26 gg), `water.lambdaTempRef` (13 °C), `water.cap` (>1, nessuna soglia), `thermal.airWindowDays` (20 gg), `thermal.optAutumnC` (13 °C) |

**Verifica di plausibilità del valore (13 °C), fatta su richiesta esplicita, 17 settembre 2026.**
Non è un numero preso per buono solo perché citato: incrociato con altra letteratura via ricerca
(non lettura del testo integrale, che è a pagamento per quasi tutto quanto segue).

- 13 °C è la **media dell'aria su 20 giorni**, non una temperatura istantanea né una minima
  notturna: in una faggeta appenninica a 900-1400 m fra fine settembre e ottobre è un valore
  fisicamente plausibile (giorni miti, notti fresche ma sopra la soglia di gelata del modello,
  −1 °C). Non è in contraddizione con "le notti non devono essere troppo fredde": il modello ha
  una penalità di gelata separata (`penalties.frost`, soglia −1 °C) che si attiva solo sotto zero,
  non una penalità per notti semplicemente fresche.
- Uno studio indipendente su una pineta della Soria, Spagna centrale (2011-2015, de-Miguel,
  Martínez-Peña et al. — trovato via ricerca, non letto per intero, a pagamento) **non trova un
  effetto significativo della temperatura** sulla fruttificazione di *B. edulis*, mentre trova un
  effetto positivo della pioggia autunnale. Non invalida il valore di 13 °C — è un altro habitat
  (pineta, non faggeta) in un altro clima (mediterraneo continentale interno) — ma è un promemoria
  concreto che "quanto conta la temperatura" varia da sito a sito, coerente con lo stato
  `applicable-with-caution` già assegnato qui prima di questa verifica.
- Fonti divulgative italiane (3bmeteo, non peer-reviewed, non citate come fonte primaria di alcun
  parametro) riportano range termici più alti per *B. aestivalis* (15-23 °C) e *B. reticulatus*
  (minime sopra 16 °C) — specie diverse dal profilo unico "porcino" di questo modello (vedi D4 in
  `docs/DECISIONS.md`), ma coerenti con l'idea che il regime **estivo** di bassa quota (il nostro
  `optSummerC = 19`, tuttora senza fonte primaria) sia più caldo di quello autunnale d'alta quota.
  Non è una conferma quantitativa: è un segno che l'ordine di grandezza non è assurdo.

**Conclusione della verifica**: 13 °C per il regime autunnale d'alta quota non risulta implausibile
né contraddetto da altra letteratura reperibile; resta comunque `applicable-with-caution` perché
la fonte primaria è un solo sito, non mediterraneo, non ancora revisionato — esattamente come
dichiarato prima di questa verifica, non un declassamento né una promozione.

### Letteratura italiana divulgativa/manualistica

| Campo | Valore |
|---|---|
| Tipo di evidenza | **grey** (non verificabile con un DOI) |
| Specie studiata | *Boletus edulis*, distinzione tradizionale estivo/autunnale |
| Habitat studiato | Faggeta (900–1400 m, autunnale); querceto/castagneto di bassa quota (estivo) |
| Area geografica | Italia, generico |
| Periodo | Non applicabile — sintesi di conoscenza tradizionale, non uno studio con date |
| Dimostrato | Fascia altimetrica e finestra stagionale osservate, incluso lo spostamento in quota di 200–300 m degli ultimi decenni |
| Risultato | Consenso qualitativo, nessun numero con margine d'errore dichiarato |
| **Stato** | **applicable-with-caution** — utile per l'ordine di grandezza quando non esiste altro, non è una misura |
| Parametri che la citano | `phenology.autumnPeakDay` (giorno 273), `phenology.lowElevationM` (700 m), `phenology.highElevationM` (900 m) |

### Cross-validation locale dell'interpolazione (2026, non pubblicata)

| Campo | Valore |
|---|---|
| Tipo di evidenza | **local-data** — non letteratura, misura diretta sui nostri dati |
| Riguarda | Non il fungo: la qualità dell'interpolazione meteo (input del modello, non output biologico) |
| Area geografica | Toscana, attorno alle sette zone di taratura |
| Periodo | 2026-08-08 / 2026-09-16, 40 giorni, 50 stazioni SIR (134–1716 m) |
| Dimostrato | Errore di interpolazione (regressione + IDW sui residui) contro "stazione più vicina" |
| Risultato | MAE pioggia 2.37 mm (+9.7%), massima 0.96 °C (+56.9%), minima 1.50 °C (+16.6%), bias trascurabile |
| **Stato** | **applicable** — misura diretta, non serve trasferire nulla; ma riguarda la fiducia nel dato meteo, non nel modello biologico |
| Parametri che la citano | `confidence.distanceScaleKm.precipitation/temperature_max/temperature_min` |
| Riproducibile con | `npx tsx scripts/validate-interpolation.ts` — dettaglio completo in `docs/DISCOVERY-AND-ARCHITECTURE.md`, Appendice C |

### Fonti di sola corroborazione (mai fonte primaria di un parametro)

Citate nelle note per confermare l'ordine di grandezza di un parametro la cui fonte primaria è
un'altra, non come fonte diretta di nessun valore:

- **Salerni, Lagana, Perini, Loppi, De Dominicis (2002)** — Toscana meridionale, querceti,
  macrofunghi generici (non *B. edulis*). Corrobora il ritardo di 12 giorni misurato da Salerni
  2023 sull'Amiata (10 giorni su specie diverse, in un altro habitat toscano). `applicable-with-caution`.
- **Karavani et al. (2018)** — Spagna, pinete, funghi ectomicorrizici generici. Corrobora l'ordine
  di grandezza della finestra idrica di 26 giorni. `applicable-with-caution`.

## Tabella riassuntiva

| Parametro | Valore | Tier | Fonte primaria | Specie/habitat studiati | Area | Stato |
|---|---|---|---|---|---|---|
| `water.windowDays` | 26 gg | preprint | Brejon 2026 | *B. edulis*, faggeta | Germania | con cautela |
| `water.lambdaTempRef` | 13 °C | preprint | Brejon 2026 | *B. edulis*, faggeta | Germania | con cautela |
| `water.cap` | >1 (no soglia) | preprint | Brejon 2026 | *B. edulis*, faggeta | Germania | con cautela |
| `trigger.intenseEventMm` | 20 mm | peer-reviewed | Salerni 2023 | *B. edulis*, faggeta | **Amiata, Toscana** | applicabile |
| `trigger.lagDays` | 12 gg | peer-reviewed | Salerni 2023 | *B. edulis*, faggeta | **Amiata, Toscana** | applicabile |
| `thermal.airWindowDays` | 20 gg | preprint | Brejon 2026 | *B. edulis*, faggeta | Germania | con cautela |
| `thermal.optAutumnC` | 13 °C | preprint | Brejon 2026 | *B. edulis*, faggeta | Germania | con cautela |
| `phenology.autumnPeakDay` | giorno 273 | grey | Letteratura IT | *B. edulis*, faggeta | Italia (generico) | con cautela |
| `phenology.lowElevationM` | 700 m | grey | Letteratura IT | *B. edulis* | Italia (generico) | con cautela |
| `phenology.highElevationM` | 900 m | grey | Letteratura IT | *B. edulis* | Italia (generico) | con cautela |
| `penalties.heatShock.threshold` | 8 °C | peer-reviewed | Salerni 2023 | *B. edulis*, faggeta | **Amiata, Toscana** | applicabile |
| `confidence.distanceScaleKm.precipitation` | 18 km | local-data | Cross-validation SIR | n/a (meteo, non fungo) | **Toscana, 7 zone** | applicabile |
| `confidence.distanceScaleKm.temperature_max` | 35 km | local-data | Cross-validation SIR | n/a | **Toscana, 7 zone** | applicabile |
| `confidence.distanceScaleKm.temperature_min` | 30 km | local-data | Cross-validation SIR | n/a | **Toscana, 7 zone** | applicabile |

**Lettura onesta di questa tabella:** su 14 parametri con fonte, solo 5 (i due di Salerni 2023 più
le tre di cross-validation locale) sono `applicable` senza riserve, perché misurati sulla Toscana
o sulle nostre stesse zone. Gli altri 9 sono `applicable-with-caution`: buone come punto di
partenza, esplicitamente non equivalenti a una misura toscana. I restanti ~55 parametri del
modello (su 69 totali, vedi `uncalibratedParams()`) non hanno fonte e sono marcati `calibrate` —
compaiono come tali sia qui che nell'interfaccia (scheda "Perché" di ogni zona), mai spacciati per
misurati.

## Osservazioni sul campo usate per tarare il modello

Ogni osservazione che ha spostato un parametro sta qui, con data, luogo e cosa è cambiato. Sono
dati veri ma pochi: servono a correggere errori evidenti, non a validare il modello. La
validazione vera è il banco di prova su GBIF/iNaturalist (vedi `docs/VALIDAZIONE.md`) e le
uscite del diario.

| Data | Luogo | Osservazione | Modello prima | Modifica | Modello dopo |
|---|---|---|---|---|---|
| 23-24/09/2026 | Mugello (FI), ~900 m, faggeta/cerreta | Porcini abbondanti (segnalazione certa del proprietario del progetto; voci concordi in tutta la Toscana, senza luoghi precisi) | 1.4.0: 12/100, «sfavorevoli»; limite «acqua» (27 mm efficaci su 60 caduti, fabbisogno 100 mm su terreno secco) | 1.5.0: `trigger.waterRelief` = 0,8 — nella finestra 12 ± 4 giorni dopo una pioggia ≥ 20 mm (qui 36,5 mm il 10/09, stazioni SIR) il fattore acqua recupera l'80% della parte mancante | 1.5.0: 63-64/100 il 23-24/09, picco nella finestra, calo da sabato senza nuova pioggia |

**Cosa è stato provato prima di cambiare la struttura.** Solo sui parametri del bilancio idrico:
niente deficit iniziale, decadimento dimezzato, innesco a peso pieno e le loro combinazioni.
Nessuna portava il Mugello sopra 25/100 con i dati Open-Meteo, quindi il difetto era di forma: il
bilancio puniva proprio il ritardo fra pioggia e fruttificazione che la fonte dell'innesco
(Salerni 2023) misura.

**Cosa non si è cambiato.** L'ottimo termico (13 °C) e la campana termica. La ricerca del
24/09/2026 dice che 18-19 °C di media a fine settembre sono compatibili con buttate abbondanti
(Salerni 2023: massimo triennale ad agosto 2002 con 18,6 °C di media estiva) e che il lato caldo
dovrebbe forse dipendere dall'acqua (Brejon & Hoffman 2026). Sono ipotesi da verificare sul banco
di prova prima di toccare il modello.

## Dove questo compare in app

Quando un parametro con evidenza `applicable-with-caution` o `not-applicable-without-calibration`
influenza un punteggio mostrato all'utente, la scheda "Perché" di quella zona mostra la cautela di
trasferibilità accanto alla fonte — non solo "fonte: Brejon 2026", ma anche il motivo per cui
quella fonte non è una misura toscana. Vedi `src/lib/model/explain.ts` (`provenanceOf`) e
`src/components/ZoneSheet.tsx`.
