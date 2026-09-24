import Link from 'next/link'

import { ALGORITHM_V1, EVIDENCE, REFERENCES, paramCounts } from '@/lib/config/algorithm'
import { MODEL_CHANGELOG } from '@/lib/config/changelog'
import { formatDate } from '@/lib/ui/scale'

/**
 * «Come calcoliamo l'indice»: il modello spiegato a chi deve decidere se fidarsi.
 *
 * Senza JavaScript, come la guida: è una pagina da leggere, anche con la rete che va a tratti.
 * I numeri (finestre, soglie, ottimo, quanti parametri hanno una fonte) sono letti da
 * `ALGORITHM_V1` e non scritti a mano: una pagina di trasparenza che resta indietro rispetto al
 * modello che descrive sarebbe il contrario di ciò che promette.
 */
export function MethodScreen({ nationalZones }: { nationalZones: number }) {
  const c = ALGORITHM_V1
  const counts = paramCounts()
  const sources = (Object.keys(REFERENCES) as Array<keyof typeof REFERENCES>).map((key) => ({
    key,
    citation: REFERENCES[key],
    evidence: EVIDENCE[key],
  }))

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Come calcoliamo l&apos;indice</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-dim">
        Modello <strong className="text-ink">{c.version}</strong>. Cosa entra nel punteggio, da dove
        vengono i numeri, quanto ci si può fidare e cosa è cambiato di versione in versione.
      </p>

      <Section title="In breve">
        <p>
          Per ogni zona l&apos;indice va da 0 a 100 e misura quanto pioggia, acqua nel terreno,
          temperatura, stagione, quota e bosco degli ultimi giorni <em>somigliano</em> alle
          condizioni in cui il porcino fruttifica. Non conta i funghi, non dice dove sono e non dice
          se sono buoni da mangiare: per quello ci sono gli ispettorati micologici delle ASL.
        </p>
      </Section>

      <Section title="Cosa entra nel punteggio">
        <ul className="space-y-3">
          <Factor title="Acqua nel terreno">
            La pioggia degli ultimi {c.water.windowDays.value} giorni, che si consuma col tempo più
            in fretta quando fa caldo e l&apos;aria è secca (evapotraspirazione). Se il terreno
            partiva asciutto ne serve di più.
          </Factor>
          <Factor title="La pioggia forte che innesca la buttata">
            Un giorno con almeno {c.trigger.intenseEventMm.value} mm fa salire il punteggio, con il
            massimo circa {c.trigger.lagDays.value} giorni dopo: è il ritardo misurato sul Monte
            Amiata. In quei giorni il terreno che si asciuga non azzera più il punteggio (dalla
            versione 1.5.0).
          </Factor>
          <Factor title="Temperatura">
            La media degli ultimi {c.thermal.airWindowDays.value} giorni, confrontata con quella in
            cui il porcino fruttifica di più ({c.thermal.optAutumnC.value} °C in autunno in quota).
            Il freddo penalizza più del caldo moderato; gelate e caldo estremo hanno penalità a parte.
          </Factor>
          <Factor title="Stagione e quota">
            Sotto i {c.phenology.lowElevationM.value} m conta il regime estivo, sopra i{' '}
            {c.phenology.highElevationM.value} m quello autunnale, in mezzo una miscela.
          </Factor>
          <Factor title="Il bosco">
            Quanto bosco c&apos;è attorno alla zona e di che tipo (faggeta, castagneto, abetina,
            querceto…): per un fungo che vive in simbiosi con gli alberi è il posto a decidere.
          </Factor>
        </ul>
        <p className="mt-3">
          I fattori si moltiplicano: basta che uno manchi del tutto perché il punteggio resti basso,
          ed è quello che la scheda «Perché» di ogni zona chiama il limite principale.
        </p>
      </Section>

      <Section title="Quanto ci si può fidare">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-ink">Sette aree toscane</strong> usano le misure delle stazioni
            del Servizio Idrologico Regionale: pioggia e temperature vere, non solo modello.
          </li>
          <li>
            <strong className="text-ink">
              Le altre {nationalZones.toLocaleString('it-IT')} zone
            </strong>{' '}
            in tutta Italia usano il solo
            modello meteo e sono segnate come <em>anteprima</em>: utili per orientarsi, meno solide.
          </li>
          <li>
            Dei parametri del modello, <strong className="text-ink">{counts.sourced}</strong> hanno
            una fonte (studio o misura) e <strong className="text-ink">{counts.calibrate}</strong>{' '}
            sono ancora stime da tarare con i dati, e lo dichiariamo nella scheda «Perché».
          </li>
          <li>
            <strong className="text-ink">Banco di prova.</strong> Il modello viene confrontato con i
            ritrovamenti reali di porcino in Italia registrati su GBIF/iNaturalist (2016-2025), con il
            meteo storico di quei giorni: un giorno con ritrovamento deve avere un punteggio più alto
            dei giorni senza, nello stesso posto. Ogni modifica al modello passa da qui prima di
            andare in produzione.
          </li>
          <li>
            <strong className="text-ink">Il tuo diario.</strong> Ogni uscita registrata, anche
            andata male, confronta la previsione con quello che hai trovato: è l&apos;unico dato con
            le assenze vere, e il modo in cui il modello impara dove sbaglia.
          </li>
        </ul>
      </Section>

      <Section title="Versioni del modello">
        <ol className="space-y-3">
          {MODEL_CHANGELOG.map((release) => (
            <li key={release.version} className="rounded-lg border border-edge bg-surface-1 p-3">
              <p className="text-xs text-ink-faint">
                {release.version} · {formatDate(release.date)}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-ink">{release.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-dim">{release.what}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-dim">
                <span className="font-medium text-ink">Perché: </span>
                {release.why}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Le fonti scientifiche">
        <ul className="space-y-3">
          {sources.map(({ key, citation, evidence }) => (
            <li key={key} className="text-sm leading-relaxed">
              <p className="text-ink">{citation}</p>
              <p className="mt-0.5 text-xs text-ink-faint">
                {evidence.status === 'applicable'
                  ? 'Applicabile così com’è.'
                  : (evidence.userCaution ?? 'Da usare con cautela.')}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="I dati">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Meteo e previsioni: Open-Meteo (CC BY 4.0), su modelli ECMWF, DWD, NOAA ed ERA5.</li>
          <li>Stazioni in Toscana: Regione Toscana, Servizio Idrologico Regionale (CC BY-SA).</li>
          <li>Tipi di bosco: ForestPaths. Confini dei comuni: ISTAT (CC BY).</li>
          <li>Nomi dei luoghi: OpenStreetMap / Nominatim (ODbL). Mappa di base: CARTO, © OpenStreetMap.</li>
        </ul>
        <p className="mt-3">
          Il calcolo gira ogni giorno in automatico; la data dell&apos;ultimo calcolo è in fondo a
          «Dove vado», in «Dati e fonti».
        </p>
      </Section>

      <p className="mt-8 text-sm">
        <Link href="/guida" className="text-accent underline underline-offset-2">
          Come si usa l&apos;app, schermata per schermata
        </Link>
        {' · '}
        <Link href="/regole" className="text-accent underline underline-offset-2">
          Le regole di raccolta, regione per regione
        </Link>
        {' · '}
        <Link href="/chi-siamo" className="text-accent underline underline-offset-2">
          Chi siamo
        </Link>
        {' · '}
        <Link href="/privacy" className="text-accent underline underline-offset-2">
          Privacy
        </Link>
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-ink-dim">{children}</div>
    </section>
  )
}

function Factor({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-lg bg-surface-2 px-3 py-2.5">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-ink-dim">{children}</p>
    </li>
  )
}
