'use client'

import { useState } from 'react'

import type { Suggestion } from '@/lib/recommend/rank'

/**
 * "Prima di partire".
 *
 * Informazioni che servono **prima** di mettersi in macchina, non dopo. Chiusa per default,
 * perché chi le ha già lette non deve scorrerle ogni volta, ma sempre allo stesso posto.
 *
 * Le norme hanno una data: sono state verificate il 14 settembre 2026 sulla pagina ufficiale
 * della Regione. Una regola citata senza data invecchia in silenzio, ed è peggio che non citarla.
 */

const RULES_CHECKED_ON = '14 settembre 2026'
const RULES_SOURCE = 'https://www.regione.toscana.it/-/raccolta-funghi-ecco-le-disposizioni'

export function BeforeYouGo({ topSuggestion }: { topSuggestion: Suggestion | null }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="rounded-xl border border-edge bg-surface-1">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v) }}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between px-3 text-sm font-medium
                   text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-inset
                   focus-visible:ring-accent"
      >
        Prima di partire
        <svg
          width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
          className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="space-y-3 border-t border-edge px-3 py-3 text-xs leading-relaxed text-ink-dim">
          <Block title="Autorizzazione">
            Serve il tesserino regionale se raccogli fuori dal tuo comune di residenza: 25 € annui,
            13 € per sei mesi, ridotti del 50 % in area montana. Non residenti: 15 € per un giorno,
            40 € per una settimana, 100 € per un anno.
          </Block>

          <Block title="Limiti">
            <strong className="text-ink">3 kg al giorno</strong> a persona, salvo esemplare singolo
            di peso superiore. 10 kg per i residenti in comuni montani che raccolgono nel proprio
            comune. Porcini con cappello di almeno <strong className="text-ink">4 cm</strong>.
          </Block>

          <Block title="Come">
            Contenitore rigido e areato — i sacchetti di plastica sono vietati. Vietati rastrelli e
            attrezzi che danneggiano il micelio. Si raccoglie da un&apos;ora prima dell&apos;alba a
            un&apos;ora dopo il tramonto.
          </Block>

          <Block title="Dove non si può">
            Aree protette, riserve e proprietà private possono avere regole proprie e più
            restrittive del tesserino regionale.{' '}
            {topSuggestion !== null && (
              <>
                Per <strong className="text-ink">{topSuggestion.zone.name}</strong> verifica prima
                di partire: l&apos;app non conosce i confini delle aree protette e non può dirtelo.
              </>
            )}
          </Block>

          <Block title="Meteo e allerte">
            Controlla il bollettino del Centro Funzionale regionale prima di salire in quota.
            L&apos;indice di questa app descrive le condizioni per il micelio, non la sicurezza
            dell&apos;escursione.
          </Block>

          <p className="border-t border-edge pt-2.5 text-[11px] text-ink-faint">
            Norme da L.R. Toscana 16/1999 e successive modifiche, verificate il {RULES_CHECKED_ON}{' '}
            su{' '}
            <a
              href={RULES_SOURCE}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-ink-dim"
            >
              regione.toscana.it
            </a>
            . Verifica sempre la versione vigente: questa è una comodità, non una fonte legale.
          </p>

          <p className="rounded-lg bg-surface-2 px-2.5 py-2 text-[11px] leading-snug text-warn">
            L&apos;app non riconosce le specie e non dice mai se un fungo è commestibile. Per
            quello esistono gli ispettorati micologici delle ASL, che offrono il controllo
            gratuito.
          </p>
        </div>
      )}
    </section>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {title}
      </h3>
      <p>{children}</p>
    </div>
  )
}
