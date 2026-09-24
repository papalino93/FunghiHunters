import Link from 'next/link'

import { Contact } from '@/components/legal/Contact'
import { formatLongDate } from '@/lib/rules/format'
import { OWNER_NAME, PRIVACY_UPDATED_ON } from '@/lib/site/owner'

/**
 * Informativa sulla privacy (art. 13 GDPR), scritta per chi la legge e non per un avvocato.
 *
 * Descrive quello che l'app fa davvero: se il codice cambia il modo in cui tratta i dati, questa
 * pagina va aggiornata insieme, con la data in cima.
 */
export function PrivacyScreen() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Privacy</h1>
      <p className="mt-1 text-sm text-ink-dim">
        Ultimo aggiornamento: {formatLongDate(PRIVACY_UPDATED_ON)}.
      </p>

      <Section title="In breve">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Si può usare tutta l&apos;app senza account e senza lasciare dati personali.</li>
          <li>Niente cookie di profilazione, niente pubblicità, niente vendita di dati.</li>
          <li>
            Il diario e i punti salvati restano sul tuo dispositivo. Con un account il diario si
            sincronizza, e solo tu puoi leggerlo.
          </li>
          <li>Le statistiche di visita sono anonime e aggregate, senza cookie.</li>
        </ul>
      </Section>

      <Section title="Chi è il titolare">
        <p>
          FungiCast è un progetto personale e non commerciale di {OWNER_NAME}, che è il titolare
          del trattamento dei dati descritti qui. Per qualunque richiesta sulla privacy scrivi a{' '}
          <Contact />.
        </p>
      </Section>

      <Section title="Senza account">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-ink">Sul tuo dispositivo</strong> (memoria del browser) restano
            il diario, i punti salvati, le zone seguite senza account e alcune preferenze, come il
            benvenuto già chiuso. Non escono da lì e noi non possiamo leggerli.
          </li>
          <li>
            <strong className="text-ink">Un solo cookie</strong>, tecnico: <code>fungicast.regione</code>,
            con la regione che hai scelto, per un anno. Serve a mostrarti quella regione alla
            prossima apertura.
          </li>
          <li>
            <strong className="text-ink">La regione di partenza</strong>, alla prima visita, viene
            dedotta dall&apos;indirizzo IP da Vercel, che ospita il sito. Si usa per quella
            richiesta e non viene salvata.
          </li>
          <li>
            <strong className="text-ink">La posizione del telefono</strong> si usa solo quando la
            chiedi tu (per ordinare le zone per distanza, per il meteo di dove sei, per salvare un
            punto). Per il meteo le coordinate passano dal nostro server, che le gira a Open-Meteo
            per la previsione e a OpenStreetMap/Nominatim per il nome del luogo; non le salviamo.
            L&apos;app non traccia mai i tuoi spostamenti.
          </li>
        </ul>
      </Section>

      <Section title="Con un account">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-ink">Cosa salviamo:</strong> l&apos;indirizzo email, le uscite
            del diario che sincronizzi e le zone che segui. La posizione di un&apos;uscita è salvata
            sfocata a circa un chilometro, salvo che tu scelga le coordinate esatte per quella
            voce. I punti salvati non vengono mai sincronizzati.
          </li>
          <li>
            <strong className="text-ink">Perché:</strong> per darti il servizio che hai chiesto,
            cioè ritrovare il diario su un altro dispositivo (art. 6.1.b GDPR). Le uscite servono
            anche a confrontare la previsione con quello che hai trovato: solo nel tuo diario, mai
            pubblicate né condivise.
          </li>
          <li>
            <strong className="text-ink">Chi può leggerle:</strong> solo tu. Lo garantisce una
            regola del database che lega ogni riga al tuo utente.
          </li>
          <li>
            <strong className="text-ink">Accesso:</strong> con un link via email o con Google. Con
            Google, Google sa che hai fatto l&apos;accesso a FungiCast; noi riceviamo solo email e
            nome dell&apos;account.
          </li>
          <li>
            <strong className="text-ink">Per quanto:</strong> finché hai l&apos;account. Dalla
            schermata Account lo cancelli con tutti i dati sul server, in modo definitivo.
          </li>
        </ul>
      </Section>

      <Section title="Statistiche di visita">
        <p>
          Contiamo le visite con Vercel Web Analytics e misuriamo la velocità delle pagine con
          Vercel Speed Insights. Non usano cookie né identificativi salvati sul dispositivo: vediamo
          quante persone aprono quali pagine, in forma aggregata. Prima dell&apos;invio
          dall&apos;indirizzo della pagina togliamo tutto tranne regione, zona e giorno, quindi per
          esempio non parte mai il luogo cercato nel meteo.
        </p>
      </Section>

      <Section title="I fornitori">
        <p>Il sito si appoggia a questi servizi, ciascuno con la propria informativa:</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>Vercel: ospita il sito, con i normali registri tecnici delle richieste (indirizzo IP, pagina, orario).</li>
          <li>Supabase: database e accesso per chi ha un account.</li>
          <li>Google: solo se scegli di accedere con Google.</li>
          <li>CARTO: le tessere della mappa, che il browser scarica direttamente.</li>
          <li>Open-Meteo e OpenStreetMap/Nominatim: meteo e nomi dei luoghi, chiamati dal nostro server.</li>
          <li>Buy Me a Coffee: il pulsante per sostenere il progetto, caricato dal loro sito.</li>
        </ul>
        <p className="mt-2">
          Alcuni di questi fornitori possono trattare dati anche fuori dall&apos;Unione Europea, con
          le garanzie previste dal GDPR per questi trasferimenti.
        </p>
      </Section>

      <Section title="I tuoi diritti">
        <p>
          Puoi chiedere di vedere, correggere, esportare o cancellare i tuoi dati, e opporti al loro
          uso. Molte cose le fai da solo: il diario si esporta da Diario → Esporta, e
          l&apos;account si cancella dalla schermata Account. Per il resto scrivi a <Contact />.
          Puoi anche presentare un reclamo al{' '}
          <a
            href="https://www.garanteprivacy.it"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-2"
          >
            Garante per la protezione dei dati personali
          </a>
          .
        </p>
      </Section>

      <p className="mt-8 text-sm">
        <Link href="/chi-siamo" className="text-accent underline underline-offset-2">
          Chi siamo
        </Link>
        {' · '}
        <Link href="/guida#dati" className="text-accent underline underline-offset-2">
          I tuoi dati, nella guida
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
