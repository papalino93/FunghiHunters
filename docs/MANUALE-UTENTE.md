# Come usare FungiCast

Guida breve, in italiano semplice. Serve a leggere l'app senza scambiare una stima per una
garanzia — che è l'unico modo sbagliato di usarla.

> Questa è la versione per chi legge il repository. La stessa guida vive **dentro l'app**, alla
> pagina `/guida` ("Come funziona", raggiungibile dalla schermata Account): è una pagina senza
> JavaScript, così si apre anche quando la rete va a tratti. Se modifichi uno dei due testi,
> allinea l'altro — `src/components/guida/GuideScreen.tsx`.

## Cosa fa l'app, e cosa non fa

L'app calcola, per alcune zone della Toscana, quanto le condizioni ambientali (pioggia recente,
acqua rimasta nel terreno, temperatura dell'aria e del suolo, quota, tipo di bosco) **assomigliano
a quelle in cui il porcino fruttifica**, secondo dati meteo reali e alcuni studi scientifici.

**Non fa questo:**

- Non ti dice se troverai funghi. Non lo sa nessuno strumento, e chi lo promette mente.
- Non identifica specie né dice se un fungo è commestibile. Per quello esistono gli
  **ispettorati micologici delle ASL**, gratuiti: usali sempre in caso di dubbio.
- Non conosce i confini di aree protette o proprietà private: verificali tu, prima di partire.

Finché il modello non è stato validato su abbastanza uscite reali (vedi "Il diario" più sotto),
parliamo sempre di **indice di compatibilità ambientale**, non di probabilità di trovare funghi.
È una differenza voluta, non un tecnicismo.

## La schermata "Dove vado"

È la prima cosa che vedi aprendo l'app.

**In alto**, i giorni fra cui scegliere: oggi e i prossimi giorni per cui esistono dati.

**Subito sotto, il verdetto** — una frase, non un numero:

- *"Oggi no."* — le condizioni non sono da fungo, in nessuna zona coperta.
- *"Oggi si può tentare, senza aspettarsi molto."*
- *"Oggi ci sta andare."*
- *"Oggi sì."*

Sotto il verdetto, sempre in una frase, il **perché** (es. *"Fa ancora troppo caldo: 19 °C di
media negli ultimi 20 giorni, contro i 13 a cui il porcino fruttifica"*) e cosa succede nei
prossimi giorni, se cambia qualcosa.

**Poi le zone**, dalla migliore. Ogni scheda mostra:

- **nome, distanza e quota** — se hai dato la posizione, la distanza è in linea d'aria; per la
  strada vera guarda "Dettaglio e mappa";
- **la barra del potenziale**: cinque fasce, da *sfavorevoli* a *molto favorevoli*. Conta la
  fascia, non il numero esatto — il numero (0–100) resta accanto solo per confrontare due zone o
  un giorno con l'altro;
- **cosa funziona e cosa manca**, in una frase ciascuno (es. *"L'acqua c'è: 62 mm ancora
  disponibili nel suolo"* oppure *"Manca il fresco: 19.5 °C di media, ottimo 13.0"*);
- **quando conviene**, se un altro giorno nell'orizzonte disponibile è nettamente meglio di oggi;
- **quanto fidarsi della stima**: *stima solida*, *stima discreta* o *stima incerta*. È una cosa
  diversa dal potenziale: una zona può avere condizioni ottime ma pochi dati osservati vicini, e
  allora la stima resta incerta anche se il numero è alto. **Leggi sempre entrambe le cose
  insieme.**

## Posizione e filtri

- **Posizione**: te la chiede l'app solo se gliela concedi tu, e solo per ordinare le zone per
  distanza. Puoi anche non darla: le zone restano visibili, solo non ordinate per vicinanza. In
  alternativa al GPS puoi scegliere un punto di partenza salvato in precedenza (Diario → Punti
  fissi → tipo "Partenza") o un riferimento di zona: la distanza resta sempre in linea d'aria.
- **Filtri** (sotto le zone, si aprono a richiesta): distanza massima, tipo di bosco, affidabilità
  minima dei dati. Se nessuna zona rispetta i filtri, l'app te lo dice invece di mostrarti
  qualcosa che non hai chiesto.
- **Aree escluse**: le zone che i filtri tolgono di mezzo non spariscono e basta. Sotto la lista
  trovi "N aree escluse dai filtri" — apri per vedere quali e perché (es. "Amiata: a 910 m, sotto
  la quota minima di 1000 m").

## La mappa

Dalla scheda di una zona, "Dettaglio e mappa" apre la mappa su quella zona: meteo dei giorni
intorno alla data scelta, stazioni usate per la stima (se le mostri), e la spiegazione completa
del punteggio nella scheda "Perché".

Le zone oggi sono sette aree ampie della Toscana, non punti precisi: un pallino su una mappa
suggerirebbe una precisione che i dati non hanno ancora. Quando l'app arriverà a una griglia più
fine (serve una mappa forestale e altimetrica che non è ancora stata integrata), lo vedrai
riflesso qui.

## "Prima di partire"

Sezione a comparsa, sotto i filtri. Contiene quello che serve **prima** di mettersi in macchina:
tesserino di raccolta (quando serve e quanto costa), limiti di peso e di raccolta, come
raccogliere per legge, promemoria su aree protette e proprietà private, e il richiamo a
controllare il bollettino meteo regionale. Le norme citate hanno una data di verifica: se sono
passati mesi, controlla la fonte ufficiale linkata lì, non fidarti a occhio.

**Un unico promemoria si ripete in fondo a questa sezione, ed è il più importante:** l'app non
riconosce le specie e non dice mai se un fungo è commestibile.

## Il diario

Il diario (scheda in basso) serve a registrare com'è andata un'uscita: data, zona, quanto hai
trovato (anche "niente" — è importante quanto un buon raccolto, forse di più), quota e note
libere. Ogni volta che registri un'uscita, l'app congela il punteggio che aveva previsto quel
giorno: è l'unico modo per scoprire, nel tempo, se il punteggio predice davvero qualcosa. Finché
non ci sono abbastanza uscite registrate, la scheda "Calibrazione" del diario te lo dice
esplicitamente, invece di calcolare una correlazione che non avrebbe senso con pochi dati.

**Registrare i "niente trovato" non è pessimismo, è il dato che manca di più**: senza, il modello
imparerebbe solo dai successi e diventerebbe ottimista senza motivo.

**Posizione della voce**: premendo "Usa la mia posizione" nel modulo, l'app chiede al telefono il
punto esatto in cui ti trovi in quel momento — lo stesso permesso di geolocalizzazione usato
altrove nell'app, mai inviato a nessun server finché non lo salvi tu. Senza premerlo, la voce
registra solo la zona scelta dal menu, non un punto sulla mappa: è la differenza fra "ero in
Garfagnana" e "ero esattamente qui", ed è per questo che senza una posizione vera l'unico livello
di precisione che puoi scegliere è "solo la zona" — gli altri restano disattivati, per non
promettere una precisione che non esiste.

Puoi anche segnare gli **alberi presenti** (faggio, abete, castagno, cerro, leccio), quanto è
**durata la ricerca** in minuti e **quante persone** hanno cercato insieme a te — entrambi
facoltativi, servono a leggere meglio uno "zero": dopo dieci minuti non dice molto, dopo mezza
giornata sì. Niente foto: c'erano, sono state tolte perché non servivano al modello e complicavano
spazio, riservatezza ed esportazione senza un motivo concreto.

Il diario resta sul tuo telefono anche senza account. Puoi sempre esportarlo in un file (scheda
Diario → Esporta) come copia di sicurezza, e reimportarlo su un altro dispositivo.

### Punti salvati

Con un tocco segni l'auto parcheggiata, l'accesso al sentiero, un bivio o un altro riferimento,
con distanza e direzione dalla tua posizione attuale e un link diretto per aprirlo nell'app mappe
del telefono. Gli elenchi sono due, e la differenza è **quanto durano**:

- **"Punti fissi"** (in cima al Diario, pastiglia *sempre*): i riferimenti che valgono per tutte
  le uscite — casa, il parcheggio abituale, un accesso al bosco. Restano lì finché non li cancelli
  tu, e cancellare un'uscita non li tocca. Un punto fisso di tipo "Partenza" compare anche in
  **"Dove vado oggi"**, come punto da cui calcolare la distanza dalle zone.
- **"Punti di questa uscita"** (dentro una voce del diario, pastiglia *solo questa uscita*):
  valgono per quella camminata soltanto — l'auto di oggi, il bivio di oggi. Se cancelli l'uscita,
  spariscono con lei.

Un punto vive in uno dei due elenchi, mai in entrambi. Tutti i punti salvati, di qualunque tipo,
restano **solo sul dispositivo**, non sincronizzati mai: l'unica eccezione è "apri in mappe", che
condivide quella singola coordinata con l'app che scegli, e solo quando lo tocchi.

## La scheda Meteo

Diversa dalla mappa: qui non ci sono le sette zone del modello, ma un **luogo qualsiasi** — un
paese, una frazione, un parcheggio — cercato per nome o con la tua posizione. Mostra il dato
meteo grezzo, senza passare dal punteggio MPI: condizioni attuali, cinque giorni passati e dieci
di previsione (temperatura, umidità, pioggia, vento, evapotraspirazione, umidità del suolo).
Tocca un giorno per il dettaglio ora per ora.

Se hai appena guardato una zona in "Dove vado" o sulla mappa, la scheda si apre già sul suo
meteo: non serve cercarla. Basta cercare un altro posto per passare a quello, e il pulsante
"Meteo di …" ti riporta alla zona.

È la stessa fonte gratuita già usata dal modello (Open-Meteo), letta senza filtro: risponde a
"che tempo fa lì", non a "conviene andarci a cercare porcini" — per quello resta "Dove vado".

## Account e sincronizzazione (facoltativi)

Non serve un account per usare l'app. Serve solo se vuoi ritrovare il diario su un secondo
telefono o computer.

- Accedi dalla scheda **Account**, con Google oppure con un link via email (nessuna password).
- Dopo l'accesso, ogni modifica al diario si sincronizza da sola. Lo stato è sempre visibile:
  *salvato sul dispositivo* (non sei collegato, o non ancora sincronizzato), *sincronizzazione in
  corso*, *sincronizzato*, *errore di sincronizzazione* (con il motivo, se lo sappiamo).
- **Funziona anche offline**: registra pure un'uscita senza rete, si sincronizza da sola appena
  torna la connessione.
- Le coordinate esatte di un'uscita restano solo sul tuo dispositivo, a meno che tu scelga
  esplicitamente "coordinate esatte" per quella voce invece della sfocatura predefinita.
- Dalla scheda Account puoi anche scaricare una copia dei tuoi dati o cancellare l'account: la
  cancellazione toglie tutto dal server e non è recuperabile.
- **Telefono o computer condiviso**: se accedi con un account diverso da quello con cui questo
  dispositivo ha già sincronizzato, l'app non invia il diario in automatico — potrebbe essere
  quello di chi lo ha usato prima di te. Te lo dice chiaramente e chiede conferma prima di fare
  qualunque cosa.

## In tre frasi, se non leggi il resto

1. Un punteggio alto vuol dire condizioni compatibili, non funghi garantiti — e più è vecchia o
   povera la stima ("stima incerta"), meno vale la pena fidarsene.
2. "Niente trovato" va registrato quanto un buon raccolto: è quello che rende l'indice più
   affidabile nel tempo, non un fallimento da nascondere.
3. Per sapere se un fungo si mangia, non chiedere all'app: chiedi all'ispettorato micologico della
   tua ASL.
