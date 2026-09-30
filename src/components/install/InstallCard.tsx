'use client'

import Link from 'next/link'

import { useInstallState } from '@/lib/pwa/install-store'

/**
 * La riga «Installa l'app sul telefono» che porta a `/installa`, per le schermate che si aprono
 * apposta (Account): lì l'invito non disturba, e chi ha chiuso la barra e la finestra deve poter
 * ritrovare le istruzioni senza aspettare una settimana.
 *
 * Sparisce solo quando l'app è già aperta dall'icona. Dal computer resta: la pagina spiega di
 * aprirla dal telefono.
 */
export function InstallCard({ className = '' }: { className?: string }) {
  const state = useInstallState()
  if (state.ready && state.installed) return null
  return (
    <Link
      href="/installa"
      className={`flex min-h-11 items-center gap-3 rounded-xl border border-accent/40 bg-accent/10
                  px-3 py-2.5 transition-colors hover:bg-accent/20 focus:outline-none
                  focus-visible:ring-2 focus-visible:ring-accent ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">Installa l&apos;app sul telefono</span>
        <span className="mt-0.5 block text-xs leading-snug text-ink-dim">
          iPhone e Android: si apre dall&apos;icona, anche senza rete in bosco
        </span>
      </span>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-ink-faint">
        <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}
