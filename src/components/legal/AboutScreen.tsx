import Link from 'next/link'

import { Contact } from '@/components/legal/Contact'
import { OWNER_NAME } from '@/lib/site/owner'

/** «Chi siamo»: chi fa FungiCast, perché, e cosa l'app non è. */
export function AboutScreen() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Chi siamo</h1>

      <Section title="Il progetto">
        <p>
          FungiCast è un progetto personale di {OWNER_NAME}, nato da una domanda semplice: con la pioggia e le temperature degli ultimi giorni, dove vale la pena
          andare? Ogni giorno l&apos;app confronta il meteo di ogni zona con le condizioni in cui il
          porcino fruttifica, secondo la letteratura scientifica, e lo dice con un punteggio da 0 a
          100.
        </p>
      </Section>

      <Section title="Come lavoriamo">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-ink">Il metodo è pubblico.</strong> Ogni parametro del modello
            ha una fonte o è dichiarato come stima, e ogni modifica viene provata sui ritrovamenti
            reali prima di andare online.{' '}
            <Link href="/metodo" className="text-accent underline underline-offset-2">
              Come calcoliamo l&apos;indice
            </Link>
            .
          </li>
          <li>
            <strong className="text-ink">Dati aperti</strong> da Open-Meteo, dalle stazioni del
            Servizio Idrologico della Regione Toscana, da ISTAT e da OpenStreetMap.
          </li>
          <li>
            <strong className="text-ink">Non commerciale.</strong> Niente pubblicità e niente dati
            venduti. Chi vuole può sostenere le spese con Buy Me a Coffee.
          </li>
          <li>
            <strong className="text-ink">Rispetto di chi lo usa.</strong> Si usa senza account, non
            traccia gli spostamenti, e i posti che trovi restano tuoi.{' '}
            <Link href="/privacy" className="text-accent underline underline-offset-2">
              Privacy
            </Link>
            .
          </li>
        </ul>
      </Section>

      <Section title="Cosa FungiCast non è">
        <p>
          Non dice dove sono i funghi: dice dove le condizioni sono favorevoli. Non riconosce le
          specie e non dice mai se un fungo è commestibile: per quello ci sono gli ispettorati
          micologici delle ASL, gratuiti. Le regole di raccolta che riassumiamo non sono consulenza
          legale.
        </p>
      </Section>

      <Section title="Contatti">
        <p>
          Segnalazioni, errori nei dati, zone che mancano o richieste sulla privacy: <Contact />.
        </p>
      </Section>
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
