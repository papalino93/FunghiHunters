# Audit — FungiCast Toscana

## Aggiornamento — audit tecnico v1.1.0 (17 settembre 2026, sessione successiva)

Verifica puntuale delle sei affermazioni con cui è stata aperta questa sessione, come richiesto
("non dare nulla per scontato: conferma o correggi"). Metodo: lettura del codice, esecuzione di
`npm run check` e `npm run build` da zero (`.next` cancellato prima), `ps aux` per processi
residui.

| Affermazione | Verifica |
|---|---|
| Modello alla versione 1.1.0 | **Confermato.** `src/lib/config/algorithm.ts:300`, `version: '1.1.0-porcino'`. |
| "più parametri documentati e test di dominio" | **Confermato.** 11 parametri con fonte su 69 dichiarati (vedi commit `2eefe0e`), distinti per livello di revisione. |
| 258 test di logica, non 232 | **Corretto.** `npm run test` → 258/258. Il numero 232 è quello prima della sessione precedente (login/sync + tombstone), che ha aggiunto 26 test. Nessuna discrepanza reale: sono stati contati in un momento diverso. |
| Solo 2 fonti runtime attive (SIR, Open-Meteo) | **Confermato.** `src/lib/sources/`: `sir-geoserver.ts` + `sir-archive.ts` + `sir-measures.ts` sono tre file per **una** fonte (SIR), più `open-meteo.ts`. Due fonti distinte, non tre o quattro. |
| Previsione aggregata in 7 macro-zone | **Confermato.** `src/lib/config/zones.ts`: esattamente 7 (`amiata`, `casentino`, `pratomagno`, `garfagnana`, `pistoiese`, `mugello`, `metallifere`). |
| "Non esistono ancora login, sincronizzazione cloud o Google Auth funzionanti" | **Da correggere, con una distinzione importante.** Il codice esiste, è reale (non un mock lasciato a metà) e passa 26 test automatici: `src/lib/auth/`, `src/lib/sync/`, schermata `/account`, rotta `/api/account/delete`. **Non è però mai stato verificato contro un progetto Supabase vero**, perché questo ambiente non può crearne uno (credenziali di terze parti). "Funzionante" è ambiguo: il codice funziona contro backend finti, **non è dimostrato che funzioni contro Supabase reale**. Trattalo come "pronto ma non verificato dal vivo", non come "assente" né come "verificato". Vedi `docs/SYNC.md` per la checklist di verifica manuale, non ancora eseguita da nessuno. |
| Build di produzione con processo bloccato | **Non riprodotto.** `rm -rf .next && npm run build`: completa in 17.3 secondi, nessun processo residuo prima o dopo (`ps aux` pulito). Non posso escludere che fosse un problema specifico dell'ambiente di chi ha eseguito il build la volta precedente (lockfile, watcher rimasto attivo, memoria); qui non si è ripresentato. |

## Obiettivo 6 — verifica UX contro i sette requisiti

Verificato punto per punto cosa mostra oggi ogni suggerimento, fra scheda compatta
(`SuggestionCard`) e dettaglio a un tocco (`ZoneSheet`):

1. Potenziale ambientale — `PotentialBar`, cinque fasce. **C'era già.**
2. Qualità dei dati — `Reliability` nella scheda ("stima solida/discreta/incerta"), numero esatto
   in `ZoneSheet`. **C'era già.**
3. Incertezza della previsione — **non c'era nella scheda compatta**, solo nel dettaglio
   (`ZoneSheet`, "Certezza previsione", separata da "Qualità dati" come richiesto — è la
   correzione B2 di una sessione precedente). Lasciata nel dettaglio per scelta di
   information-architecture (la scheda non deve diventare una dashboard), non per svista.
4. Fattori favorevoli — `facts.good`. **C'era già.**
5. Fattori limitanti — `facts.bad`. **C'era già.**
6. Distanza in linea d'aria, dichiarata come tale — **mancava la dicitura esplicita**: la scheda
   mostrava "43 km" senza dire se lineare o stradale. Corretto: ora dice "43 km in linea d'aria".
   Nessuna distanza stradale reale: richiederebbe un servizio di routing, non ancora integrato.
7. Finestra consigliata — "Meglio [data]" / "Nessun giorno migliore in vista". **C'era già.**

**"Non nascondere aree scartate: spiega perché" — mancava, corretto in questa sessione.**
`rankZones` toglieva le zone escluse dai filtri con un `continue` silenzioso: sparivano senza
lasciare traccia. Aggiunta `excludedZones()` (`src/lib/recommend/rank.ts`), che condivide la
stessa logica di esclusione così da non poter divergere da `rankZones`, e una sezione a comparsa
in UI (`ExcludedZones.tsx`) che elenca ogni zona esclusa con il motivo in chiaro ("a 65 km in
linea d'aria, oltre il limite di 50 km"). Testato: 4 casi nuovi in `tests/recommend.test.ts`,
incluso che nessuna zona possa comparire sia come suggerimento sia come esclusa.

**Le due citazioni nuove**, verificate per link forniti dall'utente: un preprint bioRxiv (non
peer-reviewed, in revisione) e uno studio su Boletus edulis in Italian Journal of Mycology
(peer-reviewed, ma su un singolo sito, il Monte Amiata). Il punto sollevato dall'utente è corretto
e viene affrontato sistematicamente nell'Obiettivo 1 qui sotto: **nessuna fonte, per quanto buona,
diventa automaticamente valida per tutta la Toscana solo perché citata**. Va dichiarata la
trasferibilità, non la sola esistenza della fonte.

## Aggiornamento — sessione account e sincronizzazione (17 settembre 2026)

L'audit originale qui sotto è del commit `f204931`. Da allora sono stati corretti B1, B2, M3, ed
è stato costruito il diario, la schermata "Dove vado oggi" e la PWA offline (commit successivi,
non ri-verificati riga per riga in questa sessione se non dove toccati). Questa sessione ha
aggiunto account e sincronizzazione. Bilancio onesto, severo come richiesto:

**Cosa regge.** Il motore di sincronizzazione (`src/lib/sync/engine.ts`) è testato con 9 casi
contro un backend finto: conflitto vinto dal locale, dal remoto, il caso esplicito del
dispositivo tornato online dopo una modifica ormai superata, propagazione dei tombstone nelle due
direzioni, fallimento di push e di pull. L'autenticazione (`src/lib/auth/controller.ts`) è
testata allo stesso modo: persistenza della sessione, notifica dei cambi, sessione scaduta,
comportamento quando Supabase non è configurato. Nessuna delle due dipende da una rete o da un
progetto Supabase vero per essere verificata.

**Cosa NON regge, dichiarato esplicitamente:**

- **L'adapter Supabase reale non ha nessun test**, né automatico né manuale eseguito in questa
  sessione: non esiste un progetto Supabase collegato a questo ambiente, e crearne uno con
  Google OAuth richiede account di terze parti che un agente non può provisioning autonomamente.
  Il codice (`src/lib/sync/supabase-backend.ts`, `src/lib/auth/supabase-backend.ts`) è scritto
  con attenzione ma **non verificato contro un database reale**. `docs/SYNC.md` elenca la
  checklist di verifica manuale da fare al primo collegamento — non saltarla.
- **Le aree salvate (`user_locations`) hanno lo schema di sync ma zero UI.** Non esiste ancora un
  modo per salvare un'area nell'app, quindi non c'è cosa sincronizzare. Non è un bug, è scope non
  coperto: va dichiarato, non nascosto.
- **Nessun test E2E reale del flusso di login** (browser vero, redirect OAuth vero). I test
  esistenti verificano la macchina a stati, non l'integrazione col popup di Google o con l'email
  del magic link.
- **Mapping fra vocabolario privacy dell'app e schema DB.** Lo schema iniziale (`0001_init.sql`)
  aveva un `privacy_level` pensato per la condivisione pubblica futura (`private/municipality/
  zone/public`), diverso dal vocabolario di precisione del diario (`exact/area/zone`). Ho aggiunto
  una colonna separata (`privacy_level_app`, in `0002_sync.sql`) invece di forzare i due concetti
  in uno solo: sono assi diversi (chi può vedere vs. quanto è precisa la posizione), e confonderli
  sarebbe stato l'errore preciso che questo progetto cerca di evitare altrove.
- **`algorithm_version_id`** (FK a `algorithm_versions`) resta scollegato dal client, che sincronizza
  solo la stringa di versione (`algorithm_version_text`). Il collegamento vero richiederebbe una
  lookup lato server non ancora scritta — annotato in `0002_sync.sql`.

---

## Bloccanti

### B1 — Un numero inventato mostrato all'utente

`ZoneSheet.tsx:332` mostra `${zone.observedDays} su ${zone.series.length + 40}`.
Il `+ 40` non corrisponde a nulla: la serie visualizzata ha 22 punti, la finestra di calcolo ne ha
61. All'utente compariva **"60 su 62"** quando il valore vero è **60 su 61**.

È il difetto più grave dell'intero repository, non per l'entità dell'errore ma per la natura: un
numero costruito per far tornare i conti in UI, in un'app il cui unico argomento di vendita è
l'onestà sui dati. Il denominatore vero deve venire dallo snapshot, non da un'aritmetica
inventata nel componente.

### B2 — La confidence mescola tre cose diverse

Un solo numero somma la geometria delle stazioni, la provenienza del dato, la copertura della
finestra **e** l'orizzonte previsionale. Un utente che legge "affidabilità 50" non sa se il
problema è che mancano le stazioni o semplicemente che sta guardando dopodomani. Sono decisioni
diverse: nel primo caso la zona è mal coperta sempre, nel secondo basta riguardare fra due giorni.

### B3 — Il diario uscite non esiste

Lo schema SQL c'è, l'interfaccia no, la persistenza nemmeno. È il dato che permette di calibrare
il modello confrontando previsto e osservato, e ogni settimana senza diario è una settimana di
calibrazione persa per sempre. Tutti i parametri tranne due restano non validati finché non
esiste.

---

## Gravi

### G1 — Falsa precisione dei sette marcatori

Sette pallini a coordinate esatte comunicano che il punteggio vale **in quel punto**. In realtà
vale per un'area di diversi chilometri, con incertezza dichiarata. La rappresentazione puntuale
promette una precisione che il modello non ha.

### G2 — Contrasto sotto AA

`--text-muted` (`#6b7690`) è usato per testo di 10–11 px:

| coppia | rapporto | AA testo piccolo (4.5) |
|---|---|---|
| ink-faint su surface-1 | 3.94 | **no** |
| ink-faint su surface-2 | 3.53 | **no** |

Tutte le altre coppie passano. È testo piccolo, quindi il requisito è 4.5, non 3.

### G3 — Nessun test sull'interfaccia

164 test, tutti sul motore. Zero su componenti e flussi: la mappa nera e il contenitore ad altezza
zero sono passati inosservati fino all'ispezione manuale.

### G4 — Nessuna PWA, nessun comportamento offline

Niente manifest, niente service worker, nessuna cache dell'ultimo snapshot. Nel bosco la rete non
c'è, che è esattamente il momento in cui servirebbe.

### G5 — Nessun percorso d'ingresso orientato alla decisione

L'app apre su una mappa regionale. La domanda reale — "dove vado oggi, partendo da dove sono" —
richiede di interpretare marcatori e ricordare le quote. Manca la geolocalizzazione con consenso e
manca l'ordinamento per raggiungibilità.

---

## Medi

### M1 — `ZoneSheet` è un componente da 440 righe

Intestazione, navigazione a schede e quattro pannelli in un solo file, con stato interno. Non
testabile a pezzi, difficile da modificare senza toccare il resto.

### M2 — Stato delle fonti invisibile

Se il SIR non risponde, lo snapshot esce con meno stazioni e nessuno se ne accorge: la confidence
scende di qualche punto e basta. Serve uno stato esplicito per fonte, con ultimo aggiornamento
riuscito.

### M3 — Etichette duplicate, due volte

`mpiLabel` è stato duplicato in `explain.ts` e poi in `ZoneSheet.tsx`, ed entrambe le volte ho
dovuto correggerlo. Il vincolo semantico è verificato da un test su `MPI_LABELS`: qualunque copia
lo aggira.

### M4 — Nessuna sezione "prima di partire"

Le norme sulla raccolta sono state verificate in fase di discovery e documentate, ma non compaiono
in app. Sono informazioni che servono **prima** di mettersi in macchina.

---

## Cosa regge bene

Vale la pena dirlo, perché va conservato:

- Il **motore è puro e versionato**: `computeMpi` non tocca rete né database, e ogni parametro
  dichiara se ha una fonte. È ciò che rende possibili backtest e simulatore.
- La **finestra di aggregazione nella chiave primaria** rende impossibile mescolare 0-24 e 9-9.
- L'**interpolazione è validata**, non asserita: leave-one-out contro la stazione più vicina, con
  numeri pubblicati.
- La **provenienza viaggia col dato**, per variabile e per giorno.
- Lo **snapshot precalcolato** è la scelta giusta: niente ricalcolo a ogni visita, costo zero.

---

## Priorità di intervento (stato storico)

1. B1, B2, G2 — correzioni di onestà e accessibilità, costo basso. **Fatto.**
2. B3 — diario uscite, perché ogni giorno di ritardo è dato perso. **Fatto.**
3. G5 — schermata "Dove vado oggi". **Fatto.**
4. G4 — PWA e offline. **Fatto.**
5. G3, M1 — test dei componenti e scomposizione. **Non fatto**: zero test su componenti React
   (la sync/auth di questa sessione è testata alla logica, non al componente); `ZoneSheet` non
   ancora scomposto.
6. G1 — celle più fini: **richiede** la maschera forestale UCS e il DTM, non ancora ingeriti.
   Farlo sui sette punti sarebbe aggiungere falsa precisione invece di toglierla. **Non fatto.**

## Priorità aperte dopo questa sessione

Rispetto alla richiesta complessiva del progetto (audit iniziale, fonti più ampie, granularità
territoriale, dashboard tecnica, calibrazione statistica, E2E completi), quanto segue **non è
stato affrontato** in questa sessione e resta onestamente fuori scope:

1. **Catalogo strutturato delle fonti** (meteo, suolo, vegetazione, idrologia, sentieristica) con
   stato attiva/da integrare/scartata e motivazione per ciascuna — oggi le fonti attive sono solo
   quelle già in `docs/DISCOVERY-AND-ARCHITECTURE.md` (SIR, Open-Meteo, ERA5, Salerni et al. 2023).
2. **Griglia territoriale più fine delle sette zone** — dipende da G1 sopra, richiede dati non
   ancora ingeriti.
3. **Dashboard tecnica interna** (stato fonti, anomalie di ingestione, distribuzione punteggi,
   regressioni del modello) — non esiste, oggi lo stato delle fonti si legge solo dai log.
4. **Metriche di calibrazione pubblicabili** (Brier score, precisione/richiamo, confronto fra
   versioni) — esiste `calibrate()` con correlazione di rango; le metriche più elaborate richiedono
   più dati di diario di quanti ce ne siano oggi (il progetto è appena partito).
5. **Test end-to-end reali** (browser, login Google vero, due dispositivi simulati) — solo test
   unitari e di integrazione sulla logica, vedi la sezione sopra.
6. **UI per aree salvate/preferenze** — lo schema di sincronizzazione è pronto, l'interfaccia no.
