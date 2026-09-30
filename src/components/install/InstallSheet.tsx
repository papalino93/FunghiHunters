'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { InstallForYou } from '@/components/install/InstallForYou'
import { useInstallState } from '@/lib/pwa/install-store'
import { isMobilePlatform } from '@/lib/pwa/platform'

const SNOOZE_KEY = 'fungicast:install-sheet-snoozed'
/** «Non ora»: la finestra torna fra una settimana, non alla prossima pagina. */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
/** «L'ho già installata»: chi lo dice ma apre dal browser, la rivede fra due mesi. */
const ALREADY_MS = 60 * 24 * 60 * 60 * 1000
/**
 * Quanto aspettare prima di aprirla. Non subito: chi arriva deve prima vedere a cosa serve
 * l'app, e una finestra davanti alla prima pagina è una porta, non un invito.
 */
const DELAY_MS = 12_000
/** Pagine dove non ha senso: la guida all'installazione stessa, e il pannello di amministrazione. */
const SKIP_PATHS = ['/installa', '/admin', '/auth']

function snoozedUntil(): number {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY)
    return raw === null ? 0 : Number(raw) || 0
  } catch {
    return 0
  }
}

function isSnoozed(): boolean {
  return snoozedUntil() > Date.now()
}

function snooze(ms: number): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + ms))
  } catch {
    // Storage bloccato: tornerà alla prossima visita, che è il meno peggio.
  }
}

/**
 * La finestra «Installa l'app», che si apre da sola sui telefoni.
 *
 * È il terzo invito, oltre alla barra in fondo a ogni pagina e alla pagina `/installa`: installare
 * l'app è ciò che la rende utile in bosco, dove la rete non c'è, e una riga in fondo allo schermo
 * si ignora senza nemmeno leggerla. Per non diventare insistenza: solo da telefono, mai quando è
 * già installata, dopo qualche secondo e non all'apertura, e dopo «Non ora» torna fra una
 * settimana.
 *
 * `<dialog>` nativo con `showModal()`: blocca il fuoco dentro la finestra, si chiude con Esc e con
 * il tasto indietro di Android, e lo legge bene VoiceOver, senza reinventare niente.
 */
export function InstallSheet() {
  const state = useInstallState()
  const pathname = usePathname()
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const skipped = SKIP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const eligible = useMemo(
    () => state.ready && !state.installed && isMobilePlatform(state.platform) && !isSnoozed(),
    [state.ready, state.installed, state.platform],
  )

  useEffect(() => {
    if (!eligible || skipped || open) return
    const timer = window.setTimeout(() => {
      // Ricontrollato allo scadere: nel frattempo può averla chiusa in un'altra scheda.
      if (!isSnoozed()) setOpen(true)
    }, DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [eligible, skipped, open])

  // Installata mentre la finestra era aperta (dal pulsante o dal menu del browser): si chiude.
  const visible = open && !state.installed

  useEffect(() => {
    const el = dialog.current
    if (el === null) return
    if (visible && !el.open) {
      try {
        el.showModal()
      } catch {
        el.setAttribute('open', '')
      }
      // `showModal` mette il fuoco sul primo elemento toccabile, che sta a metà delle istruzioni, e
      // ci scorre: si partirebbe dal passo 4. Il fuoco va sul titolo, e la finestra dall'inizio.
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })
      el.scrollTop = 0
    }
    if (!visible && el.open) el.close()
  }, [visible])

  const close = (ms: number): void => {
    snooze(ms)
    setOpen(false)
  }

  if (!state.ready || !isMobilePlatform(state.platform)) return null

  return (
    <dialog
      ref={dialog}
      aria-labelledby="installa-titolo"
      onCancel={(e) => {
        e.preventDefault()
        close(SNOOZE_MS)
      }}
      onClick={(e) => {
        // Un tocco sullo sfondo, fuori dal pannello, vale «Non ora».
        if (e.target === e.currentTarget) close(SNOOZE_MS)
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border
                 border-edge bg-surface-0 p-0 text-ink shadow-2xl backdrop:bg-black/60
                 sm:mx-auto sm:mb-6 sm:max-w-lg sm:rounded-2xl"
    >
      {visible && (
        <div className="px-4 pt-4">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={52} height={52} className="h-13 w-13 shrink-0 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <h2
                id="installa-titolo"
                data-autofocus=""
                tabIndex={-1}
                className="text-lg font-semibold leading-tight tracking-tight focus:outline-none"
              >
                Metti FungiCast nella schermata Home
              </h2>
              <p className="mt-1 text-sm leading-snug text-ink-dim">
                Si apre come un&apos;app, a tutto schermo, e funziona anche senza rete in bosco. Un
                minuto, niente store.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <InstallForYou compact onInstalled={() => close(ALREADY_MS)} />
          </div>

          {/* Sempre in vista: su iPhone le istruzioni sono lunghe, e chiudere non deve voler dire scorrere. */}
          <div className="sticky bottom-0 -mx-4 mt-3 border-t border-edge bg-surface-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
          <p className="text-center text-sm">
            <Link
              href="/installa"
              onClick={() => close(SNOOZE_MS)}
              className="inline-flex min-h-11 items-center text-accent underline underline-offset-2"
            >
              Guida per tutti i telefoni
            </Link>
          </p>

          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => close(SNOOZE_MS)}
              className="min-h-12 rounded-xl border border-edge bg-surface-1 text-sm font-medium
                         text-ink transition-colors hover:bg-surface-2 focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-accent"
            >
              Non ora
            </button>
            <button
              type="button"
              onClick={() => close(ALREADY_MS)}
              className="min-h-12 rounded-xl border border-edge bg-surface-1 text-sm font-medium
                         text-ink-dim transition-colors hover:bg-surface-2 focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-accent"
            >
              L&apos;ho già fatto
            </button>
          </div>
          </div>
        </div>
      )}
    </dialog>
  )
}
