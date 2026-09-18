'use client'

import Link from 'next/link'

import { useAuth } from '@/lib/auth/context'
import { useIsHydrated } from '@/lib/ui/useIsHydrated'

/**
 * Striscia che compare solo dopo un accesso non riuscito.
 *
 * **Perché sta nel layout e non nella schermata Account.** Supabase rimanda l'errore all'URL di
 * ritorno *se è fra quelli autorizzati*; altrimenti lo manda al Site URL del progetto, cioè alla
 * home. Il caso in cui l'errore atterra fuori da `/account` è proprio quello di un progetto
 * configurato male — l'unico in cui una spiegazione serve davvero. Tenerla qui significa che
 * l'utente la legge ovunque sia finito.
 *
 * Non occupa spazio quando non c'è niente da dire: senza errore il componente non rende nulla.
 */
export function AuthCallbackNotice() {
  // L'esito del redirect esiste solo nel browser: renderlo prima dell'idratazione darebbe un
  // markup diverso da quello generato sul server.
  const hydrated = useIsHydrated()
  const auth = useAuth()
  const error = auth.callbackError
  if (!hydrated || error === null) return null

  return (
    <div
      role="alert"
      className="border-b border-danger/30 bg-danger/10 px-4 py-2.5 text-xs leading-snug text-ink"
    >
      <div className="mx-auto flex w-full max-w-2xl items-start gap-3">
        <div className="flex-1">
          <p className="font-medium text-danger">{error.message}</p>

          {/*
            * Il dettaglio tecnico solo quando la causa probabile è la configurazione: a chi ha
            * annullato l'accesso su Google non serve, a chi sta collegando il progetto è
            * esattamente il pezzo che gli manca per sistemarlo.
            */}
          {error.configuration && (
            <p className="mt-1 text-[11px] text-ink-dim">
              Codice <span className="font-mono">{error.code}</span>
              {error.detail !== null && <> — {error.detail}</>}
              <br />
              URL di ritorno usato: <span className="font-mono">{auth.callbackUrl}</span> — deve
              essere fra i <em>Redirect URLs</em> del progetto Supabase. Vedi{' '}
              <span className="font-mono">docs/DEPLOY-VERCEL.md</span>.
            </p>
          )}

          <Link
            href="/account"
            onClick={() => { auth.dismissCallbackError() }}
            className="mt-1.5 inline-block font-medium text-accent underline underline-offset-2"
          >
            Torna all&apos;accesso
          </Link>
        </div>

        <button
          type="button"
          onClick={() => { auth.dismissCallbackError() }}
          aria-label="Chiudi l'avviso"
          className="shrink-0 rounded px-1.5 py-0.5 text-ink-dim transition-colors hover:text-ink
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          chiudi
        </button>
      </div>
    </div>
  )
}
