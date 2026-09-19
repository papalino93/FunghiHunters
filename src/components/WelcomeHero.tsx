'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import { useAuth } from '@/lib/auth/context'
import { useIsHydrated } from '@/lib/ui/useIsHydrated'

const DISMISS_KEY = 'fungicast:welcome-dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // Storage bloccato (finestra privata, cookie disattivati): mostrare di nuovo il benvenuto ogni
    // volta è l'unico comportamento onesto quando non si può ricordare la scelta.
    return false
  }
}

/**
 * Il primo schermo, una sola volta.
 *
 * L'icona dell'app usa lo stesso porcino qui e da nessun'altra parte dentro l'interfaccia (vedi il
 * commento in `app/icon.tsx`): un simbolo pieno di colore ovunque diventerebbe decorazione, non
 * identità. Questo è lo stesso tipo di momento dell'icona — il primo contatto, non uno schermo
 * di lavoro — per questo è l'unico altro posto che se lo prende, su richiesta esplicita.
 *
 * Non è un login obbligatorio: si chiude con "continua senza account" ed è quello — non
 * l'accesso — il percorso che la maggior parte delle uscite userà, come per il resto dell'app.
 */
export function WelcomeHero() {
  const hydrated = useIsHydrated()
  const auth = useAuth()
  const [closed, setClosed] = useState(false)
  const alreadyDismissed = useMemo(() => (hydrated ? readDismissed() : true), [hydrated])

  if (!hydrated || closed || alreadyDismissed || auth.status === 'signed-in') return null

  const dismiss = (): void => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Non recuperabile: il benvenuto si ripresenterà al prossimo giro, che resta accettabile.
    }
    setClosed(true)
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center p-4 pb-8 backdrop-blur-sm sm:items-center"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--surface-0) 20%, transparent) 0%, ' +
          'color-mix(in srgb, var(--surface-0) 75%, transparent) 55%, var(--surface-0) 100%)',
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-edge bg-surface-1 shadow-2xl">
        {/* Sagome di bosco, appena accennate: un contesto, non un'illustrazione da ritagliare e appendere. */}
        <div
          className="relative flex h-36 items-center justify-center overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at 50% 28%, #1c2a1e 0%, #141d18 55%, #121724 100%)',
          }}
        >
          <svg
            className="absolute inset-x-0 bottom-0"
            width="100%"
            height="56"
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
          <svg width="88" height="88" viewBox="0 0 340 340" aria-hidden="true">
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
        </div>

        <div className="p-4">
          <h2 className="text-lg font-semibold tracking-tight text-ink">FungiCast Toscana</h2>
          <p className="mt-1.5 text-sm leading-snug text-ink-dim">
            Compatibilità delle condizioni ambientali con la possibile fruttificazione del porcino
            in Toscana, con dati reali e incertezza dichiarata.
            <strong className="font-medium text-ink"> Non indica la presenza di funghi.</strong>
          </p>

          <div className="mt-4 flex flex-col gap-2">
            <Link
              href="/account"
              onClick={dismiss}
              className="flex min-h-12 items-center justify-center rounded-xl border border-accent/40
                         bg-accent/15 text-sm font-semibold text-ink transition-colors
                         hover:bg-accent/25 focus:outline-none focus-visible:ring-2
                         focus-visible:ring-accent"
            >
              Accedi per salvare il diario
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="min-h-12 rounded-xl border border-edge bg-surface-2 text-sm font-medium
                         text-ink-dim transition-colors hover:text-ink focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-accent"
            >
              Continua senza account
            </button>
          </div>

          {/* Chi apre l'app per la prima volta è l'unico che vedrà mai questa schermata: è il
              momento in cui la guida serve davvero, e l'unico in cui è a un tocco di distanza. */}
          <p className="mt-3 text-center text-xs text-ink-faint">
            Prima volta qui?{' '}
            <Link
              href="/guida"
              onClick={dismiss}
              /* `after:` allarga l'area toccabile a ~47 px senza cambiare l'impaginazione. */
              className="relative text-accent underline underline-offset-2 hover:text-ink
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
                         after:absolute after:inset-x-0 after:-inset-y-4 after:content-['']"
            >
              Leggi come funziona
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
