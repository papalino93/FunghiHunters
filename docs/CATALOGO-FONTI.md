# Catalogo delle fonti — attive, valutate, scartate

**Nota per chi legge dopo il 18 settembre 2026 (sessione "roadmap outdoor").** Il blocco di rete
descritto qui sotto (paragrafo originale, lasciato per la cronologia) **non vale più in questa
sessione**: `www502.regione.toscana.it`, `dati.toscana.it` e `sir.toscana.it` rispondono tutti con
`200`, verificato con richieste reali (non solo handshake TLS). Due fatti confermati di persona,
non da ricerca testuale:

- Il servizio WMS UCS (`GeoCapabilities` interrogato davvero) è **MapServer**
  (`com.rt.wms.RTmap`), non GeoServer come ipotizzato prima — cambia il pattern di adapter da
  seguire, non `sir-geoserver.ts`. `Fees: none`, `AccessConstraints: none`.
- La licenza su `dati.toscana.it/dataset/ucs` è **confermata CC BY** (prima "probabile, non
  verificata").

**Non ho comunque scritto l'adapter in questa sessione**: individuare l'endpoint WFS giusto,
i nomi dei campi e i codici delle classi Corine dal `GetCapabilities`/`DescribeFeatureType` veri,
poi scrivere il parser con un fixture catturato da una risposta reale, è un lavoro a sé — e
comunque, per la regola di questo progetto (`Non usare la nuova granularità finché habitat e dati
altimetrici non sono entrambi disponibili e validati`), da solo non sbloccherebbe nulla in UI
finché non esiste anche il DTM. **Il prossimo passo concreto resta quello scritto più sotto**, ora
con un ostacolo in meno: la rete c'è, la licenza è confermata, manca solo l'adapter vero.

---

**Metodo e limite della ricerca originale (sessione precedente, per la cronologia).** Quella
sessione non aveva accesso di rete in uscita alla maggior parte degli host esterni: verificato con
`curl` (rifiutato dal gateway con 403 su `api.open-meteo.com`, `sir.toscana.it`, `dati.toscana.it`,
`www502.regione.toscana.it`, `en.wikipedia.org`, `overpass-api.de`, tutti con lo stesso errore di
policy). **`raw.githubusercontent.com` e `api.github.com` erano invece raggiungibili** — verificato
scaricando davvero file reali, non solo l'handshake TLS. Questo ha permesso di implementare una
fonte reale (sotto), ma ha limitato le altre candidate a fonti raggiungibili solo tramite ricerca
testuale o mirror su GitHub. Ogni riga dichiara cosa era verificato con una richiesta reale e cosa
restava da confermare al primo collegamento con rete piena — vedi la nota sopra per cosa è stato
confermato da allora.

## Fonti attive in produzione

| Fonte | Stato | Licenza | Copertura | Granularità | Aggiornamento | Storico |
|---|---|---|---|---|---|---|
| SIR Toscana (Servizio Idrologico Regionale) | **attiva** | CC BY-SA | Toscana, rete stazioni | Puntuale (stazioni), giornaliero | Quasi tempo reale (GeoServer) + archivio storico | Dal 1961 (archivio `dati.php`), non ancora ingerito per intero — vedi `docs/DECISIONS.md` D2 |
| Open-Meteo (forecast + archive ERA5) | **attiva** | CC BY 4.0 | Globale, qualunque punto | Cella di modello (~9-25 km secondo il modello), orario/giornaliero | Forecast 2×/giorno; ERA5 storico fisso | ERA5 1991-2020 |
| **ISTAT — confini comunali** (nuova, questa sessione) | **attiva** | CC-BY | Toscana, 273 comuni | Poligonale, confine comunale reale | Statico, rigenerato a mano quando servono nuove zone (non nel cron giornaliero: i confini comunali non cambiano ogni giorno) | Vintage 1 gennaio 2026, via `guglielmo/geojson-italy` |
| **Nominatim (OpenStreetMap)** — geocodifica inversa | **attiva** | ODbL 1.0 | Globale | Puntuale, a richiesta (nessuna copertura precalcolata) | In tempo reale, un tocco alla volta | — |

Le prime due non sono state toccate. La terza è una fonte reale implementata in questa sessione,
non simulata — vedi sotto.

## Fonte nuova: Nominatim per la geocodifica inversa in "Meteo"

Serve solo a tradurre "Usa la mia posizione" (schermata Meteo) in un nome leggibile invece delle
sole coordinate — un dettaglio d'interfaccia, non un dato che entra nel modello. Open-Meteo (già in
uso) non offre un endpoint inverso, solo ricerca per nome (`geocoding-api.open-meteo.com/v1/search`
risponde `search`, non `reverse`, verificato con una richiesta reale). Nominatim è gratuito, senza
chiave, licenza ODbL — la stessa famiglia di licenze aperte di OpenStreetMap già nota al progetto.

**Uso conforme alla policy di Nominatim** (niente geocodifica di massa): una richiesta per tocco
dell'utente su "Usa la mia posizione", mai in ciclo o per popolare un catalogo; `User-Agent`
identificativo (`src/lib/sources/http.ts`, `USER_AGENT`); un solo tentativo (`attempts: 1`,
`src/lib/sources/nominatim.ts`) — se non risponde in tempo, l'interfaccia resta con le coordinate
già mostrate, senza bloccare la previsione né riprovare. Implementato in `src/app/api/meteo/route.ts`
(`?reverse=1`) e `src/lib/sources/nominatim.ts`.

## Fonte nuova implementata: confini comunali ISTAT

Le fonti prioritarie (UCS, DTM, aree protette — sotto) stanno su domini bloccati da questa
sessione. Cercando un percorso alternativo, ho trovato che `raw.githubusercontent.com` è
raggiungibile, e che `guglielmo/geojson-italy` (ex `openpolis/geojson-italy`) ridistribuisce i
confini amministrativi ISTAT come GeoJSON, **CC-BY**, aggiornati a ogni variazione amministrativa.
Non serve alla stima del potenziale, ma serve a sapere con certezza in quale comune e provincia
cade il centro di una zona — informazione che prima era scritta a mano in `zones.ts`.

**Verificato scaricando i dati veri**, non un fixture: `npx tsx scripts/ingest-admin-boundaries.ts`
ha scaricato davvero 273 comuni toscani e risolto le sette zone per punto-in-poligono. Ha trovato
un errore reale: `zones.ts` dichiarava provincia "SI" (Siena) per le Colline Metallifere, ma le
coordinate della zona cadono a Montieri, che è in provincia di Grosseto — corretto nello stesso
commit, con il file `public/data/admin-boundaries.json` prodotto come prova.

- Adapter: `src/lib/sources/istat-boundaries.ts` — parsing, punto-in-poligono (`Polygon` e
  `MultiPolygon`, con buchi), ripiego esplicito sul comune più vicino quando nessun poligono
  contiene il punto (marcato `nearest-fallback`, mai confuso con una corrispondenza esatta).
- Test: `tests/istat-boundaries.test.ts`, contro un fixture **ritagliato da una risposta vera**
  (`tests/fixtures/istat-comuni-toscana.sample.json`, 5 comuni reali inclusi apposta per coprire
  `MultiPolygon` e il caso Chiusdino/Montieri).
- Ingestione: `scripts/ingest-admin-boundaries.ts`, eseguito realmente in questa sessione.
- Superficie in app: `SnapshotZone.municipality`, mostrato in `ZoneSheet` al posto della sola
  sigla di provincia; attribuzione in `snapshot.sources`.

**Estensione (sessione successiva): comuni entro raggio, non solo quello che contiene il punto.**
Stessa fonte, stesso file scaricato, una funzione in più (`nearbyMunicipalities` in
`istat-boundaries.ts`) che restituisce tutti i comuni il cui centroide cade entro 15 km dal punto
di riferimento di ciascuna zona, con distanza reale (haversine), non solo il primo che contiene il
punto. Nasce dalla richiesta di indicare "posti dove cercare" senza inventare coordinate: le sette
zone sono punti, non poligoni, quindi non hanno un confine reale da mostrare — i comuni vicini sono
il modo onesto di dare un riferimento geografico verificabile. Vedi `scripts/ingest-nearby-comuni.ts`
e `public/data/nearby-comuni.json`; superficie in app nella scheda "Dove cercare" di `ZoneSheet`.

## Candidate valutate (non implementate — bloccate dalla rete di questa sessione)

Priorità dichiarata dal progetto (`docs/DECISIONS.md`, D8): maschera forestale e DTM sono
precondizione per superare le sette macro-zone. Le prime tre righe sono quindi le più rilevanti.

### 1. Uso e Copertura del Suolo (UCS) — Regione Toscana

| Campo | Valore | Verificato come |
|---|---|---|
| Ente | Regione Toscana (SIPT), Direzione Urbanistica | **Confermato**: `GetCapabilities` interrogato davvero il 18/09/2026 |
| Licenza | **CC BY, confermata** su `dati.toscana.it/dataset/ucs` (era "probabile, non verificata") | **Confermato con richiesta reale**, 18/09/2026 |
| Copertura geografica | Intera regione Toscana | Ricerca web |
| Granularità spaziale | Poligonale, scala 1:10.000 | Ricerca web |
| Classificazione | Corine Land Cover, III livello, con un IV livello regionale per alcune classi | Ricerca web — nomenclatura delle classi non ancora letta da un `DescribeFeatureType` vero |
| Accesso | WMS **MapServer** (`com.rt.wms.RTmap`, servizio "Geoscopio_wms USO_E_COPERTURA_DEL_SUOLO") — **confermato con `GetCapabilities` reale**; endpoint WFS per le query puntuali non ancora individuato | **Servizio WMS confermato raggiungibile e funzionante**, 18/09/2026; WFS da trovare |
| Aggiornamento | Non confermato con che frequenza viene rifatto il censimento | Da verificare |
| Utilità per il porcino | **Alta**: è esattamente la maschera forestale che manca per smettere di rappresentare le zone come macro-aree — distingue faggeta da querceto da non-bosco, la variabile che il modello già usa (`zone.forest`) ma solo come etichetta manuale per zona, non per cella | — |
| **Stato** | **da integrare** — priorità 1, bloccata solo dalla rete di questa sessione | — |

### 2. DTM 10 m "idrologico" + pendenza/esposizione derivate — Regione Toscana

| Campo | Valore | Verificato come |
|---|---|---|
| Ente | Regione Toscana | Ricerca web |
| Licenza | Pubblicato su `dati.toscana.it` come open data; tipo esatto non confermato | Da verificare |
| Copertura | Intera regione | Ricerca web |
| Granularità | Raster 10×10 m | Ricerca web |
| Dettaglio utile | **Pendenza e esposizione sono già calcolate e pubblicate come risorse separate** (`Slope (pendenza) da DTM idrologico`, `Aspect (esposizione) da DTM idrologico`): non servirebbe calcolarle da un DEM grezzo | Ricerca web, URL di risorsa trovati |
| Nota | Esiste anche un DTM LiDAR 1 m (2019-2021), ma quello è **CC BY-NC-SA**, di proprietà di terzi (Italian Remote Sensing S.r.l.) concesso alla Regione per la sola ridistribuzione ad altri enti pubblici — utilizzabile solo restando un progetto non commerciale (coerente con D1 di `docs/DECISIONS.md`, ma comunque da trattare con più cautela del 10 m) | Ricerca web |
| Utilità per il porcino | **Alta**: quota, pendenza ed esposizione sono precondizione dichiarata per `grid_cells` (`db/migrations/0001_init.sql`) e per il pilota di granularità — oggi popolate con zero righe | — |
| **Stato** | **da integrare** — priorità 2, bloccata dalla rete | — |

### 3. Aree protette e Siti Natura 2000 — Regione Toscana

| Campo | Valore | Verificato come |
|---|---|---|
| Ente | Regione Toscana (SIPT) | Ricerca web |
| Copertura | Parchi provinciali, riserve naturali regionali, ANPIL, Siti di Interesse Regionale/Natura 2000 | Ricerca web |
| Accesso | WMS + WFS su GEOscopio (`arprot`) | Ricerca web, `GetCapabilities` trovato, non interrogato |
| Licenza | Non confermata | Da verificare |
| Utilità per il porcino | **Media-alta**: serve a marcare le celle con vincoli, non a stimare il potenziale — coerente col principio "mai garantire accessibilità o legalità" | — |
| **Stato** | **da integrare** — priorità 3, per la sezione "vincoli" della mappa, non per il punteggio | — |

### 4. Rete Escursionistica Toscana (sentieri CAI) — Regione Toscana

| Campo | Valore | Verificato come |
|---|---|---|
| Ente | Regione Toscana, in convenzione con CAI Toscana | Ricerca web |
| Licenza | **CC-BY-SA** (confermata da fonte secondaria, non dalla pagina del dataset) | Ricerca web |
| Copertura | ~6.000 km di sentieri digitalizzati su CTR 1:10.000 | Ricerca web |
| Accesso | WMS/WFS su GEOscopio, scaricabile da Open Toscana | Ricerca web |
| Utilità per il porcino | Bassa per il punteggio, alta per "prima di partire": sentieristica pubblica verificabile invece di indicazioni generiche | — |
| **Stato** | **da integrare**, priorità più bassa delle prime tre — non influenza il modello, solo la sezione pratica | — |

### 5. Windy — dati puntuali e modello proprietario

| Campo | Valore | Verificato come |
|---|---|---|
| Ente | Windy.com (Windyty SE) | Ricerca web |
| Licenza | API a pagamento (Windy API — Point Forecast, Map Forecast); i dati sottostanti sono per lo più forecast pubblici (ECMWF, GFS, ICON) più un layer proprietario | Ricerca web, non verificato con una richiesta reale |
| Accesso | `api.windy.com` — **irraggiungibile da questa sessione**: `curl` rifiutato dal gateway di rete con lo stesso errore di policy delle altre fonti bloccate | `curl -sS https://api.windy.com` → CONNECT rifiutato |
| Utilità per il porcino | Bassa oltre a ciò che Open-Meteo già dà: Windy soprattutto ridistribuisce/visualizza modelli (fra cui ECMWF) che Open-Meteo offre già in `docs/VENTO.md` come `models=ecmwf_ifs025`, senza un layer nuovo di dati stazione. Il suo valore reale è l'interfaccia grafica, non nuovi dati per questo modello. | — |
| **Stato** | **non prioritario** — prima di integrarlo varrebbe verificare se aggiunge qualcosa che Open-Meteo/ECMWF Open Data non copra già (raffica, direzione ad alta risoluzione locale), non riverificato con rete piena | — |

### 6. Aeronautica Militare / ICAO METAR-TAF (stazioni aeroportuali)

| Campo | Valore | Verificato come |
|---|---|---|
| Ente | Aeronautica Militare (Servizio Meteorologico), messaggi METAR/TAF su standard ICAO/OMM | Ricerca web |
| Licenza | METAR/TAF sono messaggi di sicurezza del volo, in genere ridistribuiti liberamente per uso non aeronautico (es. via NOAA Aviation Weather Center); la licenza specifica del portale AM non è stata verificata | Ricerca web, non verificato con una richiesta reale |
| Copertura | Solo stazioni aeroportuali — in Toscana: Pisa (LIRP), Firenze (LIRQ), Grosseto (LIRS, militare) — **nessuna in quota, nessuna vicina alle sette zone di taratura**, tutte in pianura o costa | Ricerca web |
| Accesso | `www.meteoam.it`, `aviationweather.gov` — **irraggiungibile da questa sessione**, stesso errore di policy | `curl -sS https://www.meteoam.it` → CONNECT rifiutato |
| Utilità per il porcino | **Bassa**: sono osservazioni orarie di alta qualità, ma da aeroporti di pianura a decine di km dalle zone forestali di montagna che contano per il modello — esattamente il problema di rappresentatività già documentato per le stazioni SIR più lontane (vedi `stationNotes` in `zones.ts`). Utile eventualmente come validazione incrociata per vento e pressione, non come fonte primaria. | — |
| **Stato** | **da rivalutare con rete piena**, priorità bassa: la copertura geografica non è quella che serve | — |

### 7. Ventusky

| Campo | Valore | Verificato come |
|---|---|---|
| Ente | Ventusky.com (InMeteo, s.r.o.) | Ricerca web |
| Licenza | Nessuna API pubblica documentata: è un visualizzatore, non un fornitore dati — i dati sottostanti sono modelli pubblici (GFS, ICON, ECMWF fra gli altri), non un layer proprietario di osservazioni | Ricerca web, non verificato con una richiesta reale |
| Accesso | `ventusky.com`, `api.ventusky.com` — **irraggiungibile da questa sessione**, stesso errore di policy delle altre fonti bloccate | `curl -sS https://ventusky.com` → CONNECT rifiutato |
| Utilità per il porcino | **Nessuna oltre a quanto già disponibile**: stesso caso di Windy sopra — Ventusky visualizza gli stessi modelli (GFS/ICON/ECMWF) che Open-Meteo già serve via API con licenza aperta e che questo progetto già consuma. Non esiste un'API pubblica di Ventusky da integrare: sarebbe uno scraping di una pagina pensata per l'occhio umano, non una fonte dati — pratica che questo progetto esclude a priori, a prescindere dal blocco di rete. | — |
| **Stato** | **non da integrare**: non per il blocco di rete di questa sessione, ma perché non esiste un'API da consumare e i dati che mostra sono già disponibili da una fonte con licenza aperta che l'app usa | — |

## Candidate scartate

| Fonte | Motivo dello scarto |
|---|---|
| DEM globali via API pubblica (Open-Elevation, OpenTopoData) | Ridondanti rispetto al DTM 10 m regionale, che è più risoluto e già include pendenza/esposizione precalcolate. Avrebbe senso solo come fallback se il DTM toscano risultasse irraggiungibile o con licenza incompatibile — da rivalutare allora, non ora. |
| ISPRA / Portale Cartografico Nazionale (dati nazionali equivalenti) | Sovrapposti ai dataset regionali toscani, generalmente a risoluzione pari o inferiore per l'area di interesse. La fonte regionale è più specifica e già in uso per SIR: preferibile restare su un solo ente per la governance delle fonti. |
| LaMMA (climatologie 1995-2014) | Non scartata dal progetto in generale — è già prevista in `docs/DECISIONS.md` D2 come validazione incrociata indipendente, non come fonte primaria. Non rivalutata in questa sessione, resta "da integrare" secondo la decisione originale. |

## Perché non ho implementato nulla di nuovo

Il compito chiedeva esplicitamente di implementare almeno una fonte reale "se è legalmente e
tecnicamente disponibile", e di documentare il blocco preciso altrimenti. Il blocco qui non è
legale né tecnico nel senso della fonte — UCS Toscana sembra genuinamente disponibile, con licenza
open e un servizio WFS pubblico — **è un blocco di questa sessione**: zero connettività in uscita,
confermata con più test (`curl`, fetch di pagine, tre domini diversi, stesso errore 403 di
policy). Scrivere un adapter contro uno schema WFS che non ho mai interrogato — nomi dei campi,
formato delle geometrie, valori di enumerazione delle classi Corine — avrebbe significato
indovinare una struttura e presentarla come integrazione reale. Sarebbe la stessa falsa precisione
che l'audit di questo progetto contesta altrove; l'ho evitata anche qui.

**Il prossimo passo concreto**, per chi riprende con rete disponibile:

1. `curl "https://www502.regione.toscana.it/wmsraster/com.rt.wms.RTmap/wms?map=wmsucs&service=WMS&request=GetCapabilities"` — confermare i layer WMS.
2. Trovare l'endpoint WFS equivalente (documentato nella pagina "Servizi di ricerca" di GEOscopio, non ancora letta) e fare un `GetFeature` di prova su un'area piccola.
3. Leggere la licenza esatta su `dati.toscana.it/dataset/ucs`.
4. Solo a quel punto scrivere l'adapter, sul modello di `src/lib/sources/sir-geoserver.ts` (stesso pattern: OWS GeoServer), con un fixture catturato da una risposta reale per i test — non inventato.

Fino ad allora, il modello resta onestamente su sette macro-zone.

## Pilota di granularità: cosa esiste e cosa no

`src/lib/spatial/grid.ts` genera una griglia reale di celle (geometria deterministica, comune e
provincia risolti sui confini ISTAT veri) e applica un gate esplicito: una cella senza copertura
forestale nota è **`not-evaluable`**, mai "favorevole" o "sfavorevole" per assenza di dati — è la
regola richiesta esplicitamente. Provato con dati reali:

```
npx tsx scripts/pilot-grid.ts amiata
→ Generate 13 celle. Comuni toccati: Abbadia San Salvatore.
→ Celle valutabili: 0 / 13 — corretto: manca la maschera forestale.
```

**Cosa NON esiste**: nessuna cella ha un punteggio, perché nessuna fonte di copertura forestale
reale è raggiungibile da questa sessione (vedi sopra). Il motore non è collegato alla mappa: la UI
mostra ancora le sette zone, invariata. Collegare la griglia alla UI prima di avere dati forestali
reali da mostrarci dentro produrrebbe esattamente la "griglia colorata inventata" che il compito
vietava esplicitamente — non l'ho fatto.
