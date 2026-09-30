import Link from 'next/link'

import { InstallForYou } from '@/components/install/InstallForYou'
import { InAppNotice, InstallSteps, IosHelp, IosMockups } from '@/components/install/InstallSteps'
import { INSTALL_PLATFORMS, PLATFORM_LABEL } from '@/lib/pwa/platform'

/**
 * «Installa l'app»: la pagina a cui portano tutti gli inviti (la barra in basso, la finestra che
 * si apre da sola, l'Account, il benvenuto e la guida).
 *
 * In cima le istruzioni per il telefono che si ha in mano, scelte dal browser; sotto, **sempre**,
 * quelle di tutti gli altri, rese dal server: se il riconoscimento sbaglia, se JavaScript non
 * parte, o se si sta spiegando a qualcun altro come fare, la risposta c'è comunque.
 */
export function InstallScreen() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
      <header className="mb-4 flex items-start gap-3">
        {/* Un SVG statico: `next/image` non ha niente da ottimizzare. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-2xl" />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Metti FungiCast nella schermata Home
          </h1>
          <p className="mt-1 text-sm leading-snug text-ink-dim">
            Un minuto, niente App Store né Play Store, gratis. Poi si apre dall&apos;icona come
            tutte le altre app.
          </p>
        </div>
      </header>

      <ul className="mb-5 grid gap-2 text-sm leading-snug text-ink-dim sm:grid-cols-3">
        <Perk title="Anche senza rete">
          In bosco si apre lo stesso, con l&apos;ultimo calcolo e il diario.
        </Perk>
        <Perk title="A tutto schermo">Senza la barra del browser: più spazio per la mappa.</Perk>
        <Perk title="Sempre a portata">Un tocco dalla schermata Home, senza cercare il sito.</Perk>
      </ul>

      <section aria-labelledby="per-te" className="mb-6 rounded-2xl border border-accent/40 bg-surface-1 p-4">
        <h2 id="per-te" className="sr-only">
          Istruzioni per questo telefono
        </h2>
        <InstallForYou />
        <noscript>
          <p className="text-sm text-ink-dim">Scegli qui sotto il tuo telefono e il tuo browser.</p>
        </noscript>
      </section>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Tutti i telefoni
      </h2>
      <div className="space-y-2">
        {INSTALL_PLATFORMS.map((platform) => (
          <details
            key={platform}
            className="group rounded-xl border border-edge bg-surface-1 open:bg-surface-1"
          >
            <summary
              className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3
                         px-3 py-2.5 text-sm font-medium text-ink focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
            >
              {PLATFORM_LABEL[platform]}
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="shrink-0 text-ink-faint transition-transform group-open:rotate-90"
              >
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="space-y-3 border-t border-edge px-3 pb-3 pt-3">
              {platform === 'ios-safari' && <IosMockups />}
              <InstallSteps platform={platform} />
            </div>
          </details>
        ))}
      </div>

      <div className="mt-4">
        <InAppNotice ios={false} />
      </div>

      {/* Sempre visibile, non solo a chi il browser riconosce come iPhone: serve anche a chi aiuta un altro. */}
      <section id="iphone-aiuto" className="mt-6 scroll-mt-4">
        <IosHelp />
      </section>

      <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Domande
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-ink-dim">
        <Qa q="È un'app vera? Devo scaricarla da uno store?">
          No, nessuno store. È il sito stesso, salvato sul telefono come applicazione: stesso
          contenuto, sempre aggiornato, e occupa pochissimo spazio.
        </Qa>
        <Qa q="Si aggiorna da sola?">
          Sì. Ogni volta che la apri con la rete prende il calcolo del giorno e l&apos;ultima
          versione. Non c&apos;è niente da aggiornare a mano.
        </Qa>
        <Qa q="Su iPhone ho già salvato punti nel diario da Safari. Li perdo?">
          No, restano in Safari. Però su iPhone l&apos;app installata ha una memoria sua, separata da
          quella di Safari: i punti fissi salvati in Safari non compaiono nell&apos;app, e viceversa.
          Le uscite del diario invece si ritrovano, se fai l&apos;accesso anche dall&apos;app. Conviene
          installarla subito e da lì in poi usare solo l&apos;icona. Su Android invece la memoria è
          la stessa di Chrome.
        </Qa>
        <Qa q="Non trovo la voce nel menu.">
          Quasi sempre è perché il link è stato aperto dentro WhatsApp, Facebook o Instagram: apri la
          pagina nel browser (Safari su iPhone, Chrome su Android) e riprova. In una finestra di
          navigazione privata alcuni browser non la mostrano.
        </Qa>
        <Qa q="Come la tolgo?">
          Come qualsiasi app: tieni premuta l&apos;icona e scegli <em>Rimuovi</em> o{' '}
          <em>Disinstalla</em>.
        </Qa>
      </div>

      <p className="mt-8 text-center text-sm">
        <Link href="/" className="inline-flex min-h-11 items-center text-accent underline underline-offset-2">
          Torna a «Dove vado»
        </Link>
      </p>
    </div>
  )
}

function Perk({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-xl border border-edge bg-surface-1 px-3 py-2.5">
      <strong className="block font-semibold text-ink">{title}</strong>
      {children}
    </li>
  )
}

function Qa({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-ink">{q}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  )
}
