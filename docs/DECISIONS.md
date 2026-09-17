# FungiCast Toscana — Decisioni di progetto

Risposte alle otto domande aperte del
[Discovery & Architecture Report](./DISCOVERY-AND-ARCHITECTURE.md), 17 settembre 2026.
Ogni decisione qui è vincolante per l'implementazione. Una modifica va registrata qui, non
solo nel codice.

---

## D1 — Licenza e modello d'uso → **aperto e non commerciale**

Il progetto resta personale e non commerciale.

Conseguenze operative:
- Restiamo sul **free tier di Open-Meteo** (10.000 chiamate pesate/giorno). Niente pubblicità,
  niente abbonamenti: sarebbero la condizione che fa scattare l'obbligo del piano a pagamento.
- L'MPI derivato dalle osservazioni SIR si pubblica **sotto CC-BY-SA**, coerentemente con lo
  share-alike della fonte. Non è un vincolo fastidioso in questo scenario: lo era solo nell'ipotesi
  commerciale.
- Attribuzione in UI come da §C.1 del report, in footer e nel bottom sheet di ogni cella.

---

## D2 — Backfill storico → **ERA5 ora, storico SIR in Phase 2**

- **Ora:** Open-Meteo Archive, ERA5 1991–2020 sui punti anchor. Climatologia completa, omogenea,
  senza buchi. ~1 GB, da scaricare **a rate limitato su più giorni** rispettando il budget
  giornaliero di chiamate pesate — non in un unico burst.
- **Phase 2:** storico SIR completo dal 1961 via `dati.php`, una tantum, per correggere il bias
  di ERA5 nei punti dove esiste una misura reale e per i percentili per stazione.
- **Trasversale:** climatologie LaMMA 1995–2014 scaricate subito (21 MB) come **validazione
  incrociata** indipendente, non come sorgente primaria.

---

## D3 — Database → **Supabase free** (scelta delegata, vincolo: perfetto e gratuito)

Vincolo posto dall'utente: *«quello che vuoi ma deve essere perfetto e gratis»*. Scelgo Supabase.

Motivo: D7 richiede autenticazione dall'MVP, e Supabase porta **Auth, RLS e PostGIS nello stesso
free tier**. Neon non ha l'auth e avrebbe richiesto un secondo servizio, il che disfa metà del
vantaggio. Il branching di Neon sarebbe utile per i backtest, ma non vale un provider di
autenticazione in più.

**"Gratis" regge solo con due accorgimenti, che diventano quindi requisiti e non ottimizzazioni:**

1. **Non salvare lo storico osservato grezzo in database.** In DB vanno le **normali climatiche
   derivate** — l'unica cosa che l'operativo legge — e lo storico grezzo resta in Parquet su
   object storage. Senza questo si sfondano i 500 MB (stima §R.3 del report: 4–6 GB).
2. **Ritenzione su `mpi_scores`:** dettaglio giornaliero per 90 giorni, poi aggregati decadali.

La **pausa per inattività** del free tier è di fatto prevenuta dal cron giornaliero, ma resta una
dipendenza implicita: va monitorata nel pannello di salute delle fonti, non data per scontata.

---

## D4 / D4-bis — Specie → **solo porcino, un unico profilo**

Due restringimenti successivi, entrambi vincolanti:

1. *«A me interessano solo i porcini»* → fuori galletto, ovolo, trombetta dei morti e ogni altra
   specie. Non vanno reintrodotte in roadmap, UI o schema senza richiesta esplicita.
2. *«A me interessa cercare i porcini, non la qualità del porcino»* → **niente distinzione
   tassonomica esposta**. Nessun selettore di specie, nessuna separazione visibile fra
   *B. edulis*, *B. aereus* e *B. reticulatus*.

**Come lo traduco nel modello.** Un solo indice, "Porcino". Ma i parametri **variano con stagione
e quota**, perché ignorarlo peggiorerebbe proprio la risposta che interessa: le condizioni
favorevoli a giugno a 500 m in cerreta non sono quelle di ottobre a 1100 m in faggeta. Non è
tassonomia riportata dalla finestra — è il modello che si adatta al contesto, e all'utente resta
un numero solo.

Concretamente, in `species_parameters` resta **una sola riga di specie** (`porcino`), con i
parametri espressi come funzioni continue di `day_of_year` e `elevation_m` anziché come costanti.
La tabella `species` non cambia struttura: l'estensibilità resta, ma non è un obiettivo.

Base di letteratura: *B. edulis* in faggeta — finestra termica **20 giorni**, ottimo **≈ 13 °C**,
finestra di precipitazione **26 giorni**, lineare e senza soglia superiore
(Brejon Lamartiniere & Hoffman 2026). Questi parametri governano il regime autunnale d'alta quota.
Il regime estivo di bassa quota **non ha fonte** ed è marcato `is_calibrated = false`.

---

## D5 — Scala del punteggio → **nuova scala, 97 resta raro**

Non ricalibro per riprodurre i riferimenti del baseline (35 mm/lag 12 → ~66; 60 mm/lag 11 → ~97).

Motivo: il secondo punto di riferimento cade **esattamente dove il baseline satura** (a 60 mm il
`rainScore` è già a 1.0, piena efficacia a 45 mm), quindi ancorare la scala lì significherebbe
ereditare il difetto. Con l'ottimo termico misurato a 13 °C su finestra di 20 giorni, condizioni
molto buone danno **~75**. Il fondo scala resta riservato a condizioni davvero eccezionali.

Nota per il futuro: se in esercizio la distribuzione dei punteggi risultasse troppo compressa in
basso, si ritara la normalizzazione — è un parametro in `algorithm_versions`, non codice.

---

## D6 — Shock termico → **peso 0, da validare col diario**

Nessun supporto di campo trovato: il fattore non compare fra i predittori testati negli studi di
campo consultati, e le prove esistenti riguardano **saprotrofi coltivati** (*Flammulina filiformis*,
*Lentinula edodes*, *Pleurotus*), organismi e condizioni diversi.

Entra come termine opzionale in configurazione, `is_calibrated = false`, **peso iniziale 0**, e
viene calcolato e registrato anche quando è disattivato — così, quando ci saranno abbastanza
osservazioni nel diario, il confronto è già possibile senza ricalcolare il passato.

---

## D7 — Autenticazione → **Supabase Auth dall'MVP**

Login fin dall'MVP. Diario uscite e preferiti sincronizzati fra dispositivi.

Motivo: il diario è il dato più prezioso del progetto — è ciò che permette di calibrare il modello
confrontando MPI previsto ed esito reale — e un diario locale si perde cambiando telefono.

Requisiti che ne derivano:
- **RLS** su tutte le tabelle utente.
- **Coordinate private per default**, con approssimazione opzionale e `privacy_level` per riga.
- `geom_exact` privato, `geom_public` derivato per sfocatura.
- `mpi_at_observation`, `confidence_at_observation` e `algorithm_version_id` **congelati** al
  momento dell'inserimento dell'osservazione. Senza questi tre campi il dato di calibrazione è
  irrecuperabile a posteriori.

---

## D8 — Copertura territoriale → **7 zone in produzione, griglia predisposta in parallelo**

Scelta delegata (*«quello che pensi meglio»*). Scelgo la via di mezzo, per una ragione precisa:
è l'unica delle tre che **non comporta rework**.

- **In produzione subito:** ~350 celle da 1 km attorno alle sette zone di taratura (Amiata,
  Casentino, Pratomagno, Garfagnana, Appennino pistoiese, Mugello, Colline Metallifere). Si vede
  una mappa funzionante presto e si calibra dove il terreno è noto.
- **In parallelo, senza bloccare:** preprocessing di maschera bosco (UCS 10k 2019) e DTM 2023,
  costruzione dell'anchor grid a 2 km. Quando è pronto, l'estensione regionale è un interruttore
  in configurazione, non un progetto.

La griglia regionale piena resta in Phase 2, con il dimensionamento di §R.2 del report
(~2.880 anchor, ~4.900 chiamate pesate/giorno, dentro il free tier).

---

## Conseguenze aggregate sull'architettura

Rispetto al report, la combinazione delle otto decisioni **semplifica**:

| Voce | Report | Dopo le decisioni |
|---|---|---|
| Specie da modellare | 6, con sottospecie di porcino | **1 profilo**, parametrico in stagione e quota |
| Celle in produzione v1 | 350 (MVP) o 2.880+ (Ultimate) | **350**, anchor pronti in parallelo |
| Storico da ingerire prima di partire | fino a 600 MB SIR | **solo ERA5**, a rate limitato |
| Provider | DB + eventuale auth separata | **Supabase** per entrambi |
| Costo mensile | €0–25 | **€0**, con i due vincoli di storage di D3 |

Il vincolo semantico non negoziabile resta invariato: **l'MPI indica la compatibilità delle
condizioni, mai la presenza di funghi.** Scala testuale da "condizioni sfavorevoli" a "condizioni
molto favorevoli", come token nel design system, con test automatico di non regressione (§T.5).
