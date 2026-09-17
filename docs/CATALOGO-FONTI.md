# Catalogo delle fonti — attive, valutate, scartate

**Metodo e limite di questa ricerca, dichiarato prima dei risultati.** Questa sessione non ha
accesso di rete in uscita alla maggior parte degli host esterni: verificato con `curl` (rifiutato
dal gateway con 403 su `api.open-meteo.com`, `sir.toscana.it`, `dati.toscana.it`,
`www502.regione.toscana.it`, `en.wikipedia.org`, `overpass-api.de`, tutti con lo stesso errore di
policy). **`raw.githubusercontent.com` e `api.github.com` sono invece raggiungibili** — verificato
scaricando davvero file reali, non solo l'handshake TLS. Questo ha permesso di implementare una
fonte reale (sotto), ma limita le altre candidate a fonti raggiungibili solo tramite ricerca
testuale o mirror su GitHub. Ogni riga dichiara cosa è verificato con una richiesta reale e cosa
resta da confermare al primo collegamento con rete piena.

## Fonti attive in produzione

| Fonte | Stato | Licenza | Copertura | Granularità | Aggiornamento | Storico |
|---|---|---|---|---|---|---|
| SIR Toscana (Servizio Idrologico Regionale) | **attiva** | CC BY-SA | Toscana, rete stazioni | Puntuale (stazioni), giornaliero | Quasi tempo reale (GeoServer) + archivio storico | Dal 1961 (archivio `dati.php`), non ancora ingerito per intero — vedi `docs/DECISIONS.md` D2 |
| Open-Meteo (forecast + archive ERA5) | **attiva** | CC BY 4.0 | Globale, qualunque punto | Cella di modello (~9-25 km secondo il modello), orario/giornaliero | Forecast 2×/giorno; ERA5 storico fisso | ERA5 1991-2020 |
| **ISTAT — confini comunali** (nuova, questa sessione) | **attiva** | CC-BY | Toscana, 273 comuni | Poligonale, confine comunale reale | Statico, rigenerato a mano quando servono nuove zone (non nel cron giornaliero: i confini comunali non cambiano ogni giorno) | Vintage 1 gennaio 2026, via `guglielmo/geojson-italy` |

Le prime due non sono state toccate. La terza è una fonte reale implementata in questa sessione,
non simulata — vedi sotto.

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

## Candidate valutate (non implementate — bloccate dalla rete di questa sessione)

Priorità dichiarata dal progetto (`docs/DECISIONS.md`, D8): maschera forestale e DTM sono
precondizione per superare le sette macro-zone. Le prime tre righe sono quindi le più rilevanti.

### 1. Uso e Copertura del Suolo (UCS) — Regione Toscana

| Campo | Valore | Verificato come |
|---|---|---|
| Ente | Regione Toscana (SIPT) | Ricerca web |
| Licenza | Pubblicata come open data su `dati.toscana.it`; il tipo esatto (probabilmente IODL 2.0, licenza standard degli opendata regionali toscani) **non confermato**: non ho potuto aprire la pagina del dataset | **Da verificare al collegamento** |
| Copertura geografica | Intera regione Toscana | Ricerca web |
| Granularità spaziale | Poligonale, scala 1:10.000 | Ricerca web |
| Classificazione | Corine Land Cover, III livello, con un IV livello regionale per alcune classi | Ricerca web |
| Accesso | WMS (`USO_E_COPERTURA_DEL_SUOLO` su GEOscopio) e WFS per le query; anche scaricabile come archivio Spatialite completo | Ricerca web — URL del `GetCapabilities` trovato, mai interrogato |
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
