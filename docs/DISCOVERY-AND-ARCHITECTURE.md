# FungiCast — Discovery & Architecture Report

**Versione:** 1.0 — **Data:** 17 settembre 2026 — **Stato:** Fase 1, in attesa di approvazione
**Autore:** sessione Claude Code, su specifica `FUNGICAST-PROMPT.md`

> Tutte le verifiche in questo documento sono state eseguite oggi, 17 settembre 2026, con chiamate
> reali agli endpoint. Dove non ho verificato, lo dichiaro esplicitamente.
> Gli script usa-e-getta usati per verificare sono descritti in appendice.

---

## 0. SOMMARIO ESECUTIVO — cinque scoperte che cambiano l'architettura

Prima di tutto il resto, cinque risultati che contraddicono o semplificano in modo sostanziale le
premesse del prompt. Sono la ragione per cui vale la pena leggere il resto.

**0.1 — Esiste la pioggia aggregata 0–24. Il problema dello sfasamento 9-9 non esiste più.**
Il prompt dà per scontato che il SIR pubblichi solo l'aggregazione 9–9 e chiede di gestire
esplicitamente lo sfasamento con Open-Meteo. In realtà l'anagrafica espone **due** grandezze
pluviometriche distinte: `IDST=pluvio` (9–9, 1151 stazioni) e **`IDST=pluvio0_24`** (0–24,
488 stazioni, di cui **401 attive nel 2026**). Non è documentato nel prompt e non è ovvio dal portale.

L'ho verificato empiricamente sulla stazione dell'Amiata (`TOS11000114`), confrontando le due serie:

| data | 9-9 | 0-24 |
|---|---|---|
| 2026-08-12 | 0.0 | **6.1** |
| 2026-08-13 | **6.1** | 0.0 |
| 2026-08-20 | 0.0 | 11.2 |
| 2026-08-21 | 18.4 | 18.3 |

Lo sfasamento di un giorno è reale e sistematico, esattamente come temuto — ma la soluzione non è
correggerlo: è **non introdurlo**, usando `pluvio0_24` come sorgente primaria. Le 401 stazioni
attive 0–24 sono esattamente le stesse 401 attive 9–9: non si perde copertura.
Il test di regressione richiesto dal prompt va scritto lo stesso, ma come *guardia*: verifica che
l'adapter non stia accidentalmente leggendo la serie 9-9.

**0.2 — Esiste un GeoServer SIR con i valori giornalieri aggregati. L'ingestione incrementale
costa 3 chiamate e 400 KB, non 156 MB.**
Il prompt conclude, correttamente date le premesse, che senza filtro temporale serve
"ingestione una tantum + aggiornamento incrementale con cache". Ma l'aggiornamento incrementale
via `dati.php` costerebbe 401 stazioni × ~390 KB ≈ **156 MB al giorno**.

Partendo dalla risorsa GeoJSON del dataset CKAN `pluviometri` ho trovato un endpoint OGC non
documentato altrove: `https://geo.sir.toscana.it/geoserver/geo/ows` — 39 feature type, fra cui:

| layer | contenuto | feature | bytes | latenza |
|---|---|---|---|---|
| `geo:sir_pluviometri_valori_ieri_pubblico` | pioggia di ieri, finestra 0–24 | 417 | 151 KB | 0.24 s |
| `geo:sir_pluviometri_valori_ieri9_pubblico` | pioggia di ieri, finestra 9–9 | 417 | 151 KB | 0.20 s |
| `geo:sir_termometri_valori_ieri_pubblico` | `t_max`, `t_min`, `t_med` di ieri | 263 | 102 KB | 0.20 s |

Portano `data_aggiornamento` (oggi: `2026-09-17T10:30:03Z`) — il momento esatto del refresh lato SIR.
**Ho validato il valore contro `dati.php`**: WFS `dataora 2026-09-16T07:00:00Z, valore 0` ↔
`dati.php` `Data 2026-09-16 09:00:00, Valore "0.0"`. Coincidono.
Nota: `dataora` è **UTC** nel WFS e **ora locale** in `dati.php` (07:00Z = 09:00 CEST). D'inverno
diventa 08:00Z: l'adapter deve normalizzare a UTC, non assumere un offset fisso.

Conseguenza: `dati.php` serve **una sola volta** per il backfill storico, e mai più.
Il cron giornaliero diventa 3 GET e mezzo secondo.
Limite: il WFS copre solo pioggia e temperatura. Igrometria, anemometria e freatimetria restano
su `dati.php` (aggiornamento settimanale/su richiesta) o su Open-Meteo.

**0.3 — L'archivio ERA5 di Open-Meteo dà 30 anni di storico per cella in 1 secondo.**
`archive-api.open-meteo.com/v1/archive` con `start_date=1991-01-01&end_date=2020-12-31` restituisce
**10.958 giorni** (pioggia, Tmax, Tmin, ET0) in **354 KB e 1.01 s**, con `elevation` rispettata.
Il prompt propone di scaricare lo storico SIR dal 1961 "per calcolare percentili per stazione e per
decade". È ancora una buona idea — ma **non è la strada principale**: i percentili servono *per cella*,
non per stazione, e ERA5 li fornisce già per cella, omogenei, senza buchi e senza dover gestire
cambi di strumento. Lo storico SIR serve invece per **correggere il bias di ERA5** sui punti dove
esiste una misura reale, che è un uso diverso e più difendibile.

**0.4 — LaMMA pubblica grigliati a 1 km, ma congelati al 2015. Sono oro per la calibrazione,
inutili per l'operativo.**
Il Consorzio LaMMA espone un CKAN (`dati.lamma.toscana.it`, 162 dataset, 159 in CC-BY) con
grigliati regolari a **1 km** di pioggia, Tmax e Tmin giornaliere, ottenuti spazializzando le
stazioni SIR + Aeronautica Militare + LaMMA con una variante dell'algoritmo di **Thornton et al.**
(lo stesso di DAYMET, che è esplicitamente elevation-aware). Più le **climatologie 1995–2014** per
decade, mese, stagione e anno.

Verificato: gli anni disponibili vanno dal **1995 al 2015** e basta (21 risorse per dataset,
`last-modified` ottobre 2024); `Prec_giornaliero_2015.zip` = 35.8 MB, `Prec_climatologia.zip` = 6.9 MB
(l'URL nei metadati è sbagliato: manca `/download/`, quello pubblicato dà 404).

Verdetto onesto: **non sono una fonte operativa**. Sono la cosa migliore che esista per
(a) validare la mia interpolazione contro una spazializzazione fatta da chi conosce il territorio,
(b) avere una climatologia a 1 km indipendente da ERA5. Vanno scaricati una volta, non integrati
in pipeline.

**0.5 — La letteratura non supporta il modello baseline, e non supporta lo shock termico.**
Vedi §J.1. In breve: lo studio di campo più solido disponibile (Brejon Lamartiniere & Hoffman 2026,
10 anni di censimento giornaliero di *B. edulis* in faggeta) trova che la finestra ottimale è
**20 giorni per la temperatura** (quadratica, ottimo ≈ **13 °C**) e **26 giorni per la
precipitazione** (lineare, **nessuna soglia superiore**). Il baseline usa una cumulata di **3 giorni**
con lag a 12 e una saturazione a 45 mm: entrambe le scelte sono contraddette dai dati.
E lo shock termico — che il prompt indica come "il fattore che discrimina di più sul porcino
autunnale" — **non compare** fra i predittori di quello studio, né di quelli mediterranei che ho
trovato. Le prove esistono, ma su saprotrofi *coltivati*. Lo tratterò come parametro calibrabile a
peso iniziale zero, non come fattore strutturale.

---

## A. FONTI DATI TROVATE

Legenda affidabilità: **A** = istituzionale, verificato oggi, stabile. **B** = istituzionale ma
statico/datato. **C** = utile ma da valutare.

| # | Fonte | Cosa aggiunge | Affid. | Verdetto |
|---|---|---|---|---|
| 1 | **SIR — `dati.php`** | serie storiche complete dal 1961, 12 grandezze | A | **Sì**, solo per backfill una tantum |
| 2 | **SIR — GeoServer WFS** | valori giornalieri di ieri, tutte le stazioni, 1 chiamata | A | **Sì**, è il cuore dell'operativo |
| 3 | **Open-Meteo Forecast** | previsioni, suolo, ET0, VPD, radiazione, multi-località | A | **Sì**, fonte primaria per tutto ciò che il SIR non misura |
| 4 | **Open-Meteo Archive (ERA5/ERA5-Land)** | 1940→oggi per cella, per climatologia e backtest | A | **Sì** |
| 5 | **Open-Meteo Ensemble** | 122 membri ECMWF+ICON-EU+GEFS in 1 chiamata | A | **Sì**, alimenta il confidence |
| 6 | **LaMMA CKAN** | grigliati 1 km 1995–2015 + climatologie 1995–2014 | B | **Sì**, offline, per calibrazione e validazione |
| 7 | **LaMMA bollettini XML** | previsioni per località, bollettino montagna | C | **Forse**, solo testo per l'UI |
| 8 | **Geoscopio UCS 10k 2019** | uso e copertura del suolo vettoriale | A | **Sì**, è il livello forestale operativo |
| 9 | **Geoscopio DTM 2023** | quota, pendenza, esposizione | A | **Sì** |
| 10 | **Inventario Forestale Toscano (IFT)** | tipologie forestali, pixel 400 m | B | **Forse**, vedi §N.3 |
| 11 | **Copernicus HRL — DLT / TCD** | latifoglie/conifere e densità di chioma a 10 m | A | **Sì** in Phase 2 |
| 12 | **Bonannella et al. 2022 (Zenodo)** | probabilità di presenza *per specie arborea* a 30 m | C | **Forse**, è la vera chiave dell'host tree match |
| 13 | **CFR Toscana** | tempo reale sub-orario, radar | C | **No** in v1, vedi §F.6 |
| 14 | **Corine Land Cover** | fallback pan-europeo | A | **No**, l'UCS regionale è migliore ovunque |
| 15 | **Copernicus Land Monitoring Service (CLMS)** | umidità/temperatura suolo | A | **No**, vedi §T.8 |

### Fonti che ho scartato e perché

- **Corine Land Cover** — 100 m, nomenclatura più grossolana dell'UCS 10k regionale, che copre lo
  stesso territorio meglio e con la stessa licenza. Zero valore aggiunto in Toscana.
- **CLMS per suolo** — conferma della correzione già nel prompt: Copernicus Marine è oceanografia,
  il corrispettivo terrestre è CLMS. Ma per temperatura e umidità del suolo Open-Meteo espone già
  i derivati ERA5-Land nella stessa chiamata in cui prendo tutto il resto. CLMS aggiungerebbe una
  fonte, un formato (NetCDF/GeoTIFF), un'autenticazione e un job di download per ottenere
  sostanzialmente lo stesso dato. **Non giustificato.**
- **Scraping HTML di CFR/SIR** — inutile: esistono JSON e WFS ufficiali.

---

## B. URL, API, DOCUMENTAZIONE

### B.1 SIR — archivio storico (`dati.php`)

```
Anagrafica GeoJSON   https://www.sir.toscana.it/archivio/dati.php?D=json_stations
Serie                https://www.sir.toscana.it/archivio/dati.php?IDST=<TIPO>&D=json&IDS=<CODICE>
Report mensili       https://www.sir.toscana.it/archivio/dati.php?D=json_reports
```

`IDST` verificati oggi — **il prompt ne elencava 6, ne esistono 12**:

| `IDST` | grandezza | stazioni tot. | attive 2026 |
|---|---|---|---|
| `pluvio` | pioggia 24h (9–9) | 1151 | 401 |
| **`pluvio0_24`** | **pioggia 24h (0–24)** | **488** | **401** |
| `termo_max` | temperatura massima | 432 | 253 |
| `termo_min` | temperatura minima | 432 | 253 |
| `igro0_24` | umidità relativa media | 234 | 191 |
| `anemo_vel` | velocità vento media | 149 | 144 |
| `anemo_dir` | direzione vento media | 149 | 144 |
| `anemo_raf` | velocità raffica | 149 | 144 |
| `idro_l` | livello idrometrico | 210 | 182 |
| `idro_p` | portata | 123 | 29 |
| `idro_h12` | livello istantaneo ore 12 | 51 | 0 |
| `freati` | livello freatico | 163 | 120 |

Anagrafica: 1411 stazioni, 1.45 MB, 11.3 s (lenta — va cachata aggressivamente).
Serie: 340–390 KB ciascuna, 0.4–0.5 s.

### B.2 SIR — GeoServer OGC (la scoperta)

```
GetCapabilities  https://geo.sir.toscana.it/geoserver/geo/ows?service=WFS&version=2.0.0&request=GetCapabilities
GeoJSON          .../ows?service=WFS&version=2.0.0&request=GetFeature&typeName=geo:<LAYER>&outputFormat=application/json
```

Layer rilevanti (39 totali):
`sir_pluviometri_valori_ieri_pubblico`, `sir_pluviometri_valori_ieri9_pubblico`,
`sir_termometri_valori_ieri_pubblico`, `sir_idrometri_valori_ieri_pubblico`,
`sir_freatimetri_valori_ieri_pubblico`, `cf_pluviometri`, `cf_termometri`, `cf_anemometri`,
`cf_igrometri`* , `cf_zoneallerta_395`, `cf_bacini183`.
(*non presente nella lista: gli igrometri non hanno un layer dedicato.)

Schema osservato:
```json
{"gid":389,"idstazione":"TOS11000114","nome":"Abbadia S. S. - Laghetto Verde",
 "valore":0,"dataora":"2026-09-16T07:00:00Z","data_aggiornamento":"2026-09-17T10:30:03.568Z"}
```
Termometri: `t_max`, `t_min`, `t_med` invece di `valore`.

### B.3 Open-Meteo

```
Forecast   https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&elevation=..&daily=..&hourly=..&past_days=92&forecast_days=16
Archive    https://archive-api.open-meteo.com/v1/archive?...&start_date=..&end_date=..
Ensemble   https://ensemble-api.open-meteo.com/v1/ensemble?...&models=ecmwf_ifs025,icon_eu,gfs025
```

### B.4 Cartografia

```
UCS WMS      https://www502.regione.toscana.it/wmsraster/com.rt.wms.RTmap/wms?map=wmsucs&service=WMS&request=GetCapabilities
UCS download http://www502.regione.toscana.it/geoscopio/download/tematici/ucs_rt/USO_E_COPERTURA_DEL_SUOLO_REGIONE_TOSCANA.zip
IFT download http://www502.regione.toscana.it/geoscopio/download/tematici/ift/index.html
DTM 2023     via dati.toscana.it → dataset `dtm-2023` (WMS + URL)
CKAN RT      https://dati.toscana.it/api/3/action/package_show?id=<slug>
CKAN LaMMA   https://dati.lamma.toscana.it/api/3/action/package_search?q=<query>
```
Il WMS UCS espone **396 layer**; quelli utili sono `rt_ucs.iducs.10k.2019.rt.full` (UCS 10k 2019)
e `rt_ucs.iducs.10k.2019-1954.rt` (aree boscate).

**Nota operativa sul robots.txt:** confermato che `dati.toscana.it` blocca i crawler, ma
`/api/3/action/` risponde normalmente a una richiesta HTTP diretta. Le chiamate CKAN in questo
report sono state fatte così. Vanno fatte solo server-side, non da un fetcher che rispetta robots.

---

## C. LICENZE — e il problema che nessuno si aspetta

| Fonte | Licenza | Verificata come |
|---|---|---|
| **SIR / Regione Toscana (stazioni, pluviometri)** | **CC-BY-SA** | `package_show?id=stazioni-meteo-idrologiche` → `license_id: "cc-by-sa"`; idem `pluviometri` |
| **LaMMA** | **CC-BY** (159/162 dataset) | facet `license_id` su `dati.lamma.toscana.it` |
| **UCS — Uso e Copertura del Suolo** | **CC-BY** | `package_show?id=ucs` |
| **DTM 2007/2017/2023** | **CC-BY-4.0** | ricerca CKAN `q=DTM` |
| **IFT** | **CC-BY-SA 4.0** | pagina di download Geoscopio |
| **Open-Meteo (dati)** | **CC-BY 4.0** | `open-meteo.com/en/terms` |
| **Open-Meteo (uso API gratuita)** | **solo non commerciale** | idem |
| **Copernicus HRL** | libera, Reg. (UE) 1159/2013 | catalogo EEA |
| **Brejon Lamartiniere & Hoffman 2026** | CC-BY-NC 4.0 | frontespizio preprint |

### C.1 Il conflitto CC-BY-SA × non-commerciale — decisione richiesta

Due vincoli si sommano male:

1. **Il SIR è CC-BY-SA, non CC-BY.** Share-alike. Un MPI calcolato a partire dalle osservazioni SIR
   è plausibilmente un'opera derivata, e ridistribuirlo (la mappa pubblica *è* ridistribuzione)
   potrebbe obbligare a rilasciare l'output sotto la stessa licenza. Non è un problema se il progetto
   resta aperto — lo diventa se un giorno vuoi chiudere i dati.
2. **L'API gratuita di Open-Meteo è per uso non commerciale.** I *dati* sono CC-BY (quindi
   commercialmente usabili), ma il *servizio* gratuito no. Basta un abbonamento o un banner
   pubblicitario per far scattare l'obbligo del piano a pagamento.

Le due cose interagiscono: se un giorno l'app diventa commerciale, devi pagare Open-Meteo **e**
verificare che lo share-alike del SIR non ti costringa comunque ad aprire i punteggi.
→ **Domanda 1** in §Domande aperte.

**Formula di attribuzione che propongo per l'UI** (in footer e nel bottom sheet di ogni cella):

> Dati osservati: Regione Toscana — Servizio Idrologico Regionale (CC BY-SA).
> Dati modellati e previsti: Open-Meteo.com (CC BY 4.0), basati su ECMWF IFS, DWD ICON, NOAA GFS e ERA5.
> Cartografia: Regione Toscana — SIPT, Uso e Copertura del Suolo (CC BY) e DTM (CC BY 4.0).
> Climatologie di confronto: Consorzio LaMMA (CC BY).

---

## D. FREQUENZA DI AGGIORNAMENTO

| Fonte | Frequenza reale | Come lo so | Cron proposto |
|---|---|---|---|
| SIR GeoServer `valori_ieri` | 1×/giorno, ~10:30 UTC | campo `data_aggiornamento` | 1×/giorno alle 11:30 UTC |
| SIR `dati.php` | idem (serie chiuse a ieri) | ultimo record = ieri | mai, dopo il backfill |
| SIR anagrafica | rara (metadati CKAN: 2018) | `metadata_modified` | 1×/settimana |
| Open-Meteo forecast | ECMWF 4×/g, ICON 4×/g, GFS 4×/g | doc. Open-Meteo | 2×/giorno (06:00, 18:00 UTC) |
| Open-Meteo archive | ERA5 con ~5 giorni di ritardo | doc. Open-Meteo | 1×/mese |
| Open-Meteo ensemble | come i modelli sorgente | — | 1×/giorno |
| LaMMA grigliati | **fermi al 2015** | risorse CKAN | una tantum |
| UCS / DTM / IFT | anni | CKAN | una tantum, ricontrollo annuale |

**Conseguenza importante:** il dato osservato si muove **una volta al giorno**. Il prompt propone
"osservazioni ogni 30–60 min": sul dato giornaliero SIR **non ha senso** — non cambia nulla fra
un'esecuzione e l'altra. Ha senso solo se si aggiunge il tempo reale sub-orario del CFR (§F.6),
che però in v1 non consiglio. Su piano Vercel Hobby, peraltro, sarebbe comunque impossibile (§F.7).

---

## E. VARIABILI DISPONIBILI

### E.1 Osservate (SIR) — `OBSERVED`
`precipitation_24h_0_24` (mm), `precipitation_24h_9_9` (mm), `t_max`, `t_min`, `t_med` (°C),
`relative_humidity_mean` (%), `wind_speed_mean`, `wind_gust` (m/s), `wind_direction` (°),
`water_table_level` (m), `river_level` (m), `river_discharge` (m³/s).
Più il flag qualitativo `TipoValore` (osservato oggi: `P`) — da mappare esplicitamente e conservare.

### E.2 Modellate e previste (Open-Meteo) — `MODELLED` / `FORECAST`
Verificate in una singola chiamata reale a 7 località:

*daily*: `precipitation_sum`, `temperature_2m_max`, `temperature_2m_min`,
`et0_fao_evapotranspiration`, `shortwave_radiation_sum`, `wind_speed_10m_max`, `precipitation_hours`
*hourly*: `soil_temperature_0_to_7cm`, `soil_moisture_0_to_7cm`, `soil_moisture_7_to_28cm`,
`vapour_pressure_deficit`, `relative_humidity_2m`, `wind_speed_10m`, `shortwave_radiation`,
`dew_point_2m`, `temperature_2m`, `precipitation`

Risposta: `past_days=92 + forecast_days=16` → **108 giorni daily, 2592 ore hourly**, 7 località,
**1.28 MB in 0.66 s**. `elevation` restituita esattamente come richiesta (910, 840, 1050, 1000,
1000, 900, 600 m): **il downscaling di quota funziona davvero**, non è un parametro cosmetico.

### E.3 Territoriali
UCS 10k 2019 (classe di copertura), DTM 2023 (quota → pendenza, esposizione, curvatura,
irraggiamento potenziale), IFT (tipologia forestale, 400 m).

---

## F. LIMITI TECNICI ACCERTATI

**F.1 — Nessun filtro temporale su `dati.php`, confermato.**
Testati `&ANNO=2026`, `&DATA_INIZIO=`, `&FROM=&TO=`, `&LIMIT=`: **tutti ignorati**, risposta
identica a 387.693 byte in ogni caso. Il prompt aveva ragione. Ma §0.2 rende la cosa irrilevante.

**F.2 — Grandezze sparse su stazioni diverse: confermato, ma meno grave del previsto.**
Ho calcolato per ciascuna delle 7 zone la stazione migliore per ogni grandezza, con due criteri
(più vicina; migliore compromesso distanza + somiglianza di quota, penalizzando 100 m di dislivello
come 1 km di distanza):

| Zona | pioggia | Tmax/Tmin | RH | vento |
|---|---|---|---|---|
| **Monte Amiata** | Laghetto Verde 0.0 km Δq 0 | idem | idem | idem |
| **Casentino** | Badia Prataglia 1.6 km Δq 5 | Camaldoli 4.1 km Δq 271 | Zoo di Poppi 8.4 km Δq 423 | Stia Monte 13.5 km Δq 2 |
| **Pratomagno** | Trappola 3.9 km Δq 181 | Trappola | Trappola | Pratomagno 11.7 km Δq 355 |
| **Garfagnana** | Orecchiella 2.7 km Δq 169 | Orecchiella | Orecchiella | Careggine 9.5 km Δq 100 |
| **App. pistoiese** | Melo 3.7 km Δq 0 | Melo | Melo | Croce Arcana 4.2 km Δq 716 |
| **Mugello** | Monte di Fò 2.9 km Δq 80 | Monte di Fò | Monte di Fò | Giogo 7.0 km Δq 20 |
| **Colline Metallifere** | Campiano 4.3 km Δq 100 | Campiano | Campiano | Prata 8.9 km Δq 72 |

Due cose emergono:
- Per **pioggia e temperatura** la copertura è ottima (≤4 km, Δq ≤180 m tranne il Casentino).
  La tesi del prompt — "non esiste la stazione della zona" — è vera in generale ma non è il caso
  limitante sulle 7 zone di partenza.
- Per il **vento** è pessima ovunque: 7–13 km e fino a 716 m di dislivello (Croce Arcana per
  Cutigliano). Il vento **va preso da Open-Meteo**, non dal SIR. Confermato il disegno per-variabile.
- **Il criterio di selezione conta.** In Garfagnana la stazione più vicina è Villacollemandina
  (2.6 km ma **502 m più in basso**); quella giusta è Orecchiella (2.7 km, Δq 169 m). Un
  nearest-neighbour ingenuo prenderebbe la prima ed è proprio l'errore che il prompt descrive.

**F.3 — I dati recenti non sono validati.** Confermato: le serie 2026 hanno `TipoValore: "P"`,
non "Anno Validato". Sui tre layer WFS letti oggi i nulli sono il **0.5–0.8 %** (2 stazioni su 417
per la pioggia, 2 su 263 per la temperatura). Basso, ma i nulli non sono l'unico problema: uno
zero costante da pluviometro guasto passa inosservato. Vedi §I.4.

**F.4 — Codifica rotta nell'anagrafica.** `"Monte di Fò"` arriva come `"Monte di FÃ²"`: il server
serve testo Latin-1 in un JSON dichiarato UTF-8. Non è cosmetico — i nomi delle stazioni finiscono
in UI e nelle ricerche. L'adapter deve tentare la riparazione `mojibake`
(`s.encode('latin-1').decode('utf-8')`) con fallback al valore originale se fallisce.

**F.5 — Limite di lunghezza URL su Open-Meteo.** Testato lo scaling multi-località:

| località | bytes | tempo | lunghezza URL |
|---|---|---|---|
| 100 | 0.17 MB | 0.33 s | 1.770 |
| 500 | 0.84 MB | 0.90 s | 8.099 |
| **1000** | — | — | **HTTP 414** |

→ **massimo ~500 coordinate per GET**. Con hourly attivo, 200 località = 6.6 MB. Va gestito con
batch e, se serve, POST (da verificare se supportato).

**F.6 — CFR Toscana: nessuna API strutturata.** `cfr.toscana.it/monitoraggio/stazioni.php` e
`sir.toscana.it/monitoraggio/dati_recenti.php` restituiscono **solo HTML** (85 KB e 4.7 KB), senza
endpoint JSON individuabile. Il radar precipitazioni non è esposto come servizio interrogabile.
→ **Escluso dalla v1.** Riprenderlo solo se serve davvero il sub-orario, e allora con parsing HTML
esplicito e fragile, isolato in un adapter sacrificabile.

**F.7 — Vercel Hobby: cron una volta al giorno.** Verificato sulla documentazione
(`last_updated: 2026-07-15`): Hobby = **100 cron job ma minimo una esecuzione al giorno**, con
precisione **±59 minuti**; le espressioni più frequenti **falliscono in fase di deploy**.
Funzioni: 300 s massimi, 2 GB, payload 4.5 MB. Pro: cron al minuto, 800 s.
→ Il piano cron del prompt ("osservazioni ogni 30–60 min, forecast ogni 3–6 h") **richiede il piano
Pro**. Con il vincolo "costo pressoché nullo", vedi §G.3.

**F.8 — Peso delle chiamate Open-Meteo ≠ numero di richieste HTTP.** Il conteggio è frazionario:
più di 10 variabili o più di 2 settimane per località contano come chiamate multiple, con un
minimo di 14 giorni. Il numero di località moltiplica. È il vincolo che governa il dimensionamento
della griglia (§R.2). La formula esatta per il multi-località **non è documentata** (issue
open-meteo#1295 aperta e senza risposta): il mio modello di costo assume il caso peggiore,
`peso ≈ n_località × max(n_var,10)/10 × max(giorni,14)/14`.

---

## G. ARCHITETTURA PROPOSTA

### G.1 Dove NON far girare i calcoli pesanti

Il prompt chiede una risposta motivata, non un aggiramento. Eccola.

Il backfill storico SIR è ~400 stazioni × 4 grandezze × 390 KB ≈ **600 MB** di download e parsing.
Il ricalcolo MPI su griglia è O(celle × giorni × specie). Nessuno dei due sta in una funzione
serverless da 300 s, e **spezzarli in chunk da 300 s con una coda è ingegneria inventata per
aggirare un limite che non siamo obbligati ad accettare**.

**La risposta è: non gira su Vercel.** Gira su **GitHub Actions**, che per un repository pubblico
ha minuti illimitati, 7 ore di runtime per job, 14 GB di disco e cron nativo. È gratis, è già
accanto al codice, ha log e retry, e il job è un normale script Node/TypeScript versionato.
Vercel resta ciò per cui è bravo: servire l'app e le API di lettura.

Contropartita onesta: il cron di GitHub Actions è **best-effort** e in orari di punta può ritardare
di 15–30 minuti. Per un processo con latenza biologica di 10–15 giorni, irrilevante.

### G.2 Perché non Celery — d'accordo, ma per un motivo diverso

Il prompt dice che Celery non serve perché il processo ha latenza di 10–15 giorni. Concordo sulla
conclusione, non del tutto sulla premessa: il vero motivo è che **non c'è fan-out da orchestrare**.
L'intero aggiornamento giornaliero è 3 GET al SIR, ~50 GET a Open-Meteo e un calcolo vettoriale.
Sono minuti di un singolo processo. Un broker più un worker sempre accesi sarebbero costo fisso
mensile per coordinare un lavoro che non ha bisogno di coordinamento.

### G.3 Architettura di riferimento

```
┌──────────────── GITHUB ACTIONS (gratis, repo pubblico) ────────────────┐
│  backfill-historical.yml   manuale, una tantum                         │
│      SIR dati.php ×12 IDST → raw → normalize → QC → Postgres           │
│      Open-Meteo Archive ERA5 1991-2020 per anchor → climatologia       │
│      LaMMA grigliati+climatologie → validazione interpolazione         │
│                                                                        │
│  daily-observations.yml    cron 11:30 UTC                              │
│      3 GET GeoServer → QC → weather_observations (upsert)              │
│                                                                        │
│  forecast.yml              cron 06:30 / 18:30 UTC                      │
│      Open-Meteo forecast+ensemble su anchor grid → weather_forecasts   │
│                                                                        │
│  compute-mpi.yml           dopo ogni ingestione riuscita               │
│      interpolazione → feature engineering → MPI engine → mpi_scores    │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │ scrive
                    ┌────────────▼────────────┐
                    │  Supabase Postgres+PostGIS │  free tier
                    │  RLS sui dati utente       │
                    └────────────┬────────────┘
                                 │ legge
┌────────────────────────────────▼───────────────────────────────────────┐
│  VERCEL — Next.js 16, App Router, TypeScript strict                    │
│  /api/* sola lettura · ISR e cache CDN · PWA · MapLibre GL             │
└────────────────────────────────────────────────────────────────────────┘
```

### G.4 Valutazione critica dello stack proposto nel prompt

| Scelta | Verdetto | Motivo |
|---|---|---|
| Next.js stable + App Router | **Sì** | già in piedi: Next 16.3.5, build verde, deploy live |
| TypeScript strict | **Sì** | i parametri del modello sono tipi, non commenti |
| PostgreSQL + PostGIS via Supabase | **Sì, con riserva** | vedi sotto |
| Tailwind + shadcn/ui | **Sì** | Tailwind v4 già configurato e verificato sul CSS emesso |
| MapLibre GL | **Sì** | l'unica alternativa seria a Mapbox senza costi |
| Recharts | **Sì** | ma valuta visx/uPlot per le serie lunghe |
| Deploy su Vercel | **Sì**, solo per l'app | non per i job |

**Riserva su Supabase:** il free tier mette in pausa i progetti inattivi dopo ~7 giorni e ha
500 MB di database. 500 MB bastano (§R.3), la pausa no: un cron GitHub Actions quotidiano la evita
di fatto, ma è una dipendenza implicita e fragile. Alternativa a costo zero e più robusta:
**Neon** (free tier senza pausa distruttiva, branching utile per i backtest) o
**Turso/libSQL**. Neon però **non ha PostGIS nel free tier in tutte le regioni** — da verificare
prima di decidere. → **Domanda 3**.

**Contesto ai "GIS pesanti":** con l'architettura sopra, PostGIS serve a poco nell'operativo — la
cella è un id in una griglia fissa, l'unica query spaziale runtime è "cella che contiene questo
punto", risolvibile aritmeticamente. PostGIS serve nel **preprocessing** (intersecare UCS e DTM con
la griglia), che gira offline. Questo permette, se serve, un database molto più leggero.

---

## H. SCHEMA DATABASE

Separazione netta fra grezzo, processato, feature e punteggi.

```sql
-- ═══ ANAGRAFICHE E GOVERNANCE ═══
data_sources(id, code, name, url, license, license_url, attribution_text,
             update_frequency, last_sync_at, last_success_at, last_error, is_healthy)

algorithm_versions(id, version, released_at, config_json, notes, is_active)
  -- config_json contiene TUTTI i parametri: soglie, pesi, decay, penalty, specie.
  -- Nessun numero del modello vive nel codice.

-- ═══ LIVELLO RAW ═══
raw_payloads(id, source_id, endpoint, fetched_at, http_status, bytes, sha256, body_ref)
  -- body_ref → object storage; in DB solo l'hash. Permette il replay di un'ingestione.

-- ═══ OSSERVAZIONI ═══
weather_stations(id, code UNIQUE, name, name_raw, municipality, province,
                 elevation_m, geom GEOGRAPHY(POINT,4326), source_id,
                 available_measures JSONB, active_years JSONB, is_active, last_seen_at)

weather_observations(station_id, variable, observed_date, aggregation_window,
                     value NUMERIC, unit, quality_flag_source, quality_flag_internal,
                     provenance, source_id, ingested_at,
                     PRIMARY KEY (station_id, variable, observed_date, aggregation_window))
  -- aggregation_window ∈ ('0_24','9_9','instant') — MAI implicito.
  -- quality_flag_internal ∈ ('ok','suspect_jump','suspect_flat','out_of_range',
  --                          'spatial_outlier','missing','interpolated')

-- ═══ PREVISIONI ═══
weather_forecasts(cell_id, variable, target_date, run_at, model, value,
                  PRIMARY KEY (cell_id, variable, target_date, run_at, model))
forecast_ensemble(cell_id, variable, target_date, run_at,
                  member_count, p10, p25, p50, p75, p90, spread, agreement_score)
  -- 122 membri non si salvano tutti: si salvano i quantili.

-- ═══ GRIGLIA E TERRITORIO ═══
grid_cells(id, resolution_m, geom GEOGRAPHY(POLYGON,4326), centroid GEOGRAPHY(POINT,4326),
           elevation_m, slope_deg, aspect_deg, tpi, is_anchor BOOLEAN,
           anchor_cell_id, forest_fraction, admin_municipality, admin_province)
  -- is_anchor: la cella su cui si chiama davvero Open-Meteo. Le altre ereditano e correggono.

terrain_data(cell_id, source_id, elevation_m, slope_deg, aspect_deg,
             potential_solar_radiation, computed_at)
vegetation_data(cell_id, source_id, ucs_class, ucs_class_label, forest_type,
                canopy_density, dominant_leaf_type, host_species JSONB, confidence)
soil_data(cell_id, source_id, texture_class, water_holding_capacity_mm, depth_class)

-- ═══ FEATURE DERIVATE ═══
cell_features(cell_id, feature_date, algorithm_version_id,
              rain_24h, rain_48h, rain_72h, rain_5d, rain_7d, rain_10d,
              rain_14d, rain_21d, rain_26d, rain_30d,
              et0_3d, et0_7d, et0_14d,
              effective_moisture_7d, effective_moisture_14d, effective_moisture_21d,
              swb_mm, swb_deficit_days,
              t_mean_20d, t_min_window, t_max_window, t_soil_mean_7d,
              vpd_mean_7d, wind_mean_7d, rh_mean_7d,
              last_event_id, days_since_event, drought_index_prior,
              rain_percentile_26d, t_percentile_20d,
              provenance_map JSONB, confidence_map JSONB,
              PRIMARY KEY (cell_id, feature_date, algorithm_version_id))
  -- provenance_map e confidence_map sono PER VARIABILE, non per riga.
  -- {"rain_7d":{"prov":"OBSERVED","conf":88}, "soil_moisture":{"prov":"MODELLED","conf":54}}

rain_events(id, cell_id, start_date, end_date, total_mm, duration_days,
            max_daily_mm, intensity_mm_day, prior_dry_days, prior_rain_30d)

-- ═══ PUNTEGGI ═══
species(id, code, scientific_name, common_name_it, group_code, is_active)
species_parameters(species_id, algorithm_version_id, param_key, param_value,
                   source_citation, source_url, is_calibrated BOOLEAN)
  -- is_calibrated = false → "parametro da calibrare", non dato scientifico.
  -- source_citation OBBLIGATORIA quando is_calibrated = true.

mpi_scores(cell_id, species_id, score_date, horizon_type, algorithm_version_id,
           mpi NUMERIC, confidence NUMERIC,
           trend_7d, best_window_start, best_window_end,
           breakdown JSONB, computed_at,
           PRIMARY KEY (cell_id, species_id, score_date, horizon_type, algorithm_version_id))
  -- horizon_type ∈ ('CURRENT','DEVELOPMENT','FORECAST')
  -- Salvare algorithm_version_id nella PK è ciò che rende possibile il confronto fra versioni.

-- ═══ UTENTE ═══
user_locations(id, user_id, name, geom, radius_m, species_ids, privacy_level)
user_observations(id, user_id, observed_at, cell_id, geom_exact, geom_public,
                  species_id, abundance ENUM('none','few','some','many','exceptional'),
                  outcome, elevation_m, photo_ref, notes, privacy_level,
                  mpi_at_observation, confidence_at_observation, algorithm_version_id)
  -- mpi_at_observation è congelato al momento dell'inserimento: è il dato di calibrazione.
  -- geom_exact privato; geom_public = geom_exact sfocato secondo privacy_level.
alerts(id, user_id, location_id, species_id, trigger_json, channel, is_active, last_fired_at)

-- ═══ OSSERVABILITÀ ═══
ingestion_runs(id, source_id, started_at, finished_at, status, records_in,
               records_written, records_rejected, error_json)
```

**Tre scelte che vale la pena difendere:**
1. `aggregation_window` esplicita in chiave primaria — rende *impossibile* mescolare 9-9 e 0-24.
   È la trappola §0.1 codificata nello schema.
2. `provenance_map` e `confidence_map` per-variabile in JSONB — il prompt chiede confidence
   per-variabile; metterlo in colonne separate significherebbe 40 colonne.
3. `algorithm_version_id` in tutte le chiavi dei risultati — il backtest e il confronto fra versioni
   diventano `WHERE`, non migrazioni.

---

## I. PIPELINE

```
RAW → INGESTION → NORMALIZATION → QUALITY CONTROL → SPATIAL INTERPOLATION
    → FEATURE ENGINEERING → MPI ENGINE → DB → API → APP
```

**I.1 RAW.** Ogni risposta HTTP è salvata integra con hash e timestamp prima di essere toccata.
Costa poco e rende ogni bug riproducibile.

**I.2 INGESTION — adapter per provider.** Interfaccia unica:
```ts
interface WeatherSourceAdapter {
  readonly sourceCode: string
  listStations(): Promise<StationRecord[]>
  fetchDaily(range: DateRange, stations?: string[]): Promise<RawObservation[]>
  readonly capabilities: { variables: Variable[]; windows: AggregationWindow[]; supportsIncremental: boolean }
}
```
Implementazioni: `SirGeoserverAdapter` (incrementale), `SirArchiveAdapter` (backfill),
`OpenMeteoForecastAdapter`, `OpenMeteoArchiveAdapter`, `OpenMeteoEnsembleAdapter`.
Con retry esponenziale, timeout, circuit breaker per fonte e logging strutturato per run.

**I.3 NORMALIZATION.** `Valore: "24.6"` (stringa, `null` possibile) → `NUMERIC | null`.
Timestamp → UTC esplicito. Riparazione mojibake (§F.4). Mappatura `TipoValore` → enum tipizzato.
Unità normalizzate. **Nessun valore prosegue senza `aggregation_window`.**

**I.4 QUALITY CONTROL.** Cinque controlli, ciascuno produce un `quality_flag_internal` e non
scarta silenziosamente:
- **range climatico** — pioggia < 0 o > 400 mm/24 h; T fuori da [−25, +45] °C; T_min > T_max.
- **salto impossibile** — |ΔT| > 15 °C su 24 h senza corrispondenza nelle stazioni vicine.
- **zero sospetto prolungato** — pluviometro a 0.0 per N giorni mentre ≥3 stazioni entro 20 km e
  Δq < 300 m registrano pioggia. È il guasto più insidioso perché non produce anomalie evidenti.
- **outlier spaziale** — |valore − mediana dei vicini| > k·MAD.
- **staleness** — nessun dato nuovo da >48 h → stazione marcata offline, esclusa
  dall'interpolazione e segnalata nel pannello admin.

**I.5 SPATIAL INTERPOLATION.** §L.

**I.6 FEATURE ENGINEERING.** §J.2. Deterministico, puro, senza I/O: è la parte che si testa con le
fixture meteorologiche.

**I.7 MPI ENGINE.** Funzione pura `(features, speciesParams, algorithmConfig) → MpiResult`.
Nessun accesso a rete o database. È ciò che rende banali sia il backtest sia il simulatore admin.

---

## J. ALGORITMO MPI v1

### J.1 Base scientifica — cosa dice davvero la letteratura

Fonte principale: **Brejon Lamartiniere E. & Hoffman J.I. (2026)**, *Predicting porcini: a decade of
sporocarp monitoring reveals the meteorological triggers of Boletus edulis fruiting in central
European beech forests*, bioRxiv `10.64898/2025.12.12.693895`, CC-BY-NC 4.0.
Dieci anni (2015–2024) di osservazioni **giornaliere e quasi esaustive** di *B. edulis* in faggeta
presso Bielefeld; GLMM binomiale negativo con finestre scorrevoli allineate a destra da 2 a 35 giorni,
selezione per AIC su tutte le combinazioni.

Risultati citabili:

| Parametro | Valore | Note |
|---|---|---|
| Finestra ottimale temperatura | **20 giorni** | selezione per AIC |
| Forma dell'effetto temperatura | **quadratica**, ottimo ≈ **13 °C** | differenza < 0.6 °C fra tre modelli |
| Finestra ottimale precipitazione | **26 giorni** | selezione per AIC |
| Forma dell'effetto precipitazione | **lineare, nessuna soglia superiore** | coerente con Tsunoda et al. 2025 |
| Zona di fruttificazione concentrata | T 20g **10–15 °C**, pioggia 26g **2–4 mm/giorno** | ossia **52–104 mm su 26 giorni** |
| Fruttificazione quasi assente | T 20g **5–10 °C** | pur essendo la condizione più frequente nel dataset |

Fonte di supporto: **Karavani et al. (2018)**, *Agric. For. Meteorol.* 248: 432–440 — in pinete
mediterranee l'effetto della precipitazione sull'umidità del suolo **ritarda fino a un mese**.
Coerente con la finestra di 26 giorni sopra, e trovato in un clima molto più simile alla Toscana.

**Tre conseguenze che contraddicono le premesse del progetto:**

1. **Il lag di 12 giorni del baseline non è supportato.** Il preprint spiega anche perché il
   baseline "funziona" comunque: gli studi che *escludono la temperatura* stimano lag < 2 settimane,
   perché il lag corto della pioggia assorbe il segnale termico. Il baseline non ha un termine
   termico indipendente dalla finestra dell'innesco, quindi cade in quel caso.
2. **La saturazione a 45 mm è da rimuovere.** Due studi indipendenti non trovano soglia superiore.
   L'ho visto anche nei dati: oggi Garfagnana (147 mm su 26 g) e Appennino pistoiese (95 mm su 26 g)
   ricevono dal baseline **lo stesso identico punteggio, 67.4**, perché entrambe saturano.
3. **Lo shock termico non ha supporto di campo.** Non compare fra i predittori testati in nessuno
   studio di campo che ho trovato. Le prove sperimentali riguardano **saprotrofi coltivati**
   (*Flammulina filiformis*, *Lentinula edodes* indotto a 18 °C, *Pleurotus*) — organismi e
   condizioni diversi. Il prompt lo indica come "il fattore che discrimina di più": **non posso
   confermarlo, e non lo inserirò come fattore a peso fisso.** Entra come termine opzionale con
   `is_calibrated = false` e **peso iniziale 0**, esplicitamente etichettato come ipotesi da
   validare con il diario uscite. Se i tuoi dati lo confermano, il peso sale: questo è esattamente
   il motivo per cui il diario è progettato per calibrare.

### J.2 Il modello — struttura

Il baseline è moltiplicativo puro: un fattore a zero azzera tutto. Produce i salti che si vedono
nei dati reali (§J.4). Propongo una struttura a **tre stadi con moltiplicatori limitati**:

```
MPI = 100 · saturate( W · T · Φ ) · Π penalty_i        con penalty_i ∈ [floor_i, 1]
```

**Stadio 1 — W: disponibilità idrica (il cuore).**
Non la somma dei millimetri, ma un bilancio con decadimento a λ variabile:

```
S(t) = Σ_{i=0..N}  P(t-i) · exp( −Λ(t-i, t) )
Λ(a,b) = Σ_{k=a..b} λ_k                 (decadimento cumulato, non λ costante)

λ_k = λ0 · f_T(T_k) · f_ET(ET0_k) · f_wind(U_k) · f_soil(cell) · f_canopy(cell) · f_aspect(cell)
```
con, come punto di partenza da calibrare:
- `f_T = exp(β_T · (T_k − 13))` — il decadimento accelera col caldo. 13 °C come riferimento perché
  è l'ottimo misurato, non un numero scelto.
- `f_ET = ET0_k / ET0_ref` — è il termine che il baseline non ha affatto, e che spiega perché una
  buona pioggia può essere annullata.
- `f_canopy` < 1 sotto chioma densa (evaporazione ridotta, umidità trattenuta), > 1 in radura.
- `f_aspect` < 1 sui versanti nord.

Poi la normalizzazione che risolve il punto del prompt sulla soglia:
```
W = clamp( (S(t) − D0(SM_iniziale)) / (S_ref − D0), 0, 1.15 )
D0 = deficit iniziale, funzione decrescente di soil_moisture_0_to_7cm a inizio finestra
```
**È qui che la soglia di pioggia diventa funzione dell'umidità di partenza**, come richiesto:
con suolo già umido `D0 → 0` e 30 mm bastano; dopo siccità `D0` è alto e ne servono 70.
Nessuna soglia rigida "50–80 mm" compare da nessuna parte.
Il tetto a **1.15** e non 1.0 riflette la mancanza di soglia superiore trovata in letteratura:
più pioggia continua ad aiutare, ma con rendimento decrescente.

**Stadio 2 — T: idoneità termica.**
```
T = gauss( T_mean_20d ; μ = 13.0 , σ = σ_specie )   ·   gauss( T_soil_7d ; μ_soil , σ_soil )
```
Gaussiana e non `band()` a spigoli: la relazione misurata è quadratica sulla scala del link, che
sulla scala della risposta è una campana. μ = 13.0 °C su finestra di **20 giorni** è il singolo
parametro meglio supportato di tutto il modello. σ è per specie e **da calibrare**.

**Stadio 3 — Φ: fenologia e anomalia.**
```
Φ = φ_stagione(giorno_anno, specie, quota) · (1 + γ · z_anomalia)
z_anomalia = percentile della pioggia 26 g rispetto alla climatologia della cella per quella decade
```
Risponde direttamente a "25 mm dopo mesi secchi ≠ 25 mm su terreno già umido" — ma nota che
l'anomalia entra qui come **modulatore**, non come sostituto del bilancio idrico, che già cattura
gran parte dell'effetto tramite `D0`.

**Penalty (moltiplicatori limitati inferiormente, non azzeranti):**

| penalty | condizione | floor | fonte |
|---|---|---|---|
| `p_frost` | `min(T_min)` nella finestra < −1 °C | 0.25 | baseline, da calibrare |
| `p_heat` | `T_max > 30 °C` per ≥3 giorni consecutivi | 0.50 | da calibrare |
| `p_vpd` | `VPD_7d` sopra soglia | 0.70 | da calibrare |
| `p_wind` | `wind_7d` sopra soglia | 0.80 | da calibrare |
| `p_thermal_shock` | calo 4–6 °C seguito da stabilizzazione | **peso 0 in v1** | §J.1 — non supportato |

Il **floor** è la differenza concettuale col baseline: una gelata riduce fortemente ma non annulla,
perché biologicamente la gelata danneggia i carpofori esistenti più di quanto azzeri il potenziale
del micelio. Con il moltiplicatore azzerante, un singolo `band()` fuori range butta via tutto il
resto del calcolo e rende il punteggio non spiegabile.

### J.3 Tre indici temporali

- **`CURRENT_MPI`** — MPI(oggi) con feature `OBSERVED` dove disponibili.
- **`DEVELOPMENT_MPI`** — derivata: `mean(MPI[t+1..t+4]) − mean(MPI[t−3..t])`, normalizzata.
  Risponde a "le condizioni stanno diventando favorevoli", che non è lo stesso di "sono favorevoli".
- **`FORECAST_MPI`** — per ogni giorno da oggi a +7 (estendibile a +14), con confidence decrescente.

**Finestra potenziale**, in linguaggio naturale generato da logica e non da template:
si cerca `argmax_t MPI(t)` sull'orizzonte, si stima la larghezza a mezza altezza del picco, e la
frase si compone da (a) posizione del massimo, (b) larghezza, (c) confidence, (d) fattore limitante
dominante. "Il potenziale sale fino a martedì e resta alto per circa tre giorni; il limite principale
resta la temperatura, ancora sopra l'ottimo di circa 4 °C."

### J.4 Confronto col baseline — misurato oggi sui dati reali

Ho implementato il baseline esattamente come specificato e l'ho eseguito sulle 7 zone con i dati
Open-Meteo del 17 settembre 2026, affiancando gli indicatori suggeriti dalla letteratura:

| Zona | MPI baseline | lag scelto | R3 (mm) | **T 20g (°C)** | **Pioggia 26g (mm)** | ET0 14g (mm) | SM 0-7cm 7g |
|---|---|---|---|---|---|---|---|
| Amiata | 19.8 | 7 | 33.3 | **21.9** | 36.7 | 53.7 | 0.213 |
| Casentino | **0.0** | 12 | 0.0 | 20.9 | 0.4 | 51.4 | 0.257 |
| Pratomagno | **0.0** | 12 | 0.0 | 19.6 | 1.7 | 47.4 | 0.262 |
| Garfagnana | **67.4** | 8 | 78.3 | **19.5** | 147.2 | 47.2 | 0.211 |
| App. pistoiese | **67.4** | 8 | 50.8 | 18.6 | 95.0 | 45.5 | 0.193 |
| Mugello | 19.8 | 6 | 36.9 | 19.9 | 39.6 | 46.0 | 0.248 |
| Colline Metallifere | 21.4 | 7 | 39.4 | **22.6** | 42.5 | 52.3 | 0.247 |

Tre difetti misurati, non ipotizzati:

1. **Saturazione.** Garfagnana e Appennino pistoiese ottengono **lo stesso punteggio** con 147 e
   95 mm su 26 giorni. La differenza è reale e il baseline non la vede.
2. **Cecità termica.** Garfagnana prende 67.4 con una media a 20 giorni di **19.5 °C** — 6.5 °C
   sopra l'ottimo misurato. La `band(Tmax,7,14,23,30)·band(Tmin,2,8,15,20)` è troppo permissiva
   per il porcino autunnale. Tutte e sette le zone hanno T 20g fra 18.6 e 22.6 °C: a metà settembre
   2026 la Toscana è **ancora troppo calda**, e un modello onesto deve dirlo.
3. **Cecità al bilancio idrico.** L'Amiata ha 36.7 mm di pioggia in 26 giorni contro **53.7 mm di
   ET0 in soli 14 giorni**: il bilancio è nettamente negativo, eppure il baseline assegna 19.8
   sulla base di una cumulata di 3 giorni.

**Calibrazione richiesta dal prompt — con una precisazione.** Ho implementato il baseline e cercato
di riprodurre i due punti di riferimento (35 mm/lag 12 → ~66; 60 mm/lag 11 → ~97). **Non si
riproducono con `upkeep` al minimo:** con zero pioggia dopo l'innesco vengono **38.3** e **53.7**.
I valori indicati richiedono **~10–11 mm di pioggia dopo l'innesco** (`upkeep` ≈ 0.95–0.99), che
dà 66.0 e 97.1. È coerente — ma significa che i due numeri di riferimento descrivono uno scenario
"innesco + mantenimento", non il solo innesco. Vale la pena fissarlo per iscritto perché è
esattamente il tipo di assunzione implicita che fa divergere due implementazioni.

Il secondo punto di calibrazione svela anche un difetto: a **60 mm il `rainScore` è già saturo a
1.0** (la piena efficacia è a 45 mm). Il riferimento "97" si trova quindi esattamente sul plateau,
dove il modello ha smesso di distinguere. Conferma §J.4.2 sul caso Garfagnana/Appennino pistoiese.

La mia v1
**non riprodurrà quei numeri**, per costruzione: con temperature ideali (13 °C) e 60 mm distribuiti
su 26 giorni su suolo mediamente umido, W ≈ 0.75 e T ≈ 1.0 danno MPI ≈ 75, non 97. Il motivo è che
**97 su 100 significa "condizioni quasi perfette"**, e 60 mm su 26 giorni sono 2.3 mm/giorno —
dentro la zona buona misurata (2–4 mm/g), ma nella sua metà bassa. Se questa ricalibrazione della
scala non ti convince, è una decisione tua: → **Domanda 5**.

### J.5 explainScore()

```ts
interface MpiExplanation {
  mpi: number; confidence: number; algorithmVersion: string
  positiveFactors:   Factor[]   // { key, label, contribution, value, unit, provenance, source }
  negativeFactors:   Factor[]
  neutralFactors:    Factor[]
  confidenceFactors: ConfidenceFactor[]
  limitingFactor: string        // il singolo fattore che sta abbassando di più il punteggio
  bestWindow: { start: string; end: string; peak: string; narrative: string }
}
```
Ogni fattore riporta **da dove viene il numero** (`provenance`) e **quale fonte lo giustifica**
(`source`). Un fattore senza fonte è visibilmente marcato "parametro da calibrare".
`contribution` è calcolato come differenza rispetto al modello con quel fattore neutralizzato:
è una decomposizione onesta di un modello moltiplicativo, non una ripartizione inventata.

---

## K. ALGORITMO DI CONFIDENCE

Confidence **0–100 per variabile**, poi aggregata al punteggio pesando ogni variabile per il suo
contributo al MPI — non con una media semplice.

```
conf_var = 100 · Π componenti
```

| Componente | Formula | Note |
|---|---|---|
| **distanza** | `exp(−d/d0)` | `d0` per variabile: la pioggia decorrela più in fretta della temperatura |
| **somiglianza di quota** | `exp(−(Δq/Δq0)²)` | il fattore che salva la Garfagnana da Villacollemandina |
| **densità stazioni** | `1 − exp(−n/n0)` | n stazioni valide entro il raggio |
| **qualità del dato** | 1.0 `OBSERVED` valid. → 0.85 `OBSERVED` non valid. → 0.6 `MODELLED` → variabile `FORECAST` | |
| **accordo fra modelli** | `1 − spread_norm` da 122 membri ensemble | verificato: 1 chiamata, 55 KB, 0.19 s |
| **orizzonte** | `exp(−h/h0)` | h giorni nel futuro |
| **risoluzione territoriale** | costante per fonte | UCS 10k > IFT 400 m |

**Perché l'ensemble è la parte migliore di questo disegno:** oggi, per l'Amiata a +3 giorni, i
122 membri danno min 0.0 / mediana 0.0 / max 3.8 mm. Accordo altissimo su "non piove". Fra 10 giorni
lo spread si allarga e il confidence scende da solo, senza regole ad hoc sull'orizzonte.

`MPI 82 / conf 91` e `MPI 82 / conf 43` in UI devono essere visivamente diversi: proposta in §O.

---

## L. STRATEGIA DI INTERPOLAZIONE

**Non nearest-neighbour** — §F.2 mostra perché fallisce (Garfagnana).
**Non IDW puro** — ignora la quota, che in Appennino è il primo fattore.

Propongo **regressione + kriging dei residui** (*regression kriging*), che è anche ciò che LaMMA fa
con l'algoritmo di Thornton:

1. **Trend deterministico**: `y = β0 + β1·quota + β2·lat + β3·lon (+ β4·distanza dal mare)`,
   stimato ogni giorno sulle stazioni valide.
   Per la temperatura β1 è il gradiente termico verticale, stimato dai dati e non assunto a −6.5 °C/km.
2. **Residui** interpolati con IDW anisotropo o kriging ordinario.
3. **Vincolo di quota**: il DTM dà la quota reale della cella; la temperatura viene ricostruita a
   quella quota, non a quella della stazione.
4. **Fusione con Open-Meteo**: dove non ci sono stazioni utili, il campo viene ancorato al valore
   Open-Meteo con `elevation` della cella — che ho verificato funzionare esattamente (§E.2).
   Il peso relativo fra osservato e modellato è il confidence stesso.
5. **Validazione**: leave-one-out cross-validation sulle stazioni, e confronto indipendente contro
   i grigliati LaMMA 1 km 1995–2015 (§0.4). È un banco di prova raro e vale la pena usarlo.

Ogni valore interpolato porta il suo confidence, calcolato in §K.

---

## M. STRATEGIA FORECAST

- **0 → +7 giorni**: deterministico Open-Meteo (best-match multi-modello) per i valori, ensemble
  per lo spread. Aggiornato 2×/giorno.
- **+8 → +16**: solo mediana ensemble, con incertezza mostrata esplicitamente e confidence in calo.
- **Passato (−92 → 0)**: `OBSERVED` SIR dove c'è, `MODELLED` altrove.
- **Oltre −92**: Archive API ERA5 (verificato: 30 anni in 1 s).
- **Blending**: nel giorno di transizione osservato→previsto si evita il salto con una media pesata
  su 24 h. Senza questo, l'utente vede un gradino sul grafico e non si fida più.

---

## N. MODELLO PER SPECIE

### N.1 Principio: nessuna soglia biologica inventata
Ogni parametro in `species_parameters` ha `source_citation` **o** `is_calibrated = false`.
In UI, un parametro non calibrato è visibilmente marcato. Non c'è una terza possibilità.

### N.2 Profili v1

| Specie | Gruppo | Parametri con fonte | Parametri da calibrare |
|---|---|---|---|
| ***Boletus edulis*** (autunnale, quota) | porcino | `T_opt = 13 °C` su 20 g, finestra pioggia 26 g, nessuna soglia sup. — Brejon & Hoffman 2026 | σ termica, quota, ospite |
| ***B. aereus*** | porcino estivo | — | tutto |
| ***B. reticulatus*** | porcino estivo | — | tutto |
| ***Cantharellus cibarius*** (galletto) | — | — | tutto |
| ***Amanita caesarea*** (ovolo) | — | — | tutto |
| ***Craterellus cornucopioides*** (trombetta) | — | — | tutto |

**Sono onesto su quanto è sbilanciato questo quadro.** Ho una base solida per *B. edulis* in faggeta
e sostanzialmente nulla per le altre cinque. Le alternative sono due: (a) pubblicare v1 con la sola
specie documentata e le altre marcate "in calibrazione"; (b) pubblicarle tutte con parametri
plausibili ma dichiaratamente non fondati. → **Domanda 4**.

Nota che *B. edulis* **autunnale d'alta quota** è proprio il caso del preprint (faggeta, Europa
centrale, autunno). Per *B. aereus* e *B. reticulatus* — estivi, quote basse, cerrete e leccete — i
parametri del preprint **non si trasferiscono**, e trasferirli sarebbe l'errore peggiore che posso
fare in questo progetto.

### N.3 Host tree match — la risposta è "non con la cartografia regionale"

Il prompt condiziona l'host tree match alla risoluzione della carta forestale regionale. Verifica:

| Dato | Risoluzione | Distingue faggio/castagno/cerro? | Verdetto |
|---|---|---|---|
| UCS 10k 2019 | 1:10.000, vettoriale | **No** — classi di copertura, non specie | insufficiente |
| Vegetazione Forestale RT | **1:250.000** | in parte | troppo grossolana |
| IFT | pixel **400 m** | sì, tipologie forestali | datato (1978–1990) e grossolano |
| Copernicus HRL DLT | **10 m** | solo latifoglie/conifere | utile ma non per specie |
| **Bonannella et al. 2022** | **30 m** | **sì, probabilità per specie** | la sola opzione seria |

→ **In v1 non mostro associazioni per specie arborea.** Mostro il tipo di copertura (UCS) e, dove
serve, latifoglie/conifere da HRL. L'host tree match entra in **Phase 2**, sui dati Bonannella, e
solo con la probabilità di presenza mostrata all'utente — mai come affermazione secca.
Questo rispetta il vincolo "non mostrare associazioni biologiche non supportate da fonti".

---

## O. FUNZIONALITÀ MVP

Ordinate per rapporto valore/costo. **Le prime sei sono l'MVP vero.**

1. **Mappa MPI sulle 7 zone** (non ancora griglia regionale) con heatmap e slider temporale −14/+7.
2. **Bottom sheet cella**: MPI, confidence, trend, meteo, territorio, "Perché questo punteggio?".
3. **Stazioni SIR sulla mappa**: nome, codice, quota, ultimo aggiornamento, cumulate
   24h/48h/72h/7d/14d/30d, grafico storico.
4. **Tre indici**: `CURRENT`, `DEVELOPMENT`, `FORECAST` +7, con finestra potenziale in linguaggio naturale.
5. **Data provenance in UI** su ogni valore: `OBSERVED` / `MODELLED` / `FORECAST`, fonte e data.
6. **Dark mode + PWA installabile** con cache dell'ultima mappa.
7. Preferiti con andamento MPI nel tempo.
8. Diario uscite — **da mettere in MVP anche se sembra secondario**, perché ogni settimana senza
   diario è una settimana di dati di calibrazione persa per sempre.
9. Pannello admin: salute fonti + simulatore MPI.
10. Pagina "Dove andare" con granularità di localizzazione configurabile.

**Rappresentazione del confidence che propongo.** Non un numero accanto al punteggio, che nessuno
guarda: l'MPI si legge dal colore, il confidence dalla **texture/opacità** della cella. Alta
confidence = tinta piena; bassa = retino visibilmente incerto. Si capisce in mezzo secondo e non
serve leggere due cifre. Il numero resta nel bottom sheet.

**Vincolo semantico applicato in UI.** Scala testuale: "condizioni sfavorevoli" (0–20),
"poco favorevoli" (20–40), "discretamente favorevoli" (40–60), "favorevoli" (60–80),
"molto favorevoli" (80–100). Mai un sostantivo che indichi quantità di funghi. Questa scala va nel
design system come token, non come stringhe sparse, così è impossibile violarla per distrazione.

---

## P. PHASE 2

- Griglia regionale a risoluzione variabile (§R.2).
- Host tree match su Bonannella et al. 30 m + HRL DLT 10 m.
- Backtest UI: "che MPI avremmo calcolato il 15 ottobre 2024?" — il motore lo supporta dal giorno 1.
- Calibrazione con il diario uscite: confronto MPI previsto vs esito reale, per specie e per zona.
- Alert push con trigger configurabili.
- Correzione del bias di ERA5 con lo storico SIR.
- Validazione dell'interpolazione contro i grigliati LaMMA.
- Overlay completi (soil moisture, ET0, VPD, vegetazione, quota, confidence).

## Q. PHASE 3

- Machine learning **solo dopo** aver raccolto abbastanza osservazioni strutturate: logistic
  regression e gradient boosting, tenendo il modello interpretabile come fallback e come baseline
  da battere. Stessa disciplina che sto applicando io al baseline attuale.
- Ensemble multi-modello proprio, con pesi appresi.
- Estensione fuori Toscana — l'architettura ad adapter lo consente, le fonti regionali no.
- Condivisione sociale delle osservazioni con privacy differenziale sulle coordinate.
- Integrazione radar CFR, se e solo se emerge un bisogno reale di sub-orario.

---

## R. COSTI — API E INFRASTRUTTURA

### R.1 Infrastruttura

| Voce | Piano | Costo | Limite che tocchiamo |
|---|---|---|---|
| Vercel | Hobby | **€0** | cron 1×/giorno, funzioni 300 s |
| GitHub Actions | repo pubblico | **€0** | minuti illimitati, 7 h/job |
| Supabase | Free | **€0** | 500 MB DB, pausa dopo ~7 gg inattività |
| Object storage payload raw | GitHub repo o Supabase Storage | **€0** | 1 GB Supabase Storage |
| Open-Meteo | Free | **€0** | 10.000 chiamate pesate/giorno, non commerciale |
| MapLibre + tile OSM | — | **€0** | fair use del tile server |
| **Totale uso personale** | | **€0/mese** | |

Se serve il piano Vercel Pro (cron infra-giornalieri): **+20 $/mese**. La mia raccomandazione è
**non pagarlo**: GitHub Actions fa lo stesso lavoro gratis, e il dato osservato si aggiorna una
volta al giorno comunque (§D).

### R.2 Il costo della griglia — quantificato

Cella 1×1 km sulla Toscana ≈ **22.990 celle** (22.987 km²). Con il modello di peso di §F.8:

| Scenario | celle | var | giorni | **peso/giorno** | dentro 10k? |
|---|---|---|---|---|---|
| 1 km su tutta la regione, finestra 108 g | 22.990 | 17 | 108 | **≈ 301.000** | **no, ×30** |
| 1 km su tutta la regione, incrementale 14 g | 22.990 | 17 | 14 | **≈ 39.000** | **no, ×4** |
| 1 km solo su bosco (≈11.500 km²), incrementale | 11.500 | 17 | 14 | ≈ 19.500 | **no, ×2** |
| **2 km su bosco, incrementale** | **2.880** | 17 | 14 | **≈ 4.900** | **sì** |
| 2 km su bosco, solo daily (7 var) | 2.880 | 7 | 14 | ≈ 2.900 | sì, con margine |

**La risposta alla domanda del prompt è: una griglia 1 km interrogata cella per cella non sta nel
free tier, e non ci starebbe neanche se ci stesse.** Il motivo non è il costo — è che **non
comprerebbe informazione**. I modelli sottostanti hanno risoluzione nativa di 2.2 km (ICON-D2),
9 km (ECMWF IFS) e 9–11 km (ERA5-Land, da cui vengono soil moisture e temperatura del suolo).
Chiedere 23.000 punti a un modello a 9 km significa pagare 23.000 volte per interpolare lo stesso
campo. L'unica variabile che cambia davvero a 1 km è la **quota**, e quella la applico io.

**Proposta: griglia a due livelli.**
- **Anchor grid ~2 km sul bosco (~2.880 punti)** — su questi si chiama Open-Meteo.
- **Display grid 1 km (o più fine) su tutta la regione** — ogni cella eredita dall'anchor più vicino
  e applica il proprio downscaling di quota (DTM), esposizione e copertura, più la correzione
  dall'interpolazione delle stazioni SIR.

Storage e tempo di calcolo: 46 GET al giorno (batch da 500, §F.5), ~10 MB, pochi minuti di CPU.
Il backfill iniziale ERA5 30 anni su 2.880 anchor è ~1 GB e va **eseguito una volta, a rate
limitato**, non in un unico burst: alle 10.000 chiamate pesate/giorno servono alcuni giorni. Va
pianificato, non improvvisato. → **Domanda 2**.

### R.3 Storage

| Tabella | Stima | Note |
|---|---|---|
| `weather_observations` | ~40 M righe | 400 stazioni × 4 var × 65 anni × 365 |
| `cell_features` | ~2 M righe/anno | 2.880 anchor × 2 versioni × 365 |
| `mpi_scores` | ~13 M righe/anno | 2.880 × 6 specie × 3 orizzonti × 250 giorni |
| **Totale stimato** | **~4–6 GB** | **eccede i 500 MB del free tier Supabase** |

Mitigazioni, in ordine di preferenza:
1. **Non salvare tutto lo storico osservato in DB.** Salvare le **normali climatiche derivate**
   (che è l'unica cosa che l'operativo legge) e tenere lo storico grezzo in Parquet su object
   storage. Riduce di ~10×.
2. Ritenzione su `mpi_scores`: dettaglio giornaliero per 90 giorni, poi aggregati decadali.
3. Compressione colonnare per le serie lunghe.
Con la mitigazione 1, si sta comodamente sotto i 500 MB. → conferma in §Domande.

---

## S. PROBLEMI TECNICI PREVISTI

| # | Problema | Probabilità | Impatto | Mitigazione |
|---|---|---|---|---|
| 1 | Confusione 9-9 / 0-24 in qualche punto della pipeline | **alta** | **alto** | `aggregation_window` in PK; test di regressione con la fixture 2026-08-12/13 |
| 2 | GeoServer SIR non documentato → può sparire senza preavviso | media | **alto** | fallback automatico su `dati.php`, con alert nel pannello admin |
| 3 | Zero da pluviometro guasto non rilevato | media | **alto** | controllo spaziale §I.4 |
| 4 | Mojibake nei nomi stazione | **certa** | basso | riparazione in normalization |
| 5 | Supabase free in pausa dopo inattività | media | medio | il cron giornaliero la previene; o passare a Neon |
| 6 | Superamento silenzioso del rate limit Open-Meteo | media | medio | contatore di peso locale, budget giornaliero, degradazione a meno variabili |
| 7 | Anagrafica SIR lenta (11.3 s) blocca un job | bassa | basso | cache settimanale con ETag |
| 8 | ERA5 con ~5 gg di ritardo crea un buco fra archivio e forecast | **certa** | medio | `past_days` del forecast copre fino a 92 giorni: sovrapposizione garantita |
| 9 | Ora legale: `dataora` WFS 07:00Z d'estate, 08:00Z d'inverno | **certa** | medio | normalizzare a UTC, test sul cambio ora |
| 10 | 500 coordinate/GET → batch sbagliati troncano celle | media | alto | batch esplicito + verifica che `len(risposta) == len(richiesta)` |
| 11 | Deriva fra `algorithm_version` in config e punteggi salvati | media | alto | version id in PK; nessun ricalcolo in-place |
| 12 | Tile OSM pubblici con rate limit sotto carico | bassa | medio | tile proprie o provider con free tier |

---

## T. MIGLIORAMENTI CHE PROPONGO IO

**T.1 — Usare l'ensemble non solo per il confidence ma per il MPI stesso.**
Con 122 membri si può calcolare l'**MPI su ogni membro** e mostrare non un numero ma una
distribuzione: "MPI mediano 71, 80 % dei membri fra 58 e 84". È molto più informativo di
"MPI 71, confidence 62" e costa una sola chiamata in più. È il miglioramento con il miglior
rapporto valore/costo di tutto l'elenco.

**T.2 — Un "MPI controfattuale" per spiegare, non solo decomporre.**
Oltre a `explainScore()`, calcolare *quanto pioverebbe servito* perché quella cella arrivasse a 70.
"Servirebbero altri 25 mm nei prossimi 5 giorni" è azionabile; "trigger 0.42" no.

**T.3 — Validare l'interpolazione contro LaMMA, e pubblicare il risultato.**
Avere un grigliato a 1 km fatto da climatologi sullo stesso territorio è un'occasione rara. Una
pagina che mostra "la nostra interpolazione contro quella LaMMA su 1995–2015, RMSE X mm" è
credibilità che nessun concorrente ha.

**T.4 — Trattare il diario uscite come dataset fin dal primo giorno.**
`mpi_at_observation` e `algorithm_version_id` congelati nella riga dell'osservazione. Senza questi
due campi, fra un anno non si può più ricostruire cosa il modello prevedeva. È il campo più
economico da aggiungere ora e impossibile da recuperare dopo.

**T.5 — Un test di "non regressione semantica".**
Un test automatico che fallisce se compare in UI una stringa dalla blacklist ("molti funghi",
"troverai", "garantito", "sicuro"). Il vincolo semantico è dichiarato non negoziabile: va reso
meccanicamente verificabile, non affidato alla disciplina.

**T.6 — Curvatura e TPI dal DTM, non solo quota/pendenza/esposizione.**
Gli impluvi e i fondovalle trattengono acqua in modo sistematicamente diverso dai crinali. Il TPI
(Topographic Position Index) si calcola dallo stesso DTM che serve già e alimenta `f_soil` nel
decadimento. Costo marginale nullo, effetto plausibilmente significativo.

**T.7 — Distinguere `MODELLED` da `REANALYSIS`.**
Il prompt chiede tre livelli (`OBSERVED`/`MODELLED`/`FORECAST`). Ne servono quattro: ERA5 è una
**rianalisi** — assimila osservazioni reali ed è qualitativamente diversa da un modello previsionale
usato all'indietro. Mostrare "rianalisi" all'utente è più onesto e più informativo.

**T.8 — Non aggiungere CLMS.** Argomentato in §A. Lo scrivo qui perché è un *miglioramento per
sottrazione*: una fonte in meno è meno codice, meno licenze da tracciare, meno cose che si rompono.

**T.9 — Snapshot immutabili per il backtest.**
Salvare, per ogni giorno, le feature come erano *quel giorno* (con le previsioni allora disponibili),
non solo come le ricostruiamo oggi con i dati definitivi. Senza questo, il backtest misura il
modello con informazioni che all'epoca non c'erano, e sovrastima sistematicamente le prestazioni.
È l'errore classico del backtesting e va evitato per costruzione.

---

## MVP ARCHITECTURE

> Obiettivo: qualcosa di **onesto e usabile** sulle 7 zone, a costo zero, in cui ogni numero
> mostrato ha una fonte.

```
Dati:       SIR GeoServer (3 layer/giorno) + Open-Meteo forecast+archive
            + UCS 10k 2019 + DTM 2023, precalcolati
Copertura:  7 zone, celle 1 km attorno a ciascuna (~50 celle/zona, ~350 totali)
Calcolo:    GitHub Actions — 1 job osservazioni/giorno, 2 job forecast/giorno, 1 job MPI
Storage:    Supabase Postgres free, senza PostGIS runtime (griglia precalcolata)
App:        Next.js 16 su Vercel Hobby, MapLibre, PWA, dark mode
Modello:    MPI v1 §J con la sola *B. edulis* parametrizzata da fonte;
            altre specie visibili ma marcate "in calibrazione"
Confidence: distanza + quota + densità + qualità + ensemble + orizzonte
Backtest:   supportato dal motore, senza UI
Costo:      €0/mese
Tempo:      il grosso del lavoro è ingestione e QC, non il modello
```

Cosa **non** c'è, dichiaratamente: griglia regionale, host tree match, alert push, ML,
overlay completi, radar.

---

## ULTIMATE ARCHITECTURE

> Obiettivo: il sistema descritto dal principio guida del prompt, senza compromessi.

```
Dati:       tutto l'MVP
            + Bonannella et al. 30 m (probabilità per specie arborea)
            + Copernicus HRL DLT/TCD 10 m
            + IFT (tipologie forestali)
            + LaMMA grigliati 1995–2015 (validazione) e climatologie
            + storico SIR completo dal 1961 (correzione bias ERA5)
            + ensemble 122 membri, con MPI calcolato su ogni membro (§T.1)
Copertura:  display grid 500 m su bosco / 2 km altrove;
            anchor grid 2 km su bosco (~2.880 punti) per le chiamate API
Calcolo:    GitHub Actions per l'operativo + un runner dedicato (Fly.io / Hetzner ~4 €/mese)
            per il ricalcolo completo e i backtest massivi
Storage:    Postgres+PostGIS gestito (Neon o Supabase Pro), Parquet su object storage
            per lo storico grezzo
App:        come MVP + overlay completi, alert push, pagina "Dove andare",
            pannello admin con simulatore, backtest UI, pagina di validazione (§T.3)
Modello:    MPI v2 calibrato sul diario uscite; profili per 6+ specie;
            ML interpretabile affiancato al modello a regole come baseline da battere
Confidence: come MVP + distribuzione ensemble + MPI controfattuale (§T.2)
Costo:      €0–25/mese a seconda di runner e piano DB
```

**Il salto di valore fra le due non è la risoluzione: è la calibrazione.** Un MPI a 500 m con
parametri non validati è meno utile di un MPI a 2 km validato su 200 uscite reali. Per questo il
diario uscite è in MVP e la griglia fine no.

---

## DOMANDE APERTE — servono le tue decisioni

Il prompt dice esplicitamente di non decidere da solo su scoring, schema database,
autenticazione, scelta delle fonti e UX principale. Ecco le decisioni che restano tue.

### 1 — Licenza dell'output (§C.1)
I dati SIR sono **CC-BY-SA**, non CC-BY. Il progetto resterà aperto e non commerciale, oppure vuoi
tenere aperta la porta a una versione commerciale? La risposta cambia (a) se possiamo pubblicare
l'MPI senza vincoli, (b) se possiamo restare sul piano gratuito di Open-Meteo, (c) se conviene
isolare fin d'ora la parte derivata dal SIR dietro un confine tracciabile.

### 2 — Ampiezza del backfill storico (§R.2, §R.3)
Tre opzioni, costi molto diversi:
- **(a)** solo ERA5 1991–2020 sui 2.880 anchor → alcuni giorni di download a rate limitato,
  ~1 GB, climatologia completa e omogenea.
- **(b)** ERA5 + storico SIR completo dal 1961 (~600 MB, 400 stazioni × 4 grandezze) → permette
  la correzione del bias e i percentili per stazione, ma aggiunge una fase di ingestione lunga.
- **(c)** solo le climatologie LaMMA 1995–2014 (21 MB, immediate) → parti domani, con normali meno
  ricche e ferme al 2014.
La mia raccomandazione è **(a) subito, (b) in Phase 2, (c) come validazione incrociata**.

### 3 — Database (§G.4)
Supabase free (PostGIS certo, ma pausa per inattività e 500 MB) o Neon (nessuna pausa, branching
utile per i backtest, ma PostGIS da verificare)? Considerando §G.4, PostGIS runtime serve poco:
se accetti la griglia precalcolata, si apre anche l'opzione più leggera.

### 4 — Specie in v1 (§N.2)
Ho una base di letteratura solida per *B. edulis* e sostanzialmente nulla per le altre cinque.
- **(a)** pubblicare solo *B. edulis*, le altre "in arrivo";
- **(b)** pubblicarle tutte con parametri plausibili marcati "da calibrare";
- **(c)** pubblicarle tutte senza distinguere.
**(c) lo escludo** — viola il vincolo "non inventare soglie biologiche". Fra (a) e (b) decidi tu:
(b) raccoglie dati di calibrazione prima, (a) è più difendibile.

### 5 — Scala del punteggio (§J.4)
La mia v1 **non riprodurrà** i valori di calibrazione del baseline (35 mm/lag 12 → 66;
60 mm/lag 11 → 97). Con l'ottimo termico misurato a 13 °C e la finestra a 26 giorni, condizioni
"molto buone" danno ~75, non ~97. Vuoi che (a) **ricalibri la scala** perché i tuoi numeri di
riferimento restino validi, oppure (b) **accetti la nuova scala** e trattiamo 97 come un valore
che si vede raramente, riservato a condizioni davvero eccezionali? Io propendo per (b): una scala
che tocca spesso il fondo scala perde potere discriminante.

### 6 — Shock termico (§J.1)
Non ho trovato supporto di campo per il fattore che il prompt indica come il più discriminante.
Confermi di inserirlo con **peso 0** e validarlo col diario, oppure hai esperienza diretta o fonti
che vuoi che pesi da subito? Se hai fonti, le uso volentieri — è esattamente il tipo di conoscenza
locale che la letteratura tedesca non ha.

### 7 — Autenticazione
Non l'ho decisa. Uso personale (nessun login, tutto locale/PWA), oppure Supabase Auth fin dall'MVP
perché il diario uscite e i preferiti devono seguirti fra dispositivi? La seconda ha un costo:
RLS, gestione sessioni, privacy delle coordinate. La prima rende il diario un dato locale che si
perde cambiando telefono — e il diario è il dato più prezioso del progetto.

### 8 — Griglia (§R.2)
Confermi l'impianto **anchor 2 km su bosco + display grid più fine con downscaling**, o preferisci
partire dalle sole 7 zone (MVP) e rinviare del tutto la discussione sulla griglia?

---

## APPENDICE — verifiche eseguite

Tutte eseguite il 17 settembre 2026. Gli script sono usa-e-getta e non fanno parte del repository.

| # | Verifica | Esito |
|---|---|---|
| 1 | `GET json_stations` | 200, 1.45 MB, 11.3 s, 1411 stazioni |
| 2 | Inventario `Consistenza` per grandezza e per anno attivo | 12 `IDST`, 401 pluvio attive 2026 |
| 3 | Stazione migliore per variabile sulle 7 zone, 2 criteri | tabella §F.2 |
| 4 | `GET` serie `pluvio`, `pluvio0_24`, `termo_min` | 200, 340–390 KB, 0.4–0.5 s |
| 5 | Filtri temporali `ANNO`/`DATA_INIZIO`/`FROM,TO`/`LIMIT` | tutti ignorati, byte identici |
| 6 | Confronto serie 9-9 vs 0-24, stessa stazione | sfasamento di 1 giorno dimostrato |
| 7 | CKAN `package_show` su `stazioni-meteo-idrologiche`, `pluviometri`, `ucs` | `cc-by-sa`, `cc-by-sa`, `cc-by` |
| 8 | CKAN LaMMA `package_search` + facet licenze | 162 dataset, 159 `cc-by` |
| 9 | Anni disponibili grigliati LaMMA + `HEAD` sui download | 1995–2015; 36 MB/anno; climatologia 6.9 MB |
| 10 | `GetCapabilities` Geoscopio UCS | 200, 396 layer |
| 11 | `GetCapabilities` GeoServer SIR | 200, 39 feature type |
| 12 | `GetFeature` sui 3 layer `valori_ieri` | 417/417/263 feature, ~0.2 s |
| 13 | Validazione incrociata WFS ↔ `dati.php` | coincidono |
| 14 | Open-Meteo 7 località, 17 variabili, 108 giorni | 200, 1.28 MB, 0.66 s, `elevation` esatta |
| 15 | Scaling multi-località Open-Meteo | 500 ok, 1000 → HTTP 414 |
| 16 | Open-Meteo Ensemble 3 modelli | 122 membri, 55 KB, 0.19 s |
| 17 | Open-Meteo Archive 1991–2020 | 10.958 giorni, 354 KB, 1.01 s |
| 18 | CFR `monitoraggio/*.php` | solo HTML, nessun JSON |
| 19 | Baseline eseguito sulle 7 zone con dati reali | tabella §J.4 |
| 20 | Calibrazione baseline 35 mm/lag12 e 60 mm/lag11 | 38.3 / 53.7 senza pioggia successiva; 66.0 / 97.1 con ~10–11 mm dopo l'innesco |
| 21 | Limiti cron e funzioni Vercel | Hobby 1×/giorno ±59 min, 300 s |
| 22 | Normativa raccolta funghi Toscana | LR 16/1999; pagina aggiornata 14 set 2026 |

### Fonti citate

- Brejon Lamartiniere E., Hoffman J.I. (2026). *Predicting porcini: a decade of sporocarp monitoring
  reveals the meteorological triggers of Boletus edulis fruiting in central European beech forests.*
  bioRxiv `https://doi.org/10.64898/2025.12.12.693895`. CC-BY-NC 4.0. **Preprint non sottoposto a
  peer review** — da rivalutare quando sarà pubblicato.
- Karavani A. et al. (2018). *Effect of climatic and soil moisture conditions on mushroom
  productivity and related ecosystem services in Mediterranean pine stands facing climate change.*
  Agricultural and Forest Meteorology 248: 432–440.
- Tsunoda et al. (2025), citato in Brejon & Hoffman per l'assenza di soglia superiore di precipitazione.
- Thornton P.E. et al., algoritmo di spazializzazione usato dal Consorzio LaMMA (citato nei metadati
  dei dataset LaMMA).
- Bonannella C., Hengl T. et al. (2022). Mappe di probabilità di distribuzione di specie arboree
  europee a 30 m. Zenodo `https://zenodo.org/record/6956944`.
- Regione Toscana, Legge Regionale 22 marzo 1999 n. 16 e s.m.i., norme per la raccolta dei funghi
  epigei. Pagina informativa aggiornata al **14 settembre 2026**.

### Normativa raccolta funghi — da mostrare in app, con fonte e data

Non hardcodare: questi valori vanno in configurazione con `source_url` e `last_checked_at`.

- Riferimento: **LR Toscana 16/1999 e s.m.i.**
- Autorizzazione: non serve ai residenti che raccolgono **solo nel proprio comune**. Altrimenti
  €13 (6 mesi) o €25 (annuale), ridotta del 50 % in area montana e per i 14–18 anni con attestato.
  Non residenti: €15 (1 giorno), €40 (7 giorni), €100 (1 anno).
- Limite giornaliero: **3 kg** a persona, salvo esemplare singolo di peso superiore.
  **10 kg** per residenti in comuni montani che raccolgono nel proprio comune.
- Dimensioni minime: **porcini 4 cm** di diametro del cappello; *Hygrophorus marzuolus* e
  *Lyophyllum gambosum* 2 cm; ovolo buono con lamelle visibili.
- Orari: da **un'ora prima dell'alba a un'ora dopo il tramonto**. Raccolta notturna vietata.
- Contenitori rigidi e areati; **sacchetti di plastica vietati**; vietati rastrelli e attrezzi che
  danneggiano il micelio.
- Aree protette e proprietà private possono avere regole aggiuntive: l'app deve dirlo, non
  sostituirsi alla verifica.

### Sicurezza micologica — vincolo di prodotto

L'app **non identifica funghi da foto** e **non afferma mai che un fungo sia commestibile o sicuro**.
Riguarda la compatibilità delle condizioni ambientali con una possibile fruttificazione, non la
determinazione delle specie raccolte. Il disclaimer va mostrato all'onboarding e resta accessibile
in ogni schermata che parli di specie.

---

**Fine del report. In attesa di approvazione e delle risposte alle 8 domande aperte
prima di procedere all'implementazione.**

---

## APPENDICE B — correzioni emerse implementando (aggiornata al 2026-09-17)

Cose scoperte scrivendo gli adapter e facendoli girare sul dato vero, che correggono o precisano
il corpo del report. Le lascio qui invece di riscrivere sopra, perche' come si e' arrivati a un
numero conta quanto il numero.

**B.1 — Lo sfasamento 9-9 e' evitabile per la pioggia, non per la temperatura.**
Il §0.1 dice che il problema "non esiste piu'". Vale per la pioggia, che ha la variante
`pluvio0_24`. Le temperature **non ce l'hanno**: `termo_max` e `termo_min` hanno tutte le
etichette alle 09:00 e non esiste un `IDST` 0-24. Verificato ispezionando gli orari distinti
degli ultimi 400 record.

Il confronto con Open-Meteo alla stessa quota su 70 giorni dice pero' che **nessuna serie va
spostata**: l'errore medio assoluto e' minimo a sfasamento zero per tutte.

| serie | shift -1 | shift 0 | shift +1 |
|---|---|---|---|
| pioggia 0-24 | 1.98 mm | **1.01 mm** | 1.63 mm |
| pioggia 9-9 | 1.47 mm | **1.17 mm** | 2.02 mm |
| Tmax | 1.61 °C | **0.95 °C** | 1.70 °C |
| Tmin | 3.20 °C | 3.14 °C | 3.11 °C |

**B.2 — La Tmin di stazione ha un bias di 3 gradi, e cambia la penalita' da gelata.**
Sulla Tmin il test sopra non discrimina, perche' l'errore non e' sfasamento ma **bias di sito**:
la differenza media stazione meno modello e' **−3.14 °C** (sd 1.22), e rimuovendola l'errore
residuo scende a 0.99 °C, lo stesso della Tmax. Non e' rumore. La stazione "Laghetto Verde" sta
in una conca e accumula aria fredda di notte, cosa che un modello a 9 km non puo' vedere.

Conseguenza operativa: **la penalita' da gelata e ogni soglia notturna vanno valutate sulla Tmin
osservata, non su quella modellata.** Con il modello si perderebbero tre gradi di raffreddamento
proprio dove contano. E' anche la giustificazione quantitativa della correzione del bias per
variabile e per stazione, che sale da "nice to have di Phase 2" a requisito.

**B.3 — TOS07000001 misura la pioggia.** Il prompt di progetto la dava come stazione che porta la
minima termometrica "ma non la pioggia". Verificato: misura pioggia in entrambe le finestre fino
al 2026. La sparsita' per grandezza resta vera — quella stazione non ha ne' anemometria ne'
igrometria, che il Laghetto Verde ha — ma l'esempio specifico del prompt non regge piu'.

**B.4 — Le due serie di pioggia non sono interscambiabili giorno per giorno.** Sull'anno
coincidono entro lo 0.1 % (2018: 1936.4 contro 1936.4; 2025: 1371.4 contro 1371.4), ma su una
finestra di 43 giorni differiscono del 7 %, perche' la ri-affettatura ridistribuisce i singoli
eventi. Ed e' il giorno per giorno ad alimentare il modello.

**B.5 — Sette stazioni espongono `Consistenza` come array vuoto** invece che come oggetto: e' il
comportamento di `json_encode` in PHP con un array associativo vuoto. Sono stazioni senza alcuna
misura, fra cui — con una certa ironia — quella chiamata "Monte Amiata". Rifiutarle faceva
fallire l'intera ingestione.

**B.6 — Il criterio statistico da solo produce falsi positivi.** Alla prima esecuzione sul dato
reale il controllo sull'outlier spaziale ha segnalato due stazioni con uno scarto di **2.4 °C**,
a 10.6 deviazioni robuste, perche' in una giornata termicamente uniforme le vicine si stringono e
il MAD diventa piccolissimo. Ma 2.4 °C fra fondovalle e versante sono meteorologia. Ora serve che
il valore sia anomalo **e** lontano in unita' fisiche.

**B.7 — `dataora` puo' essere nulla.** Per le stazioni che non hanno trasmesso, il GeoServer
annulla anche il timestamp, non solo il valore. Le conserviamo datate al giorno del layer: "muta
oggi" e' informazione per il controllo qualita', non un record da scartare.

---

## APPENDICE C — validazione dell'interpolazione (2026-09-17)

Il §L proponeva regressione con quota piu' kriging dei residui, sostenendo che la stazione piu'
vicina non basta. L'ho misurato invece di darlo per buono.

**Metodo.** Leave-one-out cross-validation su 50 stazioni SIR attorno alle sette zone (quote da
134 a 1716 m, distanza media dalla stazione piu' vicina 6.0 km), su 40 giorni di serie reali dal
2026-08-08 al 2026-09-16. Si toglie una stazione, si stima il valore nel suo punto con le altre,
si confronta con la misura. Il termine di paragone e' la **stazione piu' vicina in distanza
efficace**, che gia' tiene conto della quota: e' il piu' duro fra i confronti ingenui.

| grandezza | giorni | n | MAE | RMSE | bias | MAE stazione vicina | guadagno |
|---|---|---|---|---|---|---|---|
| precipitazione | 29 | 1447 | **2.37 mm** | 3.94 | +0.12 | 2.62 mm | **+9.7 %** |
| temperatura massima | 40 | 1957 | **0.96 °C** | 1.20 | −0.00 | 2.23 °C | **+56.9 %** |
| temperatura minima | 40 | 1957 | **1.50 °C** | 1.93 | −0.03 | 1.79 °C | **+16.6 %** |

Per la pioggia sono esclusi i giorni in cui non piove da nessuna parte: l'errore sarebbe zero per
costruzione e gonfierebbe il risultato.

**Tre letture.**

1. **Sulla temperatura massima lo schema si giustifica da solo**: dimezza abbondantemente
   l'errore, perche' il gradiente verticale e' forte, regolare, e la regressione lo stima dai dati
   del giorno invece di assumere i canonici −6.5 °C/km. Sulle zone di taratura il gradiente
   stimato il 16 settembre era **−9.0 °C/km**, sensibilmente diverso dal valore standard.

2. **Sulla minima il guadagno e' modesto**, +16.6 %, e non e' una sorpresa: la minima e' dominata
   dall'accumulo di aria fredda in conca, che e' un fenomeno locale che nessun trend regolare
   puo' catturare. E' lo stesso motivo per cui la stazione dell'Amiata ha un bias di −3.14 °C
   rispetto al modello. Conferma che per la gelata serve la misura, non la stima.

3. **Sulla pioggia il guadagno e' piccolo**, +9.7 %. La pioggia giornaliera e' genuinamente
   locale e poco legata alla quota. Vale la pena dirlo chiaramente invece di far finta che
   l'interpolazione risolva tutto: per la pioggia il vero limite e' la densita' della rete.

Il bias e' praticamente nullo su tutte e tre le grandezze, quindi il metodo non sposta
sistematicamente il livello.

**Correzioni fatte collegando l'interpolazione al motore.** Due difetti logici emersi facendo
girare la pipeline completa, entrambi nel calcolo della confidence e non nell'interpolazione:

- la confidence **scendeva** quando si aggiungevano le osservazioni, da 70 a 42, perche' la
  penalita' di quota veniva applicata due volte, una nella scelta delle stazioni e una nel
  confidence, mentre il trend della regressione gia' la corregge. Ora il valore fuso non puo' mai
  valere meno del solo modello, che e' una proprieta' logica prima che una taratura;
- l'eta' del dato osservato veniva applicata **anche alle grandezze modellate**. Il SIR pubblica
  il giorno precedente, ma umidita' del suolo ed ET0 vengono dal modello, che e' aggiornato a
  oggi: invecchiarle non aveva senso.

Con le correzioni, la confidence sulle sette zone sale da 70 (solo modello) a 71–77 (con le
osservazioni). L'aumento e' contenuto perche' meta' del peso sta su umidita' del suolo ed ET0,
che nessuna rete osserva: e' onesto che sia cosi'.
