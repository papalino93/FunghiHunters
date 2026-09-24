import Link from 'next/link'

import { ALGORITHM_V1 } from '@/lib/config/algorithm'

/**
 * «Quando nascono i porcini»: le risposte alle domande che si fanno a un motore di ricerca prima
 * di partire, con i numeri delle fonti che usa il modello e senza promettere nulla.
 *
 * I valori (ritardo, soglia della pioggia, finestre, ottimo) sono letti da `ALGORITHM_V1`, così la
 * pagina non può dire una cosa e il modello farne un'altra. Le affermazioni senza numero vengono
 * da `docs/EVIDENZA-MODELLO.md` e `docs/VALIDAZIONE.md`, con la loro cautela.
 */
export function PorciniGuide() {
  const c = ALGORITHM_V1
  return (
    <article className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        Quando nascono i porcini: pioggia, temperatura, quota e bosco
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        Quello che la ricerca scientifica dice sulla «buttata» del porcino (<em>Boletus edulis</em> e
        affini), in parole semplici. Sono gli stessi numeri con cui FungiCast calcola ogni giorno il
        punteggio delle zone, e hanno tutti una fonte, elencata in fondo.
      </p>

      <Q title="Dopo quanti giorni dalla pioggia nascono i porcini?">
        <p>
          Il segnale più chiaro è una <strong className="text-ink">pioggia forte</strong>, di almeno{' '}
          {c.trigger.intenseEventMm.value} mm in un giorno: l&apos;effetto sulla fruttificazione è
          massimo circa <strong className="text-ink">{c.trigger.lagDays.value} giorni dopo</strong>.
          È stato misurato per tre stagioni sul Monte Amiata, in un bosco di abete bianco a 1050 m.
          Nei querceti della Toscana meridionale lo stesso gruppo di ricerca ha trovato un ritardo
          simile, circa 10 giorni, su altre specie.
        </p>
        <p className="mt-2">
          In pratica la finestra da tenere d&apos;occhio va da poco più di una settimana a poco più
          di due dopo il temporale. Prima è presto, dopo, se non piove di nuovo, il terreno si
          asciuga.
        </p>
      </Q>

      <Q title="Quanta pioggia serve?">
        <p>
          Non basta un giorno: conta l&apos;acqua accumulata nelle settimane precedenti. In un
          decennio di censimenti in faggete tedesche la finestra che spiega meglio la fruttificazione
          è di <strong className="text-ink">{c.water.windowDays.value} giorni</strong>, con un
          effetto che cresce con la pioggia senza una soglia oltre la quale smette di aiutare.
        </p>
        <p className="mt-2">
          Conta anche quanta se ne perde: con il caldo e l&apos;aria secca il terreno si asciuga
          prima. Dopo un&apos;estate secca ne serve di più per ripartire.
        </p>
      </Q>

      <Q title="Che temperatura vogliono i porcini?">
        <p>
          Conta la media dell&apos;aria su circa {c.thermal.airWindowDays.value} giorni, non la
          temperatura di un singolo giorno. In autunno, in quota, il nostro banco di prova sui
          ritrovamenti reali in Italia colloca l&apos;ottimo intorno ai{' '}
          <strong className="text-ink">{c.thermal.optAutumnC.value} °C di media</strong>; lo studio
          tedesco lo misurava a 13 °C. Il freddo frena più del caldo moderato, le gelate fermano
          tutto.
        </p>
        <p className="mt-2">
          Un&apos;impennata improvvisa del caldo, con massime di circa 8 °C sopra la media del
          periodo, riduce la produzione nei giorni successivi: anche questo è stato misurato
          sull&apos;Amiata.
        </p>
      </Q>

      <Q title="In che mese e a che quota?">
        <p>
          Tradizionalmente il porcino estivo esce nei boschi di bassa e media quota (castagneti,
          querceti) e quello autunnale nelle faggete e abetine fra circa 900 e 1400 m. Negli ultimi
          decenni la fascia estiva sembra salita di 200-300 m.
        </p>
        <p className="mt-2">
          I ritrovamenti reali registrati in Italia (GBIF/iNaturalist, 2016-2025) mostrano però
          molti porcini anche in ottobre e novembre sotto i 700 m. Per questo dalla versione 1.6.0 il
          modello dà peso all&apos;autunno anche a bassa quota.
        </p>
      </Q>

      <Q title="In che bosco?">
        <p>
          Il porcino vive in simbiosi con le radici degli alberi (micorriza): senza gli alberi giusti
          non esce, qualunque sia il meteo. I più comuni sono faggio, castagno, querce, abete e pino.
          Per questo ogni zona di FungiCast tiene conto di quanto bosco ha intorno e di che tipo.
        </p>
      </Q>

      <Q title="Perché a volte non esce nulla anche con il meteo giusto?">
        <p>
          Perché il meteo è necessario ma non sufficiente. Contano il micelio che c&apos;è (o non
          c&apos;è) in quel punto preciso, l&apos;esposizione, il suolo, la gestione del bosco e chi
          è passato prima. Nessun modello li conosce: un punteggio alto dice che le condizioni sono
          favorevoli, non che i funghi ci sono.
        </p>
      </Q>

      <Q title="Quanto è affidabile una previsione così?">
        <p>
          Abbiamo confrontato il modello con 263 ritrovamenti reali di porcino in Italia e 747 giorni
          di controllo, con il meteo storico di quei giorni. In circa{' '}
          <strong className="text-ink">3 confronti su 4</strong> un giorno con ritrovamento ha un
          punteggio più alto di un giorno senza (AUC 0,755), e il modello batte nettamente il solo
          calendario. È un buon aiuto per scegliere dove e quando andare, non una certezza.{' '}
          <Link href="/metodo" className="text-accent underline underline-offset-2">
            Come calcoliamo l&apos;indice
          </Link>
          .
        </p>
      </Q>

      <section className="mt-8 rounded-xl border border-edge bg-surface-1 p-4">
        <h2 className="text-base font-semibold text-ink">E oggi?</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-dim">
          FungiCast applica tutto questo ogni giorno, zona per zona, con il meteo osservato e le
          previsioni dei prossimi giorni.
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            <Link href="/" className="text-accent underline underline-offset-2">
              Dove conviene cercare oggi
            </Link>
          </li>
          <li>
            <Link href="/italia" className="text-accent underline underline-offset-2">
              Le zone regione per regione
            </Link>
          </li>
          <li>
            <Link href="/regole" className="text-accent underline underline-offset-2">
              Le regole di raccolta della tua regione
            </Link>
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-ink">Fonti</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-xs leading-relaxed text-ink-dim">
          <li>
            Salerni E., Paoli L., Perini C. (2023), Combined impact of forest management and climate
            change on <em>Boletus edulis</em> productivity. Italian Journal of Mycology 52(1): 76-88.{' '}
            <Doi id="10.6092/issn.2531-7342/16464" />
          </li>
          <li>
            Salerni E. et al. (2002), Effects of temperature and rainfall on fruiting of macrofungi
            in oak forests of the Mediterranean area. Israel Journal of Plant Sciences 50: 189-198.
          </li>
          <li>
            Brejon Lamartiniere E., Hoffman J.I. (2026), Predicting porcini: a decade of sporocarp
            monitoring reveals the meteorological triggers of <em>Boletus edulis</em> fruiting in
            central European beech forests. bioRxiv, preprint non ancora sottoposto a revisione.
          </li>
          <li>
            Letteratura micologica italiana sulla fascia altimetrica del porcino (sintesi
            qualitativa, senza misure).
          </li>
          <li>
            FungiCast (2026), banco di prova caso-controllo sulle presenze GBIF di porcino in Italia,
            meteo storico ERA5 (Open-Meteo).
          </li>
        </ul>
        <p className="mt-3 text-xs text-ink-faint">
          L&apos;app non riconosce le specie e non dice mai se un fungo è commestibile: per quello
          ci sono gli ispettorati micologici delle ASL, gratuiti.
        </p>
      </section>
    </article>
  )
}

function Q({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-ink-dim">{children}</div>
    </section>
  )
}

function Doi({ id }: { id: string }) {
  return (
    <a
      href={`https://doi.org/${id}`}
      target="_blank"
      rel="noreferrer"
      className="underline decoration-dotted underline-offset-2 hover:text-ink"
    >
      doi:{id}
    </a>
  )
}
