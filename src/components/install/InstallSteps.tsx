import type { ReactNode } from 'react'

import type { InstallPlatform } from '@/lib/pwa/platform'

/**
 * I passi per mettere FungiCast nella schermata Home, browser per browser.
 *
 * Componente senza stato e senza `'use client'`: lo usano la pagina `/installa` e la guida, che
 * si leggono anche senza JavaScript, e la finestra e la barra dell'invito, che invece lo hanno.
 *
 * Le voci di menu sono scritte come le mostra il telefono in italiano. I browser le rinominano
 * ogni tanto («Aggiungi a schermata Home» è diventata «Installa app» su Chrome, per esempio):
 * per questo si nomina anche l'alternativa, e le icone disegnate aiutano a trovarle anche quando
 * la scritta cambia.
 */

const glyph = 'inline-block h-[1.15em] w-[1.15em] -translate-y-px align-middle'

export function ShareGlyph() {
  return (
    <svg viewBox="0 0 20 20" className={glyph} aria-hidden="true">
      <path
        d="M10 2.8v9.4M6.7 6 10 2.8 13.3 6M6.5 8.5H5.2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h9.6a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function AddToHomeGlyph() {
  return (
    <svg viewBox="0 0 20 20" className={glyph} aria-hidden="true">
      <rect x="3" y="3" width="14" height="14" rx="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6.6v6.8M6.6 10h6.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function DotsGlyph() {
  return (
    <svg viewBox="0 0 20 20" className={glyph} aria-hidden="true">
      <circle cx="4.5" cy="10" r="1.6" fill="currentColor" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" />
      <circle cx="15.5" cy="10" r="1.6" fill="currentColor" />
    </svg>
  )
}

function KebabGlyph() {
  return (
    <svg viewBox="0 0 20 20" className={glyph} aria-hidden="true">
      <circle cx="10" cy="4.5" r="1.6" fill="currentColor" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" />
      <circle cx="10" cy="15.5" r="1.6" fill="currentColor" />
    </svg>
  )
}

function BurgerGlyph() {
  return (
    <svg viewBox="0 0 20 20" className={glyph} aria-hidden="true">
      <path d="M4 5.5h12M4 10h12M4 14.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** Una voce da toccare: in grassetto, con l'icona accanto quando c'è. */
function Tap({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <strong className="font-semibold text-ink">
      {icon !== undefined && (
        <span className="mx-0.5 inline-grid h-6 min-w-6 place-items-center rounded-md border border-edge bg-surface-2 px-0.5 align-middle text-ink">
          {icon}
        </span>
      )}
      {icon !== undefined && ' '}
      {children}
    </strong>
  )
}

const STEPS: Readonly<Record<InstallPlatform, readonly ReactNode[]>> = {
  'ios-safari': [
    <>
      Usa <strong className="text-ink">Safari</strong>, il browser con la bussola blu. Se hai
      aperto il link da WhatsApp, Instagram o Facebook, tocca il menu di quella finestra e scegli{' '}
      <Tap>Apri in Safari</Tap>. Non usare la navigazione privata.
    </>,
    <>
      Tocca <Tap icon={<ShareGlyph />}>Condividi</Tap>, il quadrato con la freccia verso l&apos;alto.
      Dove si trova:
      <span className="mt-1 block">
        · <strong className="text-ink">iOS 26</strong>: tocca prima{' '}
        <Tap icon={<DotsGlyph />}>altro</Tap> in basso a destra, poi <Tap>Condividi</Tap>;
      </span>
      <span className="block">
        · <strong className="text-ink">iOS 18 e precedenti</strong>: al centro della barra in basso;
      </span>
      <span className="block">
        · <strong className="text-ink">iPad</strong>: in alto a destra, accanto all&apos;indirizzo.
      </span>
      <span className="mt-1 block">
        Non vedi nessuna barra? Scorri la pagina un po&apos; verso il basso oppure tocca il fondo
        dello schermo, e riappare.
      </span>
    </>,
    <>
      Nel pannello che si apre, scorri verso il basso e tocca{' '}
      <Tap icon={<AddToHomeGlyph />}>Aggiungi alla schermata Home</Tap>. Se la voce non c&apos;è,
      tocca <Tap>Modifica azioni…</Tap> in fondo all&apos;elenco e aggiungila con il{' '}
      <strong className="text-ink">+</strong> verde.
    </>,
    <>
      Si apre una schermata con l&apos;icona e il nome <strong className="text-ink">FungiCast</strong>.
      Se c&apos;è l&apos;interruttore <Tap>Apri come app web</Tap>, lascialo{' '}
      <strong className="text-ink">acceso</strong> (verde). Poi tocca <Tap>Aggiungi</Tap> in alto a
      destra.
    </>,
    <>
      Chiudi Safari e cerca l&apos;icona di <strong className="text-ink">FungiCast</strong> nella
      schermata Home: di solito finisce nell&apos;ultima pagina, e puoi spostarla tenendola premuta.
      Da adesso apri l&apos;app sempre da lì, non da Safari.
    </>,
    <>
      La prima volta aprila con la rete, così scarica i dati per quando sarai in bosco. Quando chiede
      la posizione, scegli <Tap>Consenti mentre usi l&apos;app</Tap>. Te la chiede di nuovo anche se
      l&apos;avevi già data a Safari: per iPhone l&apos;app installata è un&apos;app a sé.
    </>,
  ],
  'ios-chrome': [
    <>
      Chrome su iPhone lo permette solo con <strong className="text-ink">iOS 16.4 o più recente</strong>.
      Se qualcosa non torna, usa Safari: funziona sempre.
    </>,
    <>
      Tocca <Tap icon={<ShareGlyph />}>Condividi</Tap>. Di solito è in alto a destra, accanto
      all&apos;indirizzo; su alcune versioni sta nel menu <Tap icon={<DotsGlyph />}>altro</Tap> in
      basso a destra.
    </>,
    <>
      Scorri e tocca <Tap icon={<AddToHomeGlyph />}>Aggiungi alla schermata Home</Tap>. Se non la
      trovi, tocca <Tap>Modifica azioni…</Tap> in fondo e aggiungila.
    </>,
    <>
      Lascia acceso <Tap>Apri come app web</Tap>, se c&apos;è, e tocca <Tap>Aggiungi</Tap> in alto a
      destra.
    </>,
    <>
      Apri FungiCast dall&apos;icona nella schermata Home. La prima volta aprila con la rete, e
      quando chiede la posizione scegli <Tap>Consenti mentre usi l&apos;app</Tap>.
    </>,
  ],
  'ios-other': [
    <>
      Cerca <Tap icon={<ShareGlyph />}>Condividi</Tap> nel menu del browser e poi{' '}
      <Tap icon={<AddToHomeGlyph />}>Aggiungi alla schermata Home</Tap>.
    </>,
    <>
      Se non la trovi, apri la pagina in <strong className="text-ink">Safari</strong>: è il browser
      con cui funziona sempre. Poi segui i passi di Safari.
    </>,
  ],
  'android-chrome': [
    <>
      Tocca il menu <Tap icon={<KebabGlyph />}>altro</Tap>: i tre puntini in alto a destra.
    </>,
    <>
      Tocca <Tap icon={<AddToHomeGlyph />}>Installa app</Tap> (su alcuni telefoni si chiama{' '}
      <Tap>Aggiungi a schermata Home</Tap>).
    </>,
    <>
      Conferma con <Tap>Installa</Tap>. Se ti chiede di scegliere fra <em>Installa</em> e{' '}
      <em>Crea scorciatoia</em>, scegli <Tap>Installa</Tap>.
    </>,
    <>
      L&apos;icona di <strong className="text-ink">FungiCast</strong> compare nella schermata Home e
      fra le app: da adesso aprila da lì.
    </>,
  ],
  'android-samsung': [
    <>
      Se nella barra dell&apos;indirizzo c&apos;è l&apos;icona con la freccia verso il basso, toccala
      e scegli <Tap>Installa</Tap>. Altrimenti:
    </>,
    <>
      Tocca il menu <Tap icon={<BurgerGlyph />}>menu</Tap>: le tre righe in basso a destra.
    </>,
    <>
      Tocca <Tap icon={<AddToHomeGlyph />}>Aggiungi pagina a</Tap>, poi{' '}
      <Tap>Schermata Home</Tap>, e conferma con <Tap>Aggiungi</Tap>.
    </>,
  ],
  'android-firefox': [
    <>
      Tocca il menu <Tap icon={<KebabGlyph />}>altro</Tap>: i tre puntini, in alto o in basso a
      destra.
    </>,
    <>
      Tocca <Tap icon={<AddToHomeGlyph />}>Installa</Tap> oppure{' '}
      <Tap>Aggiungi alla schermata principale</Tap>.
    </>,
    <>
      Conferma con <Tap>Aggiungi</Tap>.
    </>,
  ],
  'android-other': [
    <>
      Apri il menu del browser (<Tap icon={<KebabGlyph />}>altro</Tap> o{' '}
      <Tap icon={<BurgerGlyph />}>menu</Tap>) e cerca <Tap>Installa app</Tap>,{' '}
      <Tap>Aggiungi a schermata Home</Tap> o <Tap>Aggiungi al telefono</Tap>.
    </>,
    <>
      Se non c&apos;è, apri questa pagina in <strong className="text-ink">Chrome</strong>: lì la
      voce c&apos;è sempre.
    </>,
  ],
  desktop: [
    <>
      L&apos;app è pensata per il telefono: apri{' '}
      <strong className="text-ink">funghihunters.vercel.app</strong> dal browser del telefono e
      segui i passi per iPhone o Android.
    </>,
  ],
}

export function InstallSteps({ platform, compact = false }: { platform: InstallPlatform; compact?: boolean }) {
  return (
    <ol className={`space-y-2.5 ${compact ? 'text-sm' : 'text-[15px]'} leading-relaxed text-ink-dim`}>
      {STEPS[platform].map((step, i) => (
        <li key={i} className="flex gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-bold text-ink"
          >
            {i + 1}
          </span>
          <span className="min-w-0">{step}</span>
        </li>
      ))}
    </ol>
  )
}

/** Il consiglio che vale ovunque: da un'altra app non si installa niente. */
export function InAppNotice({ ios }: { ios: boolean }) {
  return (
    <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm leading-snug text-ink">
      <strong className="font-semibold">Hai aperto il link da un&apos;altra app</strong> (WhatsApp,
      Facebook, Instagram…)? Da lì non si può installare. Tocca il menu di quella finestra e scegli{' '}
      <strong className="font-semibold">{ios ? 'Apri in Safari' : 'Apri nel browser'}</strong>, poi
      segui i passi.
    </p>
  )
}

/**
 * I problemi che capitano davvero su iPhone, con la soluzione. Un `<details>` per ognuno: si
 * legge anche senza JavaScript, e chi non ha problemi non deve scorrere un muro di testo.
 */
export function IosHelp({ open = false }: { open?: boolean }) {
  const items: ReadonlyArray<{ q: string; a: ReactNode }> = [
    {
      q: 'Si apre in Safari, con la barra dell’indirizzo',
      a: (
        <>
          Era spento <strong className="text-ink">Apri come app web</strong>, oppure l&apos;hai
          aperta da un link e non dall&apos;icona. Tieni premuta l&apos;icona, scegli{' '}
          <strong className="text-ink">Rimuovi</strong> e rifai i passi con l&apos;interruttore
          acceso.
        </>
      ),
    },
    {
      q: 'Non trovo «Condividi» o «Aggiungi alla schermata Home»',
      a: (
        <>
          Quasi sempre il link è stato aperto dentro un&apos;altra app (WhatsApp, Instagram, Facebook,
          Telegram, Gmail): lì la voce non c&apos;è. Apri la pagina in Safari. Se sei già in Safari,
          controlla di non essere in navigazione privata (la barra è scura) e cerca la voce con{' '}
          <strong className="text-ink">Modifica azioni…</strong> in fondo al pannello.
        </>
      ),
    },
    {
      q: 'L’icona è una foto della pagina, non il porcino',
      a: (
        <>
          L&apos;hai aggiunta mentre la rete andava a tratti. Rimuovila e rifalla con la rete
          buona.
        </>
      ),
    },
    {
      q: 'I punti salvati in Safari non ci sono nell’app',
      a: (
        <>
          Su iPhone l&apos;app installata ha una memoria sua, separata da quella di Safari. I punti
          fissi salvati in Safari restano lì, e non si perdono. Le uscite del diario tornano se fai
          l&apos;accesso anche dall&apos;app. Conviene installarla subito, prima di andare in bosco,
          e poi usare sempre l&apos;icona.
        </>
      ),
    },
    {
      q: 'Non trova la mia posizione',
      a: (
        <>
          Apri <strong className="text-ink">Impostazioni → Privacy e sicurezza → Localizzazione</strong>:
          deve essere attiva, e anche la voce di Safari o «Siti web di Safari» deve essere su{' '}
          <strong className="text-ink">Mentre usi l&apos;app</strong>. Poi riapri FungiCast
          dall&apos;icona.
        </>
      ),
    },
    {
      q: 'Si aggiorna? Devo rifarla ogni tanto?',
      a: (
        <>
          No. Ogni volta che la apri con la rete prende il calcolo del giorno e l&apos;ultima
          versione. Non c&apos;è niente da aggiornare dall&apos;App Store.
        </>
      ),
    },
  ]
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        iPhone: se qualcosa non va
      </p>
      {items.map((item, i) => (
        <details key={item.q} open={open && i === 0} className="group rounded-lg border border-edge bg-surface-1">
          <summary
            className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3
                       py-2 text-sm font-medium text-ink focus:outline-none focus-visible:ring-2
                       focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
          >
            {item.q}
            <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-ink-faint transition-transform group-open:rotate-90">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <p className="border-t border-edge px-3 py-2 text-sm leading-relaxed text-ink-dim">{item.a}</p>
        </details>
      ))}
    </div>
  )
}

/**
 * Tre schermate di iPhone disegnate a grandi linee, con il punto da toccare evidenziato.
 *
 * Disegni e non foto: una foto dello schermo invecchia al primo aggiornamento di iOS e pesa
 * centinaia di kB; questi sono pochi `div`, restano leggibili nel tema chiaro e in quello scuro, e
 * mostrano solo quello che serve riconoscere.
 */
export function IosMockups() {
  const ring = 'ring-2 ring-accent ring-offset-1 ring-offset-surface-2'
  return (
    <div className="grid grid-cols-3 gap-2" aria-hidden="true">
      <Phone caption="1 · Condividi">
        <div className="flex-1 space-y-1 p-1.5">
          <div className="h-1.5 w-3/4 rounded bg-edge" />
          <div className="h-1.5 w-1/2 rounded bg-edge" />
          <div className="h-8 rounded bg-accent/15" />
          <div className="h-1.5 w-2/3 rounded bg-edge" />
        </div>
        <div className="flex items-center justify-between gap-1 border-t border-edge bg-surface-1 px-1 py-1.5 text-ink-dim">
          <span className="text-[10px]">‹</span>
          <span className="h-3 flex-1 rounded-full bg-surface-3" />
          <span className={`grid h-4 w-4 place-items-center rounded text-ink ${ring}`}>
            <ShareGlyph />
          </span>
          <span className="grid h-4 w-4 place-items-center rounded text-ink-dim">
            <DotsGlyph />
          </span>
        </div>
      </Phone>
      <Phone caption="2 · Aggiungi alla Home">
        <div className="flex-1 bg-black/20" />
        <div className="space-y-0.5 rounded-t-lg border-t border-edge bg-surface-1 p-1 text-[7px] leading-tight text-ink-dim">
          <div className="rounded bg-surface-3 px-1 py-0.5">Copia</div>
          <div className="rounded bg-surface-3 px-1 py-0.5">Aggiungi ai Preferiti</div>
          <div className={`flex items-center justify-between rounded bg-surface-3 px-1 py-0.5 font-semibold text-ink ${ring}`}>
            Aggiungi alla schermata Home
            <span className="scale-75"><AddToHomeGlyph /></span>
          </div>
          <div className="px-1 py-0.5 text-accent">Modifica azioni…</div>
        </div>
      </Phone>
      <Phone caption="3 · Aggiungi">
        <div className="flex items-center justify-between border-b border-edge bg-surface-1 px-1.5 py-1 text-[7px]">
          <span className="text-ink-dim">Annulla</span>
          <span className={`rounded px-1 font-semibold text-accent ${ring}`}>Aggiungi</span>
        </div>
        <div className="flex items-center gap-1 p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={16} height={16} className="h-4 w-4 rounded" />
          <span className="text-[8px] font-semibold text-ink">FungiCast</span>
        </div>
        <div className="mx-1.5 flex items-center justify-between rounded bg-surface-1 px-1 py-1 text-[7px] text-ink">
          Apri come app web
          <span className="relative h-2.5 w-4 rounded-full bg-accent">
            <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-white" />
          </span>
        </div>
        <div className="flex-1" />
      </Phone>
    </div>
  )
}

function Phone({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="min-w-0">
      <div className="flex aspect-[9/14] flex-col overflow-hidden rounded-xl border-2 border-edge-strong bg-surface-2">
        {children}
      </div>
      <figcaption className="mt-1 text-center text-[11px] leading-tight text-ink-dim">{caption}</figcaption>
    </figure>
  )
}
