import Link from 'next/link'

/**
 * La guida dell'app, in una pagina sola.
 *
 * **Senza JavaScript.** Niente `'use client'`, niente stato: le FAQ usano `<details>/<summary>`
 * nativi, che si aprono anche se lo script non è ancora arrivato o non arriva affatto. È la
 * pagina che si legge quando qualcosa non torna — e "qualcosa non torna" comprende anche la rete
 * che va a tratti in mezzo al bosco, dove una guida che richiede JS per aprirsi è una guida che
 * non c'è.
 *
 * Il contenuto è allineato a `docs/MANUALE-UTENTE.md`, che resta la versione per chi legge il
 * repository; questa è quella per chi ha l'app in mano.
 */

const SEZIONI = [
  { id: 'cosa-fa', titolo: 'Cosa fa, e cosa non fa' },
  { id: 'regole', titolo: 'Regole di utilizzo' },
  { id: 'uso', titolo: 'Come si usa, schermata per schermata' },
  { id: 'diario-guida', titolo: 'Il diario e i punti salvati' },
  { id: 'dati', titolo: 'I tuoi dati e la riservatezza' },
  { id: 'faq', titolo: 'Domande frequenti' },
] as const

export function GuideScreen() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Come funziona</h1>
        <p className="mt-1 text-sm leading-snug text-ink-dim">
          Cosa misura davvero questa app, cosa non può dirti, e come usarla senza scambiare una
          stima per una garanzia.
        </p>
      </header>

      {/* Avviso non negoziabile: primo, non in fondo, e non nascosto dietro un menu. */}
      <p className="mb-5 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-xs leading-relaxed text-ink">
        <strong className="font-semibold text-warn">Prima di tutto il resto.</strong> Questa app
        non riconosce i funghi e non dice mai se un fungo è commestibile. Per quello esistono gli{' '}
        <strong className="font-medium">ispettorati micologici delle ASL</strong>, gratuiti: usali
        sempre, per ogni raccolto, anche quando sei sicuro.
      </p>

      <nav aria-label="Indice della guida" className="mb-6 rounded-xl border border-edge bg-surface-1 p-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">In questa pagina</h2>
        <ol className="mt-1.5 space-y-1">
          {SEZIONI.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex min-h-9 items-center text-sm text-accent underline
                           underline-offset-2 hover:text-ink focus:outline-none focus-visible:ring-2
                           focus-visible:ring-accent"
              >
                {i + 1}. {s.titolo}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Sezione id="cosa-fa" titolo="Cosa fa, e cosa non fa">
        <p>
          L&apos;app calcola, per oltre milleduecento zone in tutta Italia, un numero da 0 a 100 che dice quanto
          le condizioni ambientali di quei giorni <strong className="text-ink">assomigliano</strong>{' '}
          a quelle in cui il porcino fruttifica: pioggia recente, acqua rimasta nel terreno,
          temperatura dell&apos;aria e del suolo, evapotraspirazione, quota, tipo di bosco,
          stagione.
        </p>
        <p>
          <strong className="text-ink">Non è una previsione di funghi.</strong> Nessuno strumento
          al mondo sa dirti se domani in quel bosco ci saranno funghi: dipende da fattori che non
          si misurano da satellite — chi è passato ieri, il micelio sotto terra, il microclima di
          un versante. Questa app misura le condizioni, non il risultato.
        </p>
        <Elenco
          voci={[
            'Ti dice dove le condizioni sono più compatibili, fra le zone che copre.',
            'Ti dice quanto fidarti di quel numero, che è una cosa diversa dal numero stesso.',
            'Ti aiuta a registrare com’è andata davvero, per capire nel tempo se il modello ci prende.',
          ]}
        />
        <p className="text-ink-faint">
          Il numero da solo non basta mai: accanto trovi sempre <em>quanto è affidabile la stima</em>{' '}
          (quante stazioni meteo vicine, quanti dati osservati contro quanti previsti). Una zona può
          avere condizioni ottime e una stima incerta: vanno lette insieme.
        </p>
      </Sezione>

      <Sezione id="regole" titolo="Regole di utilizzo">
        <Regola titolo="Non raccogliere nulla che non sai riconoscere">
          L&apos;app non ti aiuta in questo, e non lo farà. Un errore di identificazione può essere
          mortale, e non esiste un&apos;app che possa assumersene la responsabilità al posto tuo.
          Porta il raccolto all&apos;ispettorato micologico della ASL: è gratuito.
        </Regola>
        <Regola titolo="Controlla le regole locali prima di partire">
          Servono quasi sempre un tesserino di raccolta e il rispetto di limiti di peso e modalità,
          che cambiano da provincia a provincia. La sezione &laquo;Prima di partire&raquo; nella
          schermata <em>Dove vado</em> riassume quelle principali con la data in cui sono state
          verificate — ma la fonte ufficiale resta la Regione o l&apos;ente del parco.
        </Regola>
        <Regola titolo="Aree protette e proprietà private non le conosce">
          L&apos;app non sa dove finisce un parco o inizia un fondo privato: quei confini non sono
          ancora fra i suoi dati. Verificali tu, prima di andare.
        </Regola>
        <Regola titolo="Il bosco resta un posto serio">
          Copertura telefonica assente, temporali, buio che arriva prima del previsto, terreno
          scivoloso. Dì a qualcuno dove vai, e usa i <em>punti salvati</em> per ritrovare l&apos;auto.
        </Regola>
      </Sezione>

      <Sezione id="uso" titolo="Come si usa, schermata per schermata">
        <Voce titolo="La tua regione">
          Dalla scheda Account, o dal selettore in cima a &laquo;Dove vado&raquo;, scegli la
          regione da cui parte l&apos;app: sono quelle le zone che vedi aprendo
          &laquo;Dove vado&raquo;, la mappa e il diario. Senza sceglierne una vale la Toscana,
          l&apos;unica regione con stazioni di misura collegate.{' '}
          <strong className="text-ink">Non è un confine:</strong> tutte le altre regioni restano
          consultabili dalla scheda Italia, e dalla mappa puoi spostarti fra una e l&apos;altra
          senza cambiare quella di casa.
        </Voce>
        <Voce titolo="Dove vado">
          È la schermata di apertura. In alto scegli il giorno; sotto trovi una frase che riassume
          la situazione (&laquo;Oggi no&raquo;, &laquo;Oggi ci sta andare&raquo;) e il motivo in
          parole, non in numeri. Poi le zone, dalla migliore: per ognuna la fascia di potenziale,
          cosa funziona, cosa manca, e quanto fidarsi della stima. Se dai la posizione (o scegli un
          punto di partenza salvato) le distanze compaiono in linea d&apos;aria — mai su strada:
          per quello serve un navigatore.
        </Voce>
        <Voce titolo="Mappa">
          Da &laquo;Dettaglio e mappa&raquo; su una zona, o dalla barra in basso. Mostra le zone
          della regione che stai guardando — quella di casa se arrivi dalla barra, quella della
          zona se arrivi da una scheda — con il meteo dei giorni intorno alla data scelta, le
          stazioni usate per la stima e la spiegazione completa del punteggio.{' '}
          <strong className="text-ink">Le zone sono aree ampie, non punti:</strong> un pallino
          preciso suggerirebbe una precisione che i dati non hanno ancora.
        </Voce>
        <Voce titolo="Diario">
          Dove registri com&apos;è andata. È la parte che rende l&apos;app migliore nel tempo: vedi
          la sezione dedicata qui sotto.
        </Voce>
        <Voce titolo="Meteo">
          Diversa dalla mappa: qui non ci sono le zone del modello, ma un
          <strong className="text-ink"> luogo qualsiasi</strong> — un paese, una frazione, un
          parcheggio — che cerchi per nome o con la tua posizione. Mostra il dato grezzo, senza
          passare dal punteggio: condizioni attuali, cinque giorni passati e dieci di previsione
          (temperatura, umidità, pioggia, vento, evapotraspirazione, umidità del suolo), con il
          dettaglio ora per ora toccando un giorno. Risponde a &laquo;che tempo fa lì&raquo;, non a
          &laquo;conviene andarci&raquo; — per quello resta &laquo;Dove vado&raquo;.
        </Voce>
        <Voce titolo="Account">
          Facoltativo. Serve solo se vuoi ritrovare il diario su un secondo telefono. Senza
          account l&apos;app funziona per intero, tranne la sincronizzazione.
        </Voce>
      </Sezione>

      <Sezione id="diario-guida" titolo="Il diario e i punti salvati">
        <p>
          Ogni volta che registri un&apos;uscita, l&apos;app <strong className="text-ink">congela
          il punteggio che aveva previsto quel giorno</strong>. È l&apos;unico modo per scoprire,
          col tempo, se quel numero predice qualcosa: il meteo di oggi non torna più, e senza il
          confronto previsto/osservato non si può calibrare niente.
        </p>
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-ink-dim">
          <strong className="text-ink">Registrare i &laquo;niente trovato&raquo; conta più dei
          successi.</strong> Un modello che impara solo dalle giornate buone diventa ottimista
          senza motivo. Se sei uscito e non hai trovato nulla, quella è informazione preziosa.
        </p>
        <p>
          Campi facoltativi ma utili: <em>durata della ricerca</em> e <em>quante persone</em>{' '}
          cercavano. Uno zero dopo dieci minuti e uno zero dopo mezza giornata non dicono la stessa
          cosa, e senza quel dato il diario non può distinguerli.
        </p>
        <Voce titolo="Punti salvati">
          Con un tocco segni dove hai lasciato l&apos;auto, l&apos;accesso al sentiero, un bivio o
          un punto a cui tornare — con distanza e direzione dalla tua posizione attuale, e un link
          per aprirlo nell&apos;app mappe. Ci sono due elenchi, e cambia quanto durano:
        </Voce>
        <Elenco
          voci={[
            '«Punti fissi» (in cima al Diario): i riferimenti che valgono per tutte le uscite — casa, il parcheggio abituale, un accesso al bosco. Restano lì finché non li cancelli tu. Quelli di tipo «Partenza» compaiono anche in Dove vado, come punto da cui calcolare le distanze.',
            '«Punti di questa uscita» (dentro una voce del diario): valgono per quella camminata soltanto — l’auto di oggi, il bivio di oggi. Se cancelli l’uscita spariscono con lei.',
          ]}
        />
        <p className="text-ink-faint">
          Nessun punto viene registrato automaticamente: l&apos;app non traccia i tuoi spostamenti,
          non registra percorsi e non funziona in background. Salva solo quando lo tocchi tu.
        </p>
      </Sezione>

      <Sezione id="dati" titolo="I tuoi dati e la riservatezza">
        <Elenco
          voci={[
            'Il diario vive sul tuo dispositivo. Senza account non esce di lì, e l’app non ha modo di leggerlo.',
            'Con un account, il diario si sincronizza per ritrovarlo altrove. Solo tu puoi leggerlo: lo garantisce una regola del database che lega ogni riga al tuo utente.',
            'I punti salvati (fissi e di un’uscita) restano sempre e solo sul dispositivo: non vengono mai sincronizzati, con o senza account.',
            'La posizione precisa di un’uscita viene salvata sfocata a circa un chilometro, a meno che tu scelga esplicitamente «coordinate esatte» per quella voce.',
            'La sfocatura è definitiva: una volta salvata l’area, le coordinate precise non esistono più da nessuna parte.',
          ]}
        />
        <p className="text-ink-faint">
          Puoi esportare il diario in un file in qualunque momento (Diario → Esporta) e cancellare
          account e dati dal server dalla schermata Account. La cancellazione è definitiva.
        </p>
      </Sezione>

      <Sezione id="faq" titolo="Domande frequenti">
        <Faq domanda="Se il punteggio è alto, troverò funghi?">
          No, e nessuna versione futura di questa app te lo dirà. Un punteggio alto significa che
          le condizioni ambientali somigliano a quelle in cui il porcino fruttifica. Il micelio può
          non essere pronto, qualcuno può essere passato un&apos;ora prima, quel versante può fare
          storia a sé. È un indice di compatibilità, non una previsione di raccolto.
        </Faq>
        <Faq domanda="Perché la mia zona non c'è?">
          L&apos;app copre 1.202 zone in tutte e venti le regioni, più sette aree della Toscana
          seguite a parte. Le zone sono comuni, e sono i più alti d&apos;Italia: entra chi ha il
          terreno sopra i 600 metri. Se il tuo comune non c&apos;è, quasi sempre sta più in basso
          di così.
          <br />
          <br />
          Il punto in cui calcoliamo il meteo, però, non è il centro del comune: lo spostiamo
          dentro il bosco, che spesso sta più in basso del centro geometrico. Per questo qualche
          zona mostra una quota sotto i 600 metri — è la quota del suo bosco, non quella del paese.
          <br />
          <br />
          Le sette aree toscane restano le uniche con stazioni di misura al suolo collegate, e per
          questo sono le più affidabili. Altrove il punteggio viene dal solo modello meteo, e
          l&apos;affidabilità indicata su ogni zona ne tiene conto: è più bassa, dichiaratamente.
        </Faq>
        <Faq domanda="Il bosco conta nel punteggio?">
          Sì, da questa versione. Di ogni zona misuriamo da satellite quanto bosco c&apos;è attorno
          al punto di calcolo e di che alberi è fatto, e tutte e due le cose pesano: una zona quasi
          spoglia non può segnare come una coperta di faggeta, anche se ci è piovuto uguale.
          <br />
          <br />
          La mappa riconosce il genere, non il tipo di bosco: faggio, querce, abete rosso, larice e
          pino escono con il loro nome, mentre castagno e abete bianco finiscono dentro
          «altre latifoglie» e «altre conifere». Dove il bosco è in quelle classi generiche non
          abbassiamo il punteggio — non sarebbe colpa del bosco, è un limite del nostro dato —
          ma abbassiamo l&apos;affidabilità.
        </Faq>
        <Faq domanda="Cosa vuol dire «stima incerta»?">
          Che i dati su cui il numero è costruito sono scarsi o lontani: poche stazioni vicine,
          molti valori previsti invece che misurati, un giorno lontano nel tempo, oppure un bosco
          che la mappa riconosce solo in parte. Il potenziale può essere alto e la stima incerta
          insieme: è il caso in cui conviene fidarsi meno del numero.
        </Faq>
        <Faq domanda="Funziona senza rete, nel bosco?">
          Sì, per quello che è già stato caricato: l&apos;app si installa come applicazione sul
          telefono e conserva l&apos;ultimo calcolo. Il diario si scrive anche in modalità aereo, e
          si sincronizza da solo quando torna la connessione. Quello che non può fare senza rete è
          aggiornare i dati meteo.
        </Faq>
        <Faq domanda="Devo per forza creare un account?">
          No. Tutto funziona senza: mappa, previsione, diario, punti salvati. L&apos;account serve
          solo a ritrovare il diario su un secondo dispositivo.
        </Faq>
        <Faq domanda="Perché mi chiede la posizione?">
          Solo per ordinare le zone per distanza e per salvare un punto quando lo chiedi tu. Puoi
          rifiutare: le zone restano tutte visibili, semplicemente non ordinate per vicinanza. In
          alternativa puoi scegliere a mano un punto di partenza.
        </Faq>
        <Faq domanda="Il numero cambia se lo guardo domani. È normale?">
          Sì. Il calcolo si rifà una volta al giorno con i dati meteo nuovi, e la previsione dei
          giorni successivi si aggiorna insieme. In fondo alla schermata <em>Dove vado</em> trovi
          sempre la data dell&apos;ultimo calcolo: se è vecchia di giorni, l&apos;app te lo dice.
        </Faq>
        <Faq domanda="Ho trovato un errore o qualcosa non torna.">
          La schermata Account mostra in fondo il numero di versione dell&apos;app che stai
          usando: serve a capire se stai guardando l&apos;ultima pubblicata o una copia rimasta in
          cache. Se il problema riguarda i dati di una zona, la scheda della zona dichiara sempre da
          quali stazioni arrivano e quanto distano.
        </Faq>
      </Sezione>

      <p className="mt-6 rounded-xl border border-edge bg-surface-1 px-3 py-2.5 text-xs leading-relaxed text-ink-dim">
        Questa guida descrive l&apos;app così com&apos;è oggi, senza promettere quello che non fa.
        Se una parte ti sembra poco chiara, probabilmente è scritta male: è un difetto da
        correggere, non un tuo limite.{' '}
        <Link
          href="/"
          /* Come in `WelcomeHero`: area toccabile allargata senza spostare il testo. */
          className="relative text-accent underline underline-offset-2 hover:text-ink
                     after:absolute after:inset-x-0 after:-inset-y-4 after:content-['']"
        >
          Torna a &laquo;Dove vado&raquo;
        </Link>
      </p>
    </div>
  )
}

function Sezione({
  id,
  titolo,
  children,
}: {
  id: string
  titolo: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="mb-6 scroll-mt-4">
      <h2 className="mb-2 border-b border-edge pb-1.5 text-base font-semibold tracking-tight text-ink">
        {titolo}
      </h2>
      <div className="space-y-2.5 text-sm leading-relaxed text-ink-dim">{children}</div>
    </section>
  )
}

function Voce({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-edge bg-surface-1 px-3 py-2.5">
      <h3 className="text-sm font-medium text-ink">{titolo}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-dim">{children}</p>
    </div>
  )
}

function Regola({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <div>
        <h3 className="text-sm font-medium text-ink">{titolo}</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-dim">{children}</p>
      </div>
    </div>
  )
}

function Elenco({ voci }: { voci: readonly string[] }) {
  return (
    <ul className="space-y-1.5">
      {voci.map((voce) => (
        <li key={voce} className="flex gap-2.5">
          <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span className="text-sm leading-relaxed text-ink-dim">{voce}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * `<details>` nativo invece di uno stato React: si apre senza JavaScript, è già annunciato
 * correttamente dai lettori di schermo e non ha bisogno di `aria-expanded` gestito a mano.
 */
function Faq({ domanda, children }: { domanda: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-edge bg-surface-1">
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3
                   py-2 text-sm font-medium text-ink focus-visible:outline-none
                   focus-visible:ring-2 focus-visible:ring-accent"
      >
        {domanda}
        <svg
          width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"
          className="shrink-0 text-ink-faint transition-transform group-open:rotate-180"
        >
          <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <p className="border-t border-edge px-3 py-2.5 text-sm leading-relaxed text-ink-dim">
        {children}
      </p>
    </details>
  )
}
