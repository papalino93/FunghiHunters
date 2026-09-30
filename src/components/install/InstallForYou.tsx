'use client'

import { useState } from 'react'

import { InAppNotice, InstallSteps, IosHelp, IosMockups } from '@/components/install/InstallSteps'
import { promptInstall, useInstallState } from '@/lib/pwa/install-store'
import { isIosPlatform, PLATFORM_LABEL } from '@/lib/pwa/platform'

/**
 * Le istruzioni giuste per il telefono che si ha in mano, con il pulsante vero quando il browser
 * lo permette.
 *
 * Nella pagina `/installa` sta sopra l'elenco di tutti i telefoni (che resta, e si legge anche
 * senza JavaScript); nella finestra dell'invito è tutto il contenuto.
 */
export function InstallForYou({ compact = false, onInstalled }: { compact?: boolean; onInstalled?: () => void }) {
  const state = useInstallState()
  const [outcome, setOutcome] = useState<'accepted' | 'dismissed' | null>(null)

  if (!state.ready) return null

  if (state.installed || outcome === 'accepted') {
    return (
      <p className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-3 text-sm leading-snug text-ink">
        <strong className="font-semibold">Fatto: FungiCast è installata.</strong>{' '}
        {state.installed
          ? 'La stai già usando come app, dall’icona nella schermata Home.'
          : 'Trovi l’icona nella schermata Home o fra le app: da adesso aprila da lì.'}
      </p>
    )
  }

  const ios = isIosPlatform(state.platform)
  const install = async (): Promise<void> => {
    const result = await promptInstall()
    if (result === 'accepted') {
      setOutcome('accepted')
      onInstalled?.()
    } else if (result === 'dismissed') {
      setOutcome('dismissed')
    }
  }

  return (
    <div className="space-y-3">
      {state.inApp && <InAppNotice ios={ios} />}

      {state.canPrompt && (
        <button
          type="button"
          onClick={() => void install()}
          className="min-h-14 w-full rounded-xl bg-accent px-4 text-base font-semibold text-surface-0
                     shadow-sm transition-opacity hover:opacity-90 focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                     focus-visible:ring-offset-surface-0"
        >
          Installa FungiCast
        </button>
      )}
      {outcome === 'dismissed' && (
        <p className="text-sm leading-snug text-ink-dim">
          Nessun problema. Quando vuoi, puoi farlo anche a mano con i passi qui sotto.
        </p>
      )}

      <div className={state.canPrompt ? 'rounded-xl border border-edge bg-surface-1 p-3' : ''}>
        <p className={`mb-2 font-semibold text-ink ${compact ? 'text-sm' : 'text-base'}`}>
          {state.canPrompt ? 'Oppure, a mano' : 'Sul tuo telefono'}
          <span className="font-normal text-ink-faint"> · {PLATFORM_LABEL[state.platform]}</span>
        </p>
        {state.platform === 'ios-safari' && (
          <div className="mb-3">
            <IosMockups />
          </div>
        )}
        <InstallSteps platform={state.platform} compact={compact} />
      </div>

      {/* Su iPhone non c'è un pulsante che faccia tutto: le difficoltà vere vanno dette qui. */}
      {ios && <IosHelp />}
    </div>
  )
}
