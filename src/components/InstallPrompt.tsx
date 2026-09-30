'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo, useState } from 'react'

import { InAppNotice, InstallSteps } from '@/components/install/InstallSteps'
import { promptInstall, useInstallState } from '@/lib/pwa/install-store'
import { isIosPlatform, isMobilePlatform } from '@/lib/pwa/platform'

const DISMISS_KEY = 'fungicast:install-dismissed'
/**
 * Dopo la ×, l'invito torna fra una settimana e non mai più. Chiuderlo significa quasi sempre "non
 * adesso": chi apre l'app dal telefono in bosco è esattamente chi ne ha bisogno installata (si
 * apre anche senza rete), e un rifiuto di settembre non deve valere per il resto della stagione.
 * Era un mese: installarla è la cosa più utile che si possa fare con l'app, e un mese in
 * autunno è mezza stagione.
 */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

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
  const state = useInstallState()
  const pathname = usePathname()
  const [closed, setClosed] = useState(false)
  const [howTo, setHowTo] = useState(false)
  const snoozed = useMemo(() => (state.ready ? readSnoozed(nowMs()) : true), [state.ready])

  if (!state.ready || state.installed || closed || snoozed || !isMobilePlatform(state.platform)) return null
  // Sulla pagina che spiega come si fa, la barra che rimanda lì sarebbe un doppione.
  if (pathname === '/installa') return null

  const dismiss = (): void => {
    try {
      localStorage.setItem(DISMISS_KEY, String(nowMs()))
    } catch {
      // Non recuperabile: l'invito tornerà al prossimo giro.
    }
    setClosed(true)
  }

  const install = (): void => {
    if (!state.canPrompt) {
      setHowTo((v) => !v)
      return
    }
    // La scelta la fa il sistema operativo. Se accetta, `appinstalled` nasconde la barra; se
    // rifiuta, la barra resta con le istruzioni a mano, senza riproporre subito la finestra.
    void promptInstall().then((outcome) => {
      if (outcome !== 'accepted') setHowTo(true)
    })
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
          aria-expanded={state.canPrompt ? undefined : howTo}
          className="min-h-11 shrink-0 rounded-lg border border-accent bg-accent/15 px-3 text-sm
                     font-semibold text-ink transition-colors hover:bg-accent/25
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {state.canPrompt ? 'Installa' : 'Come si fa'}
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

      {howTo && (
        <div className="mx-auto mt-2 max-w-2xl space-y-2 rounded-lg bg-surface-2 px-3 py-2.5">
          {state.inApp && <InAppNotice ios={isIosPlatform(state.platform)} />}
          <InstallSteps platform={state.platform} compact />
          <Link
            href="/installa"
            className="inline-flex min-h-11 items-center text-sm text-accent underline underline-offset-2"
          >
            Guida passo passo, per tutti i telefoni
          </Link>
        </div>
      )}
    </aside>
  )
}
