# Design di FungiCast — audit del 24/09/2026 e direzione «Sottobosco»

Audit visivo su 164 schermate (390 × 844 chiaro e scuro, 1440 × 900). Qui la sintesi, la
direzione proposta e il prompt pronto per Claude Design. Cosa è già stato corretto nel codice è
segnato con ✅.

## Cosa funziona

- La voce: il verdetto in parole prima dei numeri, l'onestà sull'incertezza («Anteprima · stima da
  modello, non verificata da stazioni»), le avvertenze e le fonti.
- Le basi di accessibilità: contrasti documentati, bersagli da 44 px, stato mai affidato al solo
  colore, `prefers-reduced-motion`.
- Le idee di visualizzazione: barra a cinque bande, incertezza come retino, sparkline passato/previsione.

## I problemi, per impatto

1. **Nessuna identità visiva**: niente logo in home, palette grigio-blu da cruscotto SaaS.
2. **La scala del punteggio comunicava al contrario** — ✅ corretta (scala «da secco a fertile»,
   più inchiostro dove il punteggio è più alto, in chiaro e scuro).
3. **Home poco densa**: una scheda zona è alta ~265 pt, 1,5 schede per schermata.
4. **Il verdetto non ha un punto d'ancoraggio**: solo testo, niente numero grande né grafico.
5. **La scheda zona soffoca la mappa**: niente maniglia né posizioni di aggancio.
6. **I segnaposto a goccia suggeriscono un punto**, mentre le zone sono aree; niente cluster.
7. **Meteo tabellare** — ✅ in parte: vento in km/h, virgola decimale, riquadro della pioggia per
   chi cerca. Restano icone, barre min/max e orario a scorrimento.
8. **Bottoni senza gerarchia**: principale e secondario quasi uguali.
9. **Scala tipografica piatta**: 217 `text-xs`, due soli `text-2xl`.
10. **Desktop non progettato**: una colonna da telefono al centro dello schermo.

## Direzione «Sottobosco»

Taccuino del naturalista: carta calda, inchiostro verde bosco, il porcino come nota di marca,
cartografia topografica. L'incertezza ha un linguaggio visivo suo, la «nebbia»: retino e colore
ardesia, sempre con l'etichetta «Anteprima».

Palette, tipografia, spaziatura, componenti e movimento sono nel prompt qui sotto, che è la
versione autosufficiente della proposta.

## Prompt per Claude Design

```
Progetta l'interfaccia di FungiCast, una PWA italiana che dice a chi cerca porcini se oggi le condizioni ambientali sono favorevoli e dove conviene andare. Produci schermate ad alta fedeltà e un prototipo cliccabile, prima mobile 390×844 poi desktop 1440×900, ciascuna in tema chiaro e scuro.

PRODOTTO
FungiCast calcola per oltre 1.200 zone italiane un indice MPI da 0 a 100: quanto pioggia recente, acqua utile nel suolo, temperatura, quota, tipo di bosco e stagione somigliano alle condizioni in cui il porcino fruttifica, compreso il ritardo di circa 12 giorni fra una pioggia forte e la buttata. Non dice dove sono i funghi: dice dove vale la pena provare e quanto è sicuro di quel che dice. In Toscana 7 aree sono verificate da stazioni al suolo; tutte le altre sono stime del solo modello meteo, sempre etichettate "Anteprima · stima da modello, non verificata da stazioni". L'onestà sull'incertezza è il valore centrale: l'incertezza deve vedersi, non nascondersi.

UTENTI E CONTESTO
Cercatori occasionali e appassionati, 30–70 anni. Usano l'app all'aperto, spesso al sole, a volte con i guanti, con una mano sola, a volte senza campo in bosco. Decidono la sera prima o in macchina. Su telefono l'app si installa come PWA (iPhone e Android).

VINCOLI (non negoziabili)
Niente riconoscimento di funghi né foto per identificarli; niente feed social, condivisione pubblica o classifiche; niente tracciamento GPS continuo; niente notifiche invasive. L'app non dice mai se un fungo è commestibile e rimanda agli ispettorati micologici delle ASL.

ARCHITETTURA ATTUALE
Barra in basso a 5 voci: Dove vado, Mappa, Diario, Meteo, Account. Striscia "Installa l'app" sopra la barra, solo da telefono.
- Dove vado (home): selettore regione (+ "Tutte" per l'elenco regioni), selettore del giorno (oggi + 7), card del verdetto, card delle zone dalla più consigliata; poi filtri, "Prima di partire" (norme e sicurezza), "Dati e fonti".
- Mappa: segnaposto con punteggio, cursore del giorno (−14 → +7), scheda zona con tab Sintesi, Meteo, Dove cercare, Perché, Dati.
- Diario: registra un'uscita (data, zona, quanti trovati da "nessuno" a "eccezionale", durata, alberi, note, posizione), "Punti fissi", confronto previsione/esito, esporta/importa.
- Meteo: ricerca di un luogo, condizioni attuali, riquadro "Pioggia, per chi cerca" (ultima pioggia vera N giorni fa, mm ultimi 7/30 giorni, mm previsti), tabella giorno per giorno con dettaglio orario.
- Guida: come funziona, regole, domande frequenti.

DIREZIONE VISIVA "SOTTOBOSCO"
Taccuino del naturalista: carta calda, inchiostro verde bosco, il porcino come nota di marca, cartografia topografica, dati da tavola scientifica. Header compatto con logo porcino + "FungiCast".
Palette chiara: fondo #F5F2EA, superfici #FFFDF8 e #ECE7DB, testo #1E261D / #465043 / #5A6355, primario muschio #2E5E3A (testo bianco), marca porcino #7F4F22, ambra #8A5700, ruggine #A33A2C, nebbia (anteprima) #4A5F7E.
Palette scura: fondo #0F130F, superfici #161B15 e #20271E, testo #ECEFE4 / #BAC2B0 / #98A18E, muschio #8CC795 (testo #0F130F), porcino #DDA86E, ambra #E9B452, ruggine #F0907F, nebbia #A4B5D1.
Scala MPI a 5 gradini, dal secco al fertile (già in uso nell'app) — chiaro: #DDD5C2, #C2B77F, #93AA5E, #4F8C4A, #2A5F37; scuro: #3B3D33, #6E6C45, #8FA45A, #7DC377, #BDE88F. La barra ha un contorno e un segno in inchiostro. Stima da modello = riempimento retinato + colore nebbia, ovunque.
Tipografia: Fraunces per verdetto e titoli (32/36 su mobile), Inter con cifre tabellari per l'interfaccia (corpo 16/24, etichette 14, didascalie 13). Virgola decimale, vento in km/h. Spaziatura a base 4, margine laterale 16. Raggi 10 per i controlli, 16 per le card, 24 per le schede dal basso. Icone a linea 24 px, tratto 1,75 (goccia, termometro, albero, montagna, nebbia, antenna, bussola, scarpone). Illustrazioni in stile linoleografia a 2–3 toni, solo per benvenuto, stati vuoti ed errori. Movimento 150–250 ms, niente animazioni in loop.

COMPONENTI CHIAVE
- Card del verdetto: numero grande + nome della banda, titolo in Fraunces, motivo con icona (es. goccia: "La pioggia forte di 14 giorni fa cade nella finestra in cui il porcino di solito spunta"), striscia di 7 giorni a pallini colorati per banda che fa anche da selettore, bottone principale "Vai a Pratomagno". Se la stima è del solo modello: fascia nebbia in alto e niente verde pieno.
- Card zona compatta (~112 pt, 5 per schermata): nome, quota, bosco, badge del punteggio, barra da 8 pt, una riga sul limite, stella; tutta la card toccabile.
- Segnaposto: badge circolare (non a goccia), numero leggibile, alone per l'area, anello tratteggiato per l'anteprima, cluster "max 98 · 12 zone".
- Scheda zona dal basso con 3 posizioni (peek, metà, quasi piena), maniglia, tab fisse; cursore del giorno integrato nel bordo della mappa; su desktop pannello laterale di 400 px.
- Meteo: barre min/max giornaliere, orario a scorrimento orizzontale con icone, riquadro pioggia in evidenza.

SCHERMATE DA PRODURRE
Mobile 390: 1) home Toscana con verdetto e zone; 2) home Piemonte in anteprima; 3) selettore del giorno su sabato; 4) mappa con segnaposto e cluster; 5) scheda zona in peek; 6) scheda zona piena, tab Sintesi con sparkline; 7) tab Perché; 8) Meteo Abetone con riquadro pioggia e dettaglio orario; 9) Diario vuoto; 10) form "Registra un'uscita"; 11) Account; 12) stati di caricamento, offline ed errore; 13) striscia "Installa l'app" aperta con le istruzioni per iPhone. Poi desktop 1440: home a due colonne (elenco + mappa), mappa con pannello laterale, Meteo.

ACCESSIBILITÀ
Bersagli minimo 44 px (56 per la barra in basso); corpo minimo 14 px, didascalie minimo 12; contrasto AA per il testo e 3:1 per gli elementi grafici; stato mai affidato al solo colore; tutto usabile senza trascinamento; chiaro e scuro per ogni schermata; proponi anche una "Modalità sole" ad alto contrasto.

CONTENUTI DI ESEMPIO (usali alla lettera)
Verdetto: "Oggi sì." Motivo: "La pioggia forte di 14 giorni fa cade nella finestra in cui il porcino di solito spunta. Il freno è la temperatura: 19 °C di media, contro i 13 ideali." Consiglio: "Il posto più indicato è Mugello." Zone: Mugello 64/100 favorevoli (900 m, faggeta, cerreta), Pratomagno 72/100, Garfagnana 66/100, Monte Amiata 2/100 sfavorevoli. Piemonte in anteprima: "Oggi buone condizioni, secondo il modello." Etichetta: "Anteprima · stima da modello, non verificata da stazioni". Meteo: "Ultima pioggia vera: 14 giorni fa, 36 mm." Avviso: "L'indice descrive condizioni ambientali compatibili con la fruttificazione, non la presenza reale di funghi."
```
