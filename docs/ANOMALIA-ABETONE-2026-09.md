# Anomalia segnalata: Abetone, metà settembre 2026

**Segnalazione dell'utente**: negli ultimi 15 giorni l'app mostra un potenziale bassissimo per la
zona Appennino pistoiese (Abetone Cutigliano), ma chi è uscito ha trovato porcini "a bizzeffe".

**Verifica**: non è un errore di calcolo. Ho ricostruito a mano l'aritmetica del motore sui dati
reali dello snapshot del 17 settembre 2026 e torna, cifra per cifra, col numero mostrato in app
(MPI 14.7). Il problema — reale — è un altro: **il modello ha un ritardo strutturale che in
questo momento specifico lo sta facendo sbagliare**, e la causa è individuabile con precisione.

## I numeri

Zona: Appennino pistoiese, Cutigliano, 1000 m. Finestra dei 20 giorni che alimenta il punteggio
di oggi (media mobile all'indietro):

| giorno | pioggia | massima | minima |
|---|---|---|---|
| 10 set | 10.7 mm | 19.3 °C | 13.3 °C |
| 11 set | 1.5 mm | 20.3 °C | 11.8 °C |
| 12 set | 0.1 mm | 21.7 °C | 11.8 °C |
| 13 set | 0 mm | 22.4 °C | 10.0 °C |
| 14 set | 0 mm | 23.1 °C | 12.1 °C |
| 15 set | 0 mm | 23.8 °C | 12.0 °C |
| 16 set | 0 mm | 21.9 °C | 12.0 °C |
| **17 set (oggi)** | **19.6 mm** | **17.7 °C** | **12.0 °C** |

**Quello che salta all'occhio**: la settimana dal 10 al 16 è stata calda e secca (temperatura
massima in salita fino a quasi 24 °C, pioggia quasi nulla). Il 17 settembre arriva una pioggia
vera (19.6 mm) e la temperatura crolla di 6 gradi in un giorno. È esattamente il tipo di evento —
caldo secco seguito da un raffreddamento con pioggia — che chi va per boschi riconosce come
innesco di una buttata. **Il modello lo vede, ma con settimane di ritardo**, per due motivi
precisi:

1. **La media termica usata è su 20 giorni**, quindi il crollo di ieri pesa 1/20 sul numero di
   oggi: la media resta a **18.7 °C**, contro un ottimo di **13 °C** per il regime autunnale
   d'alta quota (Abetone è sopra i 900 m, quindi il modello usa solo quell'ottimo). Il
   raffreddamento vero c'è, ma serve tempo prima che la media se ne accorga — è una proprietà
   strutturale di una media mobile a 20 giorni durante una transizione stagionale brusca, non
   della singola giornata.
2. **La pioggia di oggi (19.6 mm) manca per un soffio la soglia di "evento intenso" (20 mm)**
   che farebbe scattare il bonus di innesco (+35% al punteggio, con effetto massimo al dodicesimo
   giorno, fonte Salerni 2023 sull'Amiata). 0.4 mm di differenza, e il bonus non parte.

Il bilancio idrico (45 mm efficaci su un fabbisogno di 92 mm, perché il terreno partiva secco)
contribuisce anch'esso, moltiplicato per il fattore termico: **due fattori ciascuno attorno al
35-40% si moltiplicano fra loro** (`punteggio = acqua × temperatura × stagione × innesco`) e il
risultato composto crolla molto più delle singole parti — 0.35 × 0.38 ≈ 0.13, non 0.35 o 0.38.
Questo è voluto (è come funziona la co-limitazione biologica: serve **sia** acqua **sia**
temperatura giusta, non basta una delle due), ma con due fattori solo moderatamente sfavorevoli
il risultato composto sembra molto peggiore di quanto ciascuno singolarmente suggerirebbe.

## Cosa significa, onestamente

Non ho un secondo studio indipendente che dica "il ritardo della media a 20 giorni è di N giorni
di troppo in Appennino toscano" — se lo inventassi ritarando un numero per far tornare un singolo
racconto, sarei caduto nell'errore esatto che questo progetto esiste per evitare: trattare
un'osservazione singola come prova generale. Quello che posso dire con i dati che ho:

- **L'ottimo di 13 °C viene da uno studio su faggeta tedesca** (Brejon 2026, preprint, clima
  continentale), già segnalato come "applicabile con cautela" in `docs/EVIDENZA-MODELLO.md` prima
  di questo episodio. Una transizione stagionale mediterranea, più brusca di quella tedesca,
  potrebbe rendere una finestra di 20 giorni sistematicamente troppo lenta a inseguirla — è
  un'ipotesi coerente con quello che si vede qui, non una certezza.
- **La soglia dei 20 mm per l'evento intenso è stata mancata di un soffio** (19.6 mm). Non è un
  errore: è il tipo di caso limite che una soglia netta produce sempre. Vale la pena registrarlo.
- **Non è escluso che il vero innesco sia stato un evento di pioggia precedente**, fuori dalla
  finestra dei 15 giorni mostrati qui, di cui non ho visibilità in questa analisi.

## Cosa serve per saperlo davvero

Questo è esattamente il caso d'uso per cui esiste il diario e il pannello di calibrazione
costruiti in questa sessione. **Se registri quest'uscita nel diario** (zona Appennino pistoiese,
data, abbondanza "molti"), il punteggio 14.7 di oggi viene congelato insieme all'esito reale: è
il primo punto dati concreto per capire se il problema è la finestra dei 20 giorni, l'ottimo
termico transitato dalla Germania, o la soglia dell'innesco troppo rigida — invece di
indovinarlo. Con un solo punto non si calibra nulla (la soglia minima dichiarata nel pannello è
12 uscite), ma è da qualche parte che si comincia, ed è meglio di un numero ritoccato a mano per
farlo tornare con un racconto.

## Non ancora fatto in questa sessione

Non ho modificato la finestra dei 20 giorni, l'ottimo termico o la soglia dei 20 mm: cambiarli
ora, sulla base di un solo episodio per quanto convincente, sarebbe ricalibrare a occhio esattamente
quello che il progetto vieta esplicitamente. Se vuoi, il prossimo passo naturale è uno di questi,
non tutti insieme:

1. Registrare nel diario le uscite di chi ha trovato porcini all'Abetone in questi giorni (anche
   a memoria, con data approssimata) — costruisce da subito il primo campione di calibrazione.
2. Mostrare in interfaccia il trend recente a 3-5 giorni accanto alla media a 20 giorni, così un
   raffreddamento reale come questo si vede subito invece di restare nascosto dentro una media
   lenta — è un miglioramento di trasparenza, non una ricalibrazione: non cambia il punteggio, fa
   vedere meglio perché è quello che è.
3. Accorciare la finestra termica o abbassare la soglia dell'evento intenso — solo dopo avere
   qualche uscita di diario a supporto, non prima.
