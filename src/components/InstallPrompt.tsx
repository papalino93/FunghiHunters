'use client'

import { useEffect, useMemo, useState } from 'react'

import { useIsHydrated } from '@/lib/ui/useIsHydrated'

const DISMISS_KEY = 'fungicast:install-dismissed'

/**
 * L'evento che Chrome (Android e desktop) manda quando l'app e' installabile.
 * Non e' negli standard DOM di TypeScript perche' non e' uno standard: e' un'estensione di
 * Chromium, ed e' il motivo per cui su iPhone questo blocco non arriva mai e serve la via manuale.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // Storage bloccato: mostrare di nuovo l'invito e' meglio che sopprimerlo per sempre.
    return false
  }
}

/** Gia' installata: l'app parte in `standalone`, senza la barra del browser. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // Safari su iOS non implementa `display-mode: standalone`: usa una proprieta' sua.
  return (window.navigator as { standalone?: boolean }).standalone === true
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return true
  // iPadOS 13+ si presenta come Mac: lo si riconosce dal touch.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
}

/**
 * Installare FungiCast come app, su Android e su iPhone.
 *
 * Il sito e' gia' una PWA (manifest e service worker ci sono da sempre), ma non lo diceva a
 * nessuno: l'installazione era una funzione nascosta nel menu del browser, che quasi nessuno
 * apre. Questo riquadro la rende visibile.
 *
 * Le due piattaforme non si possono trattare allo stesso modo, e fingere di si' sarebbe peggio
 * che dividerle. Chrome su Android espone `beforeinstallprompt`, quindi li' c'e' un pulsante vero
 * che apre la finestra di sistema. Safari su iPhone non espone nulla: l'unica via e' Condividi →
 * "Aggiungi a Home", e l'unica cosa onesta e' spiegarla a parole invece di mostrare un pulsante
 * che non potrebbe funzionare.
 */
export function InstallPrompt() {
  const hydrated = useIsHydrated()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [closed, setClosed] = useState(false)
  const alreadyDismissed = useMemo(() => (hydrated ? readDismissed() : true), [hydrated])
  const installed = useMemo(() => (hydrated ? isStandalone() : true), [hydrated])
  const ios = useMemo(() => (hydrated ? isIos() : false), [hydrated])

  useEffect(() => {
    const onPrompt = (event: Event): void => {
      // Senza `preventDefault` Chrome mostra la sua barra, e l'invito verrebbe detto due volte.
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = (): void => { setDeferred(null); setClosed(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!hydrated || installed || closed || alreadyDismissed) return null
  // Niente pulsante nativo e niente iPhone: e' un browser da cui non si installa (o non ancora).
  // Meglio tacere che dare istruzioni che non corrispondono a quello che l'utente vede.
  if (deferred === null && !ios) return null

  const dismiss = (): void => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Non recuperabile: l'invito tornera' al prossimo giro.
    }
    setClosed(true)
  }

  const install = (): void => {
    if (deferred === null) return
    void deferred.prompt()
    // La scelta dell'utente la fa il sistema operativo: qui si chiude comunque, perche' se accetta
    // l'app si installa e se rifiuta ripresentare la stessa richiesta sarebbe insistere.
    setDeferred(null)
    dismiss()
  }

  return (
    <section className="mb-3 rounded-xl border border-edge bg-surface-1 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Installa FungiCast sul telefono</h2>
          <p className="mt-0.5 text-xs text-ink-dim">
            Si apre a schermo intero come un&apos;app, senza barra del browser. Non occupa spazio
            come un&apos;app scaricata dallo store: resta il sito, con un&apos;icona sulla Home.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Nascondi l'invito a installare"
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-2 text-ink-faint transition-colors
                     hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M3 3l8 8M11 3l-8 8"
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {deferred !== null ? (
        <button
          type="button"
          onClick={install}
          className="mt-3 min-h-11 w-full rounded-lg border border-accent bg-accent/15 px-3
                     text-sm font-medium text-ink transition-colors hover:bg-accent/25
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Installa l&apos;app
        </button>
      ) : (
        <p className="mt-3 rounded-lg border border-edge bg-surface-2 px-3 py-2 text-xs text-ink-dim">
          Su iPhone e iPad si fa dal browser: tocca <strong className="text-ink">Condividi</strong>{' '}
          in basso (il quadrato con la freccia verso l&apos;alto), poi{' '}
          <strong className="text-ink">Aggiungi a Home</strong>. Funziona solo da Safari.
        </p>
      )}
    </section>
  )
}
