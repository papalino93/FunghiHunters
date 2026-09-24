# Validazione dell'MPI sulle presenze reali di porcino (backtest GBIF)

**Stato al 24 settembre 2026: corsa PARZIALE, risultati NON conclusivi.** Il meteo storico è
arrivato per 15 località-anno su 250 del campione: al sedicesimo download l'archivio Open-Meteo
ha risposto HTTP 429, *«Daily API request limit exceeded. Please try again tomorrow»*. Lo script
si è fermato come previsto, senza ritentare. La quota è per indirizzo IP e l'IP di uscita della
sessione è condiviso con altro traffico: il limite giornaliero era già quasi esaurito prima che
iniziassimo (abbiamo speso un peso di circa 279 su 10.000). Tutto quello che segue è quindi il
metodo completo e **un'anteprima su 16 casi e 45 controlli**, da leggere come verifica che la
catena funzioni, non come misura del modello. Come riprendere: in fondo.

Modello valutato: `ALGORITHM_V1`, versione `1.5.0-porcino` (`src/lib/config/algorithm.ts`),
senza alcuna modifica al codice di produzione.

---

## 1. La domanda

L'MPI distingue i giorni in cui qualcuno ha trovato porcini da giorni qualunque della stagione,
**nello stesso posto e nello stesso anno**, meglio di quanto faccia il solo calendario? E fra le
correzioni proposte dopo la 1.5 (estate in quota, caldo tollerato con acqua, ottimo autunnale più
alto) ce n'è una che migliora in modo misurabile?

## 2. Il disegno: caso-controllo sulle presenze

Il disegno è quello di Capinha et al. (2019, *Int J Biometeorol* 63:1015), che lo usano per
legare la fenologia di funghi e piante alle segnalazioni dei cittadini: i dati di presenza non
dicono dove i funghi **non** c'erano, quindi al posto delle assenze si confronta il giorno della
segnalazione con giorni di controllo nello stesso luogo.

- **Casi.** Occorrenze GBIF in Italia (`country=IT`) di *Boletus edulis* s.l.: *B. edulis*
  (taxonKey 5954958), *B. aereus* (8733688), *B. reticulatus* (5954691), *B. pinophilus*
  (5954949). Coordinate presenti, nessun problema geospaziale, data precisa al giorno,
  anni 2016-2025, mesi maggio-novembre.
- **Controlli.** Per ogni località-anno, 3 date casuali dello stesso anno fra il 1 giugno e il 30
  novembre, ad almeno 20 giorni da qualunque caso di quella località in quell'anno, distinte fra
  loro. Generatore con seme (Mulberry32), seme derivato dall'identificativo della località-anno:
  le date non cambiano se cambia la dimensione del campione.
- **Località.** I record entro 1 km l'uno dall'altro (dal primo record, in ordine di chiave GBIF)
  sono la stessa località, in qualunque anno. La **località-anno** è l'unità di tutto: una
  richiesta meteo, un gruppo del bootstrap, un confronto appaiato.
- **Meteo.** Una richiesta all'archivio Open-Meteo per località-anno, dal 1 aprile al 30
  novembre (vedi §4).
- **Punteggio.** Per ogni giorno caso o controllo: `buildFeatures` sugli ultimi 60 giorni fino a
  quel giorno incluso, poi `computeMpi`, con le varianti del §5.

### Decisioni prese, e perché

| Decisione | Scelta | Motivo |
|---|---|---|
| Incertezza delle coordinate | ≤ 2000 m. **Mancante accettata solo** per il dataset iNaturalist research-grade (`50c9509d-…`) e solo se le coordinate non sono oscurate | GBIF importa da iNaturalist solo osservazioni research-grade: senza accuratezza è di solito un punto messo a mano sulla mappa. Negli altri dataset "mancante" può voler dire il centroide di un comune. 85 casi accettati su 490 hanno l'incertezza mancante: c'è un'analisi di sensibilità senza di loro |
| Coordinate oscurate | Sempre scartate (292 record) | iNaturalist porta l'incertezza a ~27 km su richiesta dell'osservatore: tre celle della griglia meteo |
| Deduplica | Un record per giorno entro 1 km, il più preciso | Cinque foto dello stesso cesto sono un caso, non cinque |
| Campione | 250 località-anno su 413, **strati = regione, allocazione uguale** (32 per Trentino, Lombardia, Piemonte, Toscana; tutte le altre regioni per intero) | Metà dei record GBIF italiani sono trentini: un campione proporzionale misurerebbe il modello sulle Dolomiti. Il progetto proponeva regione × mese; ho scelto la sola regione (`--strata region-month` resta disponibile) perché stratificare per mese appiattisce la stagionalità dei casi, e il modello nullo di calendario perde proprio l'informazione che deve rappresentare |
| Ordine dei download | Quello del campione, cioè a giro fra le regioni | Una corsa interrotta resta un sottocampione bilanciato fra regioni, non "le prime 15 del Trentino" |
| Quota della cella | Quella del modello digitale del terreno di Open-Meteo (90 m) restituita dall'archivio, perché i record GBIF non la dichiarano mai | Con la quota nella richiesta Open-Meteo corregge anche la temperatura per il gradiente verticale |
| Cella | Esposizione, pendenza, chioma `null`; bosco non misurato (termine habitat **neutro**) | Il punto GBIF è bosco per definizione, e casi e controlli sono nello stesso punto: il bosco non cambierebbe l'AUC appaiata |
| Anomalia di pioggia | `null`, come in produzione | Nessun chiamante di produzione la passa |

## 3. I dati ottenuti

GBIF, scaricato il 24/09/2026 (pagine da 300, cache su disco):

| Passo | Record |
|---|---|
| Scaricati (4 taxa, IT, 2016-2025, mesi 5-11) | 907 |
| Scartati: coordinate oscurate | 292 |
| Scartati: incertezza > 2 km | 63 |
| Scartati: incertezza mancante fuori da iNaturalist | 62 |
| **Accettati** | **490** (284 *edulis*, 88 *reticulatus*, 84 *aereus*, 34 *pinophilus*) |
| Dopo deduplica stesso giorno entro 1 km | 437 |
| Località / località-anno | 374 / 413 |

Geografia dei 490 accettati: Trentino-Alto Adige 135, Lombardia 75, Piemonte 73, **Toscana 61**
(42 località-anno), Veneto 24, regione non indicata 18, Emilia-Romagna 17, Sardegna 14, Lazio 13,
Calabria 12, le altre sotto 10. Mesi: settembre 156, ottobre 121, agosto 110, luglio 49, giugno 29,
novembre 17, maggio 8. Anni: sbilanciati sugli ultimi (2025: 84, 2016: 10) — la crescita di
iNaturalist, non dei porcini.

Meteo: 16 località-anno scaricate, 1 errore di rete transitorio (`fetch failed`), poi HTTP 429.
Delle 16, 15 appartengono al campione con strati per regione (la prima corsa usava strati regione ×
mese; la cache è per località-anno e vale per entrambi). Valutate: **61 righe = 16 casi + 45
controlli**, 15 località-anno, 11 regioni, quota mediana dei casi 780 m (10°-90° percentile
322-1334 m).

## 4. Meteo: Open-Meteo archivio

- Endpoint `https://archive-api.open-meteo.com/v1/archive`, modello **`era5_seamless`** (ERA5-Land
  0.1°, circa 9 km, completato da ERA5): una rianalisi omogenea su tutti i dieci anni.
- Giornaliere: `precipitation_sum`, `temperature_2m_max`, `temperature_2m_min`,
  `et0_fao_evapotranspiration`, `wind_speed_10m_max` con `wind_speed_unit=ms`. Orarie, mediate
  per giorno: `soil_moisture_0_to_7cm`, `soil_temperature_0_to_7cm`, `vapour_pressure_deficit`.
  Tutte disponibili nell'archivio (verificato sulle risposte). Una variabile mancante diventa
  `null`, mai zero. Fuso `Europe/Rome`, come in produzione.
- Peso di una richiesta: 244 giorni × 8 variabili ≈ **17.4** chiamate. 250 località-anno ≈ 4.360,
  meno della metà della quota giornaliera di 10.000.
- Ritmo: `RatePacer` del progetto con limiti propri sotto quelli dichiarati (300/min, 4.000/ora,
  8.000/giorno). Ogni risposta è salvata su disco con il suo URL: una corsa successiva la rilegge e
  scarica solo ciò che manca. **Al primo 429 la corsa smette di chiedere** e valuta quello che ha.

## 5. Le varianti

Tutte costruite spalmando `ALGORITHM_V1` (`src/lib/validation/variants.ts`). Dove il
cambiamento non è esprimibile come parametro è un involucro sulle stesse funzioni pure, ed è
scritto qui cosa fa esattamente.

| Chiave | Variante | Cosa cambia, esattamente |
|---|---|---|
| `v14` | (a) 1.4 equivalente | `trigger.waterRelief` = 0 |
| `v15` | (b) 1.5 attuale | niente |
| `v15-estate-quota` | (c) estate in quota | in `seasonBlend` il peso autunnale per quota, `clamp((quota-700)/200, 0, 1)`, ha un **tetto a 0.7**: sopra 900 m il termine estivo non è più moltiplicato per zero. Non esiste un parametro per farlo: si passa a `computeMpi` una quota stagionale `min(quota, 840 m)`. In `computeMpi` la quota entra solo in `seasonBlend` (verificato da un test), il meteo resta quello della quota vera. Effetto collaterale dichiarato: l'ottimo termico si sposta con l'`autumnality` della miscela |
| `v15-regimi-misti` | (c2) entrambi i regimi a ogni quota | come (c) più un **pavimento a 0.3**: quota stagionale fra 760 e 840 m. **Aggiunta dopo aver visto i primi casi** (porcini di ottobre-novembre a 250-500 m nel Lazio con stagione 0.05-0.07): ipotesi nata da questi dati, da confermare su dati che non l'hanno generata |
| `v15-caldo-se-umido` | (d) caldo tollerato se c'è acqua | `thermal.sigmaWarmC` da 7.5 a **12** solo nei giorni in cui il fattore acqua della 1.5 (bilancio + sollievo dopo pioggia intensa, `components.water`) è ≥ 0.5; negli altri giorni è la 1.5 |
| `v15-caldo-sempre` | (d2) controllo della (d) | `sigmaWarmC` = 12 sempre |
| `v15-ottimo15` | (e) ottimo autunnale 15 °C | `thermal.optAutumnC` da 13 a 15 |
| `calendario-mese` | (f) nullo, calendario mensile | per ogni riga, la frazione dei casi **degli altri anni** caduta nello stesso mese |
| `calendario-giorno` | (f2) nullo, calendario a nucleo | densità a nucleo gaussiano (10 giorni) dei giorni dell'anno dei casi degli altri anni |

## 6. Le metriche

Funzioni pure e testate in `src/lib/validation/metrics.ts`.

- **AUC** di Mann-Whitney (pari merito a mezzo) su tutte le righe, e **AUC appaiata**: solo
  coppie caso-controllo della stessa località-anno. La seconda è la lettura fedele al disegno —
  stesso punto, stessa quota, stesso anno, cambia solo il giorno — mentre la prima mescola anche
  "caso in Sardegna contro controllo in Trentino".
- **Intervalli al 95%** con bootstrap a grappoli per località-anno (2.000 replicati), percentile.
  Le **differenze** fra varianti sono calcolate replicato per replicato sugli stessi grappoli: una
  variante è "significativamente" diversa se l'intervallo della differenza esclude lo zero.
- **Brier** dopo calibrazione logistica dell'MPI stimata **lasciando fuori un anno alla volta**;
  riferimento: la sola prevalenza degli altri anni (Brier skill score, BSS).
- **Tabella di affidabilità** a decili sulle probabilità calibrate.
- **AUC per fascia di quota** (<600, 600-1200, >1200 m) e **per mese** (casi e controlli di quel
  mese; per il calendario mensile non si riporta, perché dentro un mese è costante).
- **Distribuzione dell'MPI nei giorni dei casi**.
- **Sensibilità**: soli casi giugno-novembre (i controlli non cadono mai a maggio), sole righe con
  incertezza nota, senza Trentino-Alto Adige.

## 7. Risultati (anteprima: 15 località-anno, 16 casi, 45 controlli)

Il riepilogo completo generato dallo script, con tutte le tabelle, è in
`docs/validazione/backtest-summary.md` (e `.json`); le righe con i punteggi in
`docs/validazione/backtest-rows.csv` (7 KB, nessuna coordinata).

| Variante | AUC [IC 95%] | Δ vs 1.5 [IC 95%] | AUC appaiata [IC 95%] | Δ appaiata vs 1.5 [IC 95%] | Δ appaiata vs calendario [IC 95%] | BSS |
|---|---|---|---|---|---|---|
| (a) 1.4 equivalente | 0.838 [0.741, 0.926] | +0.008 [−0.032, 0.056] | 0.854 [0.745, 0.956] | +0.042 [−0.039, 0.125] | +0.302 [0.122, 0.479] | 0.021 |
| **(b) 1.5 attuale** | **0.829 [0.730, 0.907]** | — | **0.813 [0.667, 0.933]** | — | **+0.260 [0.056, 0.454]** | 0.057 |
| (c) estate in quota | 0.783 [0.686, 0.859] | −0.046 [−0.116, 0.009] | 0.750 [0.622, 0.867] | −0.063 [−0.133, 0.000] | +0.198 [0.000, 0.400] | 0.094 |
| (c2) entrambi i regimi | 0.765 [0.637, 0.860] | −0.065 [−0.186, 0.034] | 0.667 [0.526, 0.822] | −0.146 [−0.292, 0.022] | +0.115 [−0.052, 0.260] | 0.102 |
| (d) caldo se c'è acqua | 0.831 [0.731, 0.908] | +0.001 [−0.011, 0.024] | 0.833 [0.687, 0.956] | +0.021 [0.000, 0.067] | +0.281 [0.078, 0.479] | 0.062 |
| (d2) caldo sempre | 0.824 [0.724, 0.907] | −0.005 [−0.018, 0.013] | 0.833 [0.687, 0.956] | +0.021 [0.000, 0.067] | +0.281 [0.078, 0.479] | 0.064 |
| (e) ottimo 15 °C | 0.828 [0.729, 0.907] | −0.001 [−0.015, 0.021] | 0.833 [0.687, 0.956] | +0.021 [0.000, 0.067] | +0.281 [0.078, 0.479] | 0.092 |
| (f) calendario mensile | 0.550 [0.359, 0.747] | −0.279 [−0.447, −0.106] | 0.552 [0.353, 0.767] | −0.260 [−0.454, −0.056] | — | −0.033 |
| (f2) calendario a nucleo | 0.607 [0.425, 0.786] | −0.222 [−0.363, −0.072] | 0.542 [0.333, 0.778] | −0.271 [−0.451, −0.089] | −0.010 [−0.125, 0.115] | −0.006 |

Brier di riferimento (prevalenza): 0.194; 1.5 calibrata: 0.183.

**MPI 1.5 nei giorni in cui i porcini sono stati trovati** (16 casi): sotto 20 in **11 casi su 16
(69%)**, 20-40 in 2, 60-80 in 1, 80 o più in 2; mediana 14.8. Negli 11 casi sotto 20 il fattore
più basso è la **stagione** in 8 (media 0.31), l'acqua in 3, mai la temperatura. Sono i porcini
fuori dalla finestra che il modello si aspetta per quella quota: ottobre-novembre a 250-500 m nel
Lazio (stagione 0.05-0.07), settembre-ottobre a 490-740 m in Emilia-Romagna e Sardegna (0.22),
luglio a 950 m in Toscana (0.08), maggio a 190-480 m (Sardegna e un sito senza regione, 0.27-0.33).

Per fascia di quota e per mese i sottogruppi hanno da 1 a 7 casi: le AUC sono nel riepilogo
generato ma non vanno lette.

### Come leggerlo

1. **La 1.5 batte il calendario**, anche con 16 casi: +0.26 di AUC appaiata, intervallo
   [0.06, 0.45] che esclude lo zero. È l'unica affermazione che questa anteprima regge. Va però
   pesata: il calendario è stimato lasciando fuori un anno su una quindicina di casi, quindi è
   un avversario debole, e con il campione completo sarà più forte.
2. **Nessuna variante è significativamente migliore della 1.5.** Le (d), (d2), (e) cambiano
   l'ordine di una sola coppia su 48; la (a) è davanti di poco, con un intervallo largo che
   contiene lo zero.
3. **La (c) e la (c2) peggiorano la discriminazione** (AUC appaiata −0.06 e −0.15; per la (c)
   l'intervallo tocca lo zero) pur migliorando il Brier. Non è una contraddizione: alzano il
   punteggio di tutti i giorni fuori stagione, casi e controlli, quindi la calibrazione migliora e
   l'ordinamento peggiora. Il problema che vedono (casi con stagione quasi nulla) è reale, la cura
   proposta non separa i giorni buoni da quelli cattivi.
4. **L'MPI è molto basso nei giorni dei ritrovamenti**: due su tre sotto 20, cioè
   «condizioni sfavorevoli» in un giorno in cui qualcuno ha trovato porcini. In parte è atteso —
   la scala assoluta non è una probabilità, e l'AUC dice che l'ordinamento funziona — ma è il
   segnale più robusto di questa anteprima, perché non dipende dai controlli.

## 8. Limiti dei dati (valgono anche a campione completo)

- **Solo presenze.** Nessuno registra "cercato e non trovato". Il controllo non è un giorno senza
  porcini, è un giorno senza segnalazione: parte dei controlli sarà caduta in giorni buoni, e
  questo abbassa l'AUC di qualunque modello, in modo uguale per tutte le varianti.
- **Data della foto ≠ inizio della buttata.** La segnalazione arriva quando qualcuno è andato nel
  bosco, magari una settimana dopo l'inizio. Il modello guarda il giorno della foto.
- **Sforzo di osservazione.** Si cerca nel fine settimana, con il bel tempo, quando "se ne parla".
  Una parte del segnale meteo può essere segnale di sforzo: dopo una pioggia si esce di più.
- **Identificazione.** Research-grade vuol dire due persone d'accordo su una foto, non un
  micologo; *B. aereus* / *B. reticulatus* / *edulis* si confondono. Per il modello, che non
  distingue le specie, conta poco; conta di più il possibile scambio con altri *Boletus*.
- **Griglia di 9 km contro crinali.** ERA5-Land media su una cella che contiene fondovalle e
  crinale. La quota del DEM corregge la temperatura, non la pioggia: sui rilievi la pioggia della
  cella è sottostimata dove i porcini stanno davvero.
- **Geografia sbilanciata.** Metà dei record accettabili è in Trentino-Alto Adige, poi Lombardia e
  Piemonte; il campione ne tiene 32 per regione per non misurare le Dolomiti. La **Toscana**, dove
  il modello è stato tarato, ha 68 record grezzi, 61 accettati, 42 località-anno: da sola non
  basta per una validazione regionale.
- **Anni sbilanciati.** 2016-2018 hanno 39 casi in tutto, 2025 ne ha 84: la calibrazione
  lasciando fuori un anno è dominata dagli anni recenti.
- **Maggio senza controlli.** I casi di maggio (8 in tutto) non hanno controlli nello stesso mese:
  entrano nell'AUC complessiva, non in quella del mese. La sensibilità "casi giu-nov" li esclude.
- **Bosco neutro.** Il termine habitat non entra (vedi §2): il backtest valuta il meteo e la
  stagione, non la scelta del posto.

## 9. Raccomandazione

**Non cambiare il modello sulla base di questo backtest: la 1.5 resta.** Con 16 casi nessuna
variante è significativamente migliore della 1.5; le due varianti sulla stagione per quota
(c, c2) vanno nella direzione sbagliata per la discriminazione e non vanno adottate nella forma
provata; le (d) e (e) sono indistinguibili dalla 1.5. La 1.5 batte il calendario con un
intervallo che esclude lo zero, e questo è l'unico risultato di cui fidarsi per ora — con la
riserva che il calendario stimato su 15 casi è un avversario debole.

La (a) — la 1.4, senza il sollievo idrico tarato sul Mugello — è **davanti** alla 1.5 di +0.04 di
AUC appaiata, non significativo. Non autorizza a tornare indietro, ma è il confronto da guardare
per primo a campione completo: se la differenza restasse positiva su 250 località-anno, il
`waterRelief` tarato su un solo luogo e due giorni starebbe peggiorando il modello altrove.

Il segnale da inseguire non è nella temperatura ma nella **stagione per quota**: 8 dei casi
sotto 20 hanno la stagione come fattore limitante. La cura provata (alzare il pavimento o il
tetto del peso per quota) non funziona perché alza tutti i giorni; la direzione più promettente è
una stagione che si sposti con la latitudine o con la climatologia della cella invece che con la
sola quota — da formulare prima di guardare il campione completo, non dopo.

## 10. Riprodurre e riprendere

```
NODE_USE_ENV_PROXY=1 npx tsx scripts/backtest-gbif.ts --sample 250 --rows --out docs/validazione
```

- La cache (`--cache` o `$BACKTEST_CACHE_DIR`) contiene le pagine GBIF e le risposte meteo: una
  nuova corsa scarica solo le località-anno mancanti, nello stesso ordine. Servono circa 235
  richieste (peso ≈ 4.100), cioè una giornata di quota libera sull'IP di uscita; con il ritmo
  impostato circa 15 minuti, più una pausa fino a un'ora per il limite orario.
- `--offline` ricalcola le metriche dalla sola cache, senza rete.
- Seme predefinito 20260924: stessa riga di comando, stesso campione, stessi controlli, stesso
  bootstrap. La cache e i dati GBIF grezzi non sono nel repository.
- Metriche e campionamento: `tests/validation-metrics.test.ts`,
  `tests/validation-sampling.test.ts`, `tests/validation-variants.test.ts`.
