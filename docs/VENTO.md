# Vento: tre livelli, mai un numero solo

## Cosa c'era prima, e cosa c'era di sbagliato

Il modello aveva **tre** meccanismi di vento indipendenti, tutti attivi insieme sulla stessa
grandezza fisica:

1. `water.lambdaWindCoeff` — un moltiplicatore di vento dentro il decadimento del bilancio
   idrico, separato da ET0.
2. `water.lambdaEt0Coeff` — l'effetto di ET0 sul decadimento. **ET0 qui è
   `et0_fao_evapotranspiration` di Open-Meteo, calcolato con Penman-Monteith FAO-56 — una formula
   che usa la velocità del vento a 2 m come input diretto.** Il vento era già dentro questo
   numero.
3. `penalties.wind` — una penalità separata, applicata all'MPI finale, che mescolava "le
   condizioni ambientali sono compatibili" con "è prudente uscire con questo vento" nella stessa
   cifra.

Il punto (1) contava il vento una seconda volta sopra il punto (2): stesso fenomeno fisico, due
termini moltiplicativi indipendenti nello stesso bilancio. Il punto (3) confondeva due domande
diverse. Corretto in questa sessione — vedi i commenti su `water.lambdaWindCoeff` e
`penalties.wind` in `src/lib/config/algorithm.ts` per il dettaglio riga per riga, e
`ALGORITHM_V1.version` alzata a `1.2.0-porcino` perché il comportamento del modello cambia.

**Chi verifica il codice: (1) è ora disattivato (moltiplicatore sempre neutro), (3) è disattivata
(peso 0) e sostituita da un segnale separato — `src/lib/model/wind.ts` — che non tocca mai l'MPI.**

## I tre livelli richiesti, uno per uno

### 1. Effetto idrico

Non un modulo nuovo: è la scelta di **non** avere un secondo canale oltre a ET0. Documentato
matematicamente nel commento di `lambdaWindCoeff` in `config/algorithm.ts`. Se in futuro emergesse
un canale fisico genuinamente separato da ET0 — ad esempio l'essiccamento della lettiera
superficiale, che il bilancio idrico a 26 giorni non descrive bene perché troppo lento — andrebbe
reintrodotto con una fonte, non riattivato al buio.

### 2. Effetto microclimatico

**Non modellato, dichiarato come tale.** `microclimateUncertainty()` in `wind.ts` dice
esplicitamente che il vento misurato è a 10 m in campo aperto (Open-Meteo), non sotto chioma, e
che non esiste una fonte o un modello validato per correggerlo — invece di inventare un fattore di
attenuazione sotto copertura forestale senza base. La correzione più vicina che il modello ha
davvero è `canopyShelter` nel bilancio idrico, che riduce il decadimento complessivo (temperatura
+ ET0 insieme) sotto chioma densa: non è specifica del vento, ma è l'unica correzione reale
disponibile oggi.

### 3. Sicurezza e praticabilità

Due funzioni pure, mai dentro l'MPI:

- `describeWaterWind(recentMaxMs)` — informativo, spiega il contributo del vento recente
  all'asciugamento (già dentro ET0), non aggiunge una seconda penalità.
- `describeOutingWind(forecastMaxMs)` — avviso di prudenza per il giorno scelto dall'utente,
  separato dal potenziale ambientale. Messaggi mai assoluti ("il vento impedisce i funghi" non
  compare da nessuna parte).

Soglie: scala di Beaufort (OMM/WMO), **8 m/s** (inizio Beaufort 5, "vento teso") e **14 m/s**
(inizio Beaufort 7, "vento forte") — dichiarate esplicitamente come punto di partenza generico,
non calibrate sul porcino: nessuno studio reperito lega una soglia di vento specifica alla
sicurezza in bosco o alla fruttificazione.

## Un limite onesto sul dato usato oggi

Il campo Open-Meteo effettivamente richiesto è `wind_speed_10m_max` — il **massimo** giornaliero,
non una media. Il nome storico della variabile nel codice (`windMean7d`, "media 7 giorni") è
fuorviante: è la media dei *massimi* giornalieri, sistematicamente più alta di una vera media
settimanale. Corretto nei commenti di `features.ts`, `open-meteo.ts` e nell'etichetta mostrata in
UI ("media dei massimi giornalieri", non "vento medio"). Non ho rinominato il campo stesso
(`windMean7d`) in tutto il codice: sarebbe un refactor meccanico su molti file per un beneficio
marginale rispetto a correggere l'etichetta ovunque compare all'utente.

## Fonti valutate per il vento

Stesso limite di rete delle altre fonti valutate in questa sessione (vedi
`docs/CATALOGO-FONTI.md`): nessun accesso in uscita verso questi domini da questa sessione.

| Fonte | Stato | Note |
|---|---|---|
| Open-Meteo (già attiva) | **attiva**, uso limitato | Fornisce già `wind_speed_10m_max`. Non richiesto: `wind_gusts_10m_max` (raffica vera, variabile standard Open-Meteo) né componenti U/V/direzione — aggiungerli è una modifica piccola alla stessa fonte già attiva, non una nuova integrazione, ma non verificabile da questa sessione senza rete. |
| ECMWF Open Data | **da integrare, verosimilmente già raggiungibile senza nuovo adapter** | Dal 1° ottobre 2025 l'intero catalogo ECMWF è CC-BY-4.0, senza costo. Open-Meteo offre già accesso ai forecast ECMWF IFS alla risoluzione nativa di 9 km con lo stesso open-data CC-BY-4.0 — selezionabile passando `models=ecmwf_ifs025` (o simile) alla stessa API già in uso. **Prossimo passo concreto**: provare quel parametro con rete vera, non serve un nuovo adapter. |
| SIR Toscana (vento stazioni) | **da verificare** | SIR è già una fonte attiva per pioggia e temperatura. Se le stazioni pubblicano anche vento (velocità, raffica, direzione) con lo stesso GeoServer già in uso (`src/lib/sources/sir-geoserver.ts`), è un'estensione della fonte esistente, non una nuova. Non verificato in questa sessione: irraggiungibile. |
| Consorzio LaMMA | **da integrare, non verificato** | Ha una piattaforma open data reale (`dati.lamma.toscana.it`, CKAN, servizi WMS/WMTS con parametro TIME) con oltre 220 dataset, prevalentemente meteo. Non verificato se includa vento con licenza e formato utilizzabili — irraggiungibile da questa sessione. |
| ERA5-Land | **da integrare per lo storico, non per il live** | Coerente con quanto già deciso per il resto del progetto (`docs/DECISIONS.md`, D2): serve per backtest, non deve mai sostituire l'osservazione locale. Non toccato in questa sessione. |

## Cosa NON è stato fatto

- Nessuna nuova fonte di vento è stata realmente ingerita (stesso blocco di rete documentato
  altrove in questa sessione).
- Le componenti U/V sono implementate e testate (`toComponents`/`fromComponents` in `wind.ts`) ma
  non ancora collegate a un dato di direzione reale: Open-Meteo la offre
  (`winddirection_10m_dominant`), non ancora richiesta nell'adapter — non verificabile senza rete.
- Nessun backtest delle previsioni di vento contro stazioni locali: richiede dati storici di
  vento stazione per stazione, non ancora ingeriti.
- Nessuna calibrazione dell'impatto del vento sui risultati del diario: come per il resto del
  modello, serve diario reale prima di poterla fare onestamente.
