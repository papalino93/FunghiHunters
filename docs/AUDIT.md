# Audit — FungiCast Toscana

**Data:** 17 settembre 2026 · **Base:** commit `f204931` · **Metodo:** lettura del codice, esecuzione
dell'app su viewport mobile e desktop, verifica dei dati prodotti, calcolo dei rapporti di contrasto.

Ordinati per gravità, non per area.

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

## Priorità di intervento

1. B1, B2, G2 — correzioni di onestà e accessibilità, costo basso.
2. B3 — diario uscite, perché ogni giorno di ritardo è dato perso.
3. G5 — schermata "Dove vado oggi".
4. G4 — PWA e offline.
5. G3, M1 — test dei componenti e scomposizione.
6. G1 — celle più fini: **richiede** la maschera forestale UCS e il DTM, non ancora ingeriti.
   Farlo sui sette punti sarebbe aggiungere falsa precisione invece di toglierla.
