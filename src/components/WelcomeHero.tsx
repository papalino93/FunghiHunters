'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import { useAuth } from '@/lib/auth/context'
import { useIsHydrated } from '@/lib/ui/useIsHydrated'
import { WELCOME_DISMISS_KEY as DISMISS_KEY } from '@/lib/ui/welcome'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // Storage bloccato (finestra privata, cookie disattivati): mostrare di nuovo il benvenuto ogni
    // volta è l'unico comportamento onesto quando non si può ricordare la scelta.
    return false
  }
}

export interface WelcomeHeroProps {
  /** Quante aree copre lo snapshot: scritto qui sarebbe una promessa da aggiornare a mano. */
  readonly zoneCount: number
}

/**
 * Il primo schermo — dentro la pagina, non davanti.
 *
 * Prima era una finestra al centro, sopra il contenuto sfocato, con due pulsanti: "accedi" o
 * "continua senza account". Chiedeva una decisione prima di aver dato niente, e le conseguenze
 * di quella decisione erano illeggibili — salvare *quale* diario? senza account per fare *cosa*?
 * Apriva per giunta con una definizione tecnica e con quello che l'app **non** fa: la frase più
 * importante del progetto, ma non la prima cosa da dire a uno sconosciuto.
 *
 * Ora è la prima scheda della pagina. Chi arriva vede subito sotto, senza toccare niente, le aree
 * di oggi con il loro punteggio: la spiegazione e la cosa spiegata stanno nello stesso schermo,
 * e la frase su cosa l'app non fa arriva dopo aver detto cosa fa. Il porcino a colori resta,
 * perché resta il primo contatto — l'unico posto, con l'icona, che se lo prende (vedi il commento
 * in `app/icon.tsx`). Un solo pulsante, e non è un bivio: chiude.
 *
 * L'accesso non sparisce, si sposta dove si guadagna: una riga sotto, e la schermata Account.
 *
 * **Reso già dal server**, non solo dopo l'idratazione: prima compariva un attimo dopo il primo
 * disegno e spingeva giù l'elenco (il grosso del CLS della home). Chi non deve vederlo lo ha già
 * nascosto via CSS lo script del layout, prima che la pagina si disegni — vedi `lib/ui/welcome.ts`.
 * Qui sotto la decisione resta la stessa di sempre; cambia solo che, finché il browser non l'ha
 * presa, il default è "c'è" invece di "non c'è".
 */
export function WelcomeHero({ zoneCount }: WelcomeHeroProps) {
  const hydrated = useIsHydrated()
  const auth = useAuth()
  const [closed, setClosed] = useState(false)
  // Sul server e durante l'idratazione `false`, come l'HTML appena mandato: niente differenze.
  const alreadyDismissed = useMemo(() => (hydrated ? readDismissed() : false), [hydrated])

  if (closed || alreadyDismissed || auth.status === 'signed-in') return null

  const dismiss = (): void => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Non recuperabile: il benvenuto si ripresenterà al prossimo giro, che resta accettabile.
    }
    setClosed(true)
  }

  return (
    <section
      data-welcome-hero=""
      aria-labelledby="benvenuto-titolo"
      className="mb-4 overflow-hidden rounded-2xl border border-edge bg-surface-1"
    >
      {/* Sagome di bosco, appena accennate: un contesto, non un'illustrazione da appendere. */}
      <div
        className="relative flex h-24 items-center justify-center overflow-hidden"
        style={{
          background: 'radial-gradient(circle at 50% 30%, #1c2a1e 0%, #141d18 55%, #121724 100%)',
        }}
      >
        <svg
          className="absolute inset-x-0 bottom-0"
          width="100%"
          height="44"
          viewBox="0 0 400 56"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 56 0 34 22 10 40 34 55 4 72 34 90 14 108 34 128 8 148 34 168 16 190 34 210 6 232 34 252 18 272 34 292 10 312 34 332 20 352 34 372 12 400 34 400 56Z"
            fill="#0f1712"
            opacity="0.7"
          />
        </svg>
        <svg width="64" height="64" viewBox="0 0 340 340" aria-hidden="true">
          <path d="M144 190h52l10 108a26 26 0 0 1-26 28h-20a26 26 0 0 1-26-28z" fill="#efe3c8" />
          <path
            d="M170 42c-84 0-134 56-134 104 0 20 16 34 36 34h196c20 0 36-14 36-34 0-48-50-104-134-104z"
            fill="#b5793a"
          />
          <path
            d="M170 42c-84 0-134 56-134 104 0 10 4 18 10 24 18-58 68-98 124-98s106 40 124 98c6-6 10-14 10-24 0-48-50-104-134-104z"
            fill="#c98f4c"
          />
          <rect x="60" y="176" width="220" height="10" rx="5" fill="#0b0e16" opacity="0.25" />
        </svg>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Chiudi il benvenuto"
          className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-full
                     text-white/70 transition-colors hover:bg-white/10 hover:text-white
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="p-4">
        <h2 id="benvenuto-titolo" className="text-lg font-semibold tracking-tight text-ink">
          Dove conviene cercare il porcino, oggi
        </h2>
        {/*
          * Corto apposta: se il benvenuto spinge sotto la piega la risposta di oggi, torna a
          * essere una porta — che è il difetto da cui questa scheda nasce.
          */}
        <p className="mt-1.5 text-sm leading-snug text-ink-dim">
          Qui sotto {zoneCount === 1 ? "l'unica area coperta" : `le ${zoneCount} aree`} in fila,
          ognuna con un punteggio da 0 a 100: quanto pioggia, temperature e stagione di quel bosco
          somigliano — oggi — alle condizioni in cui nasce il porcino.
        </p>
        <p className="mt-2 text-sm leading-snug text-ink-dim">
          <strong className="font-medium text-ink">Non dice dove ci sono i funghi</strong>: non può
          saperlo nessuno. Dice dove vale la pena provare, e quanto è sicuro di quel che dice.
        </p>

        <button
          type="button"
          onClick={dismiss}
          className="mt-4 min-h-12 w-full rounded-xl border border-accent/40 bg-accent/15 text-sm
                     font-semibold text-ink transition-colors hover:bg-accent/25
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Ho capito, mostrami le aree
        </button>

        {/*
          * Guida e accesso come righe, non come pulsanti: sono due strade laterali, e dargli lo
          * stesso peso del "vai avanti" ricreerebbe il bivio che questa scheda serve a togliere.
          */}
        <p className="mt-3 text-center text-xs leading-relaxed text-ink-faint">
          <Link
            href="/guida"
            onClick={dismiss}
            /* `after:` allarga l'area toccabile a ~47 px senza cambiare l'impaginazione. */
            className="relative text-accent underline underline-offset-2 hover:text-ink
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
                       after:absolute after:inset-x-0 after:-inset-y-4 after:content-['']"
          >
            Come funziona il punteggio
          </Link>
          <span className="mx-1.5 text-edge-strong" aria-hidden="true">·</span>
          <Link
            href="/account"
            onClick={dismiss}
            className="relative text-accent underline underline-offset-2 hover:text-ink
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
                       after:absolute after:inset-x-0 after:-inset-y-4 after:content-['']"
          >
            Accedi
          </Link>{' '}
          per ritrovare il diario su un altro dispositivo
        </p>
      </div>
    </section>
  )
}
