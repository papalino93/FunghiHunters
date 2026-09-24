'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { useIsHydrated } from '@/lib/ui/useIsHydrated'

/**
 * Quando una pagina si rompe mentre si usa, invece della schermata d'errore generica di Next.
 *
 * Il caso concreto è la mappa offline: il suo codice si carica solo dopo la pagina (`ssr: false`),
 * e se quel pezzo non è mai stato scaricato con questa versione dell'app, senza rete l'import
 * fallisce. Prima si vedeva "Application error" in inglese, che sembra un guasto; qui si dice cosa
 * succede e cosa resta disponibile. La barra in basso resta, perché il layout sta sopra.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  // Solo dopo l'idratazione: sul server `navigator` non esiste, e il primo render deve coincidere.
  const hydrated = useIsHydrated()
  const offline = hydrated && !navigator.onLine

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-8">
      <h1 className="text-lg font-semibold text-ink">
        {offline ? 'Questa parte non è disponibile senza rete' : 'Qualcosa non si è caricato'}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        {offline
          ? 'Non è stata ancora salvata su questo telefono con la versione attuale dell’app. ' +
            'L’elenco delle zone e il diario funzionano anche offline.'
          : 'Può essere la rete che va e viene. Riprova fra un attimo; se continua, torna alla home.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { retry() }}
          className="min-h-11 rounded-lg border border-edge bg-surface-2 px-4 text-sm font-medium
                     text-ink transition-colors hover:bg-surface-3 focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-accent"
        >
          Riprova
        </button>
        <Link
          href="/"
          className="flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-accent
                     underline underline-offset-2 focus:outline-none focus-visible:ring-2
                     focus-visible:ring-accent"
        >
          Torna a Dove vado
        </Link>
        <Link
          href="/diario"
          className="flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-accent
                     underline underline-offset-2 focus:outline-none focus-visible:ring-2
                     focus-visible:ring-accent"
        >
          Apri il diario
        </Link>
      </div>
    </div>
  )
}
