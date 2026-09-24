'use client'

import { useEffect, useMemo, useState } from 'react'

import { useIsHydrated } from '@/lib/ui/useIsHydrated'

const DISMISS_KEY = 'fungicast:install-dismissed'
/**
 * Dopo la ×, l'invito torna fra un mese e non mai più. Chiuderlo significa quasi sempre "non
 * adesso": chi apre l'app dal telefono in bosco è esattamente chi ne ha bisogno installata (si
 * apre anche senza rete), e un rifiuto di settembre non deve valere per la stagione dopo. Un mese
 * resta abbastanza raro da non diventare insistenza.
 */
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * L'evento che Chrome (Android e desktop) manda quando l'app è installabile.
 * Non è negli standard DOM di TypeScript perché non è uno standard: è un'estensione di
 * Chromium, ed è il motivo per cui su iPhone non arriva mai e serve la via manuale.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Platform = 'ios-safari' | 'ios-other' | 'android' | null

function readSnoozed(now: number): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (raw === null) return false
    // Il vecchio valore "1" (chiuso per sempre, fino al 24/09/2026) conta come chiuso adesso.
    const at = raw === '1' ? now : Number(raw)
    return Number.isFinite(at) && now - at < SNOOZE_MS
  } catch {
    // Storage bloccato: mostrare di nuovo l'invito è meglio che sopprimerlo per sempre.
    return false
  }
}

/** Già installata: l'app parte in `standalone`, senza la barra del browser. */
function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // Safari su iOS non implementa `display-mode: standalone`: usa una proprietà sua.
  return (window.navigator as { standalone?: boolean }).standalone === true
}

/** Solo telefoni e tablet: da un computer "installare l'app" non è ciò che serve in bosco. */
function platformOf(): Platform {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (ios) {
    // Chrome, Firefox ed Edge su iPhone hanno una propria sigla; senza, è Safari.
    return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari'
  }
  if (/Android/.test(ua)) return 'android'
  return null
}

function nowMs(): number {
  return Date.now()
}

/**
 * Installare FungiCast come app, su Android e su iPhone.
 *
 * In fondo a ogni pagina, sopra la barra di navigazione, e solo da telefono o tablet: prima
 * stava solo nella home e, su Android, compariva solo se Chrome aveva già deciso di proporre
 * l'installazione — cioè quasi mai alla prima visita, che è quella in cui conta.
 *
 * Le piattaforme non si trattano allo stesso modo, e fingere di sì sarebbe peggio che dividerle.
 * Dove il browser espone `beforeinstallprompt` c'è un pulsante vero che apre la finestra di
 * sistema. Altrove (Safari su iPhone, Firefox o Samsung Internet su Android, o Chrome prima che
 * si decida) l'unica cosa onesta è dire a parole dove toccare, per il browser che si ha davanti.
 */
export function InstallPrompt() {
  const hydrated = useIsHydrated()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [closed, setClosed] = useState(false)
  const [howTo, setHowTo] = useState(false)
  const snoozed = useMemo(() => (hydrated ? readSnoozed(nowMs()) : true), [hydrated])
  const installed = useMemo(() => (hydrated ? isStandalone() : true), [hydrated])
  const platform = useMemo(() => (hydrated ? platformOf() : null), [hydrated])

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

  if (!hydrated || installed || closed || snoozed || platform === null) return null

  const dismiss = (): void => {
    try {
      localStorage.setItem(DISMISS_KEY, String(nowMs()))
    } catch {
      // Non recuperabile: l'invito tornerà al prossimo giro.
    }
    setClosed(true)
  }

  const install = (): void => {
    if (deferred === null) {
      setHowTo((v) => !v)
      return
    }
    void deferred.prompt()
    // La scelta la fa il sistema operativo: qui si chiude comunque, perché se accetta l'app si
    // installa e se rifiuta ripresentare subito la stessa richiesta sarebbe insistere.
    setDeferred(null)
    dismiss()
  }

  return (
    <aside
      aria-label="Installa l'app"
      className="shrink-0 border-t border-edge bg-surface-1 px-3 py-2"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-2">
        {/* Un SVG statico da 32 px: `next/image` non ha niente da ottimizzare. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-lg" />
        <p className="min-w-0 flex-1 text-sm leading-snug text-ink">
          <strong className="font-semibold">Installa l&apos;app</strong>
          <span className="text-ink-dim">: si apre come le altre, anche senza rete in bosco.</span>
        </p>
        <button
          type="button"
          onClick={install}
          aria-expanded={deferred === null ? howTo : undefined}
          className="min-h-11 shrink-0 rounded-lg border border-accent bg-accent/15 px-3 text-sm
                     font-semibold text-ink transition-colors hover:bg-accent/25
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {deferred !== null ? 'Installa' : 'Come si fa'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Non ora"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-faint
                     transition-colors hover:text-ink focus:outline-none focus-visible:ring-2
                     focus-visible:ring-accent"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {deferred === null && howTo && (
        <p className="mx-auto mt-2 max-w-2xl rounded-lg bg-surface-2 px-3 py-2 text-sm leading-snug text-ink-dim">
          {platform === 'ios-safari' && (
            <>
              Tocca <strong className="text-ink">Condividi</strong> (il quadrato con la freccia verso
              l&apos;alto, in basso), poi <strong className="text-ink">Aggiungi alla schermata Home</strong>.
            </>
          )}
          {platform === 'ios-other' && (
            <>
              Tocca <strong className="text-ink">Condividi</strong> (in alto a destra, accanto
              all&apos;indirizzo), poi <strong className="text-ink">Aggiungi alla schermata Home</strong>.
              Se non la trovi, apri questa pagina in Safari.
            </>
          )}
          {platform === 'android' && (
            <>
              Tocca il menu del browser (<strong className="text-ink">⋮</strong> in alto a destra, o
              <strong className="text-ink"> ≡</strong> in basso), poi{' '}
              <strong className="text-ink">Installa app</strong> o{' '}
              <strong className="text-ink">Aggiungi a schermata Home</strong>.
            </>
          )}
        </p>
      )}
    </aside>
  )
}
