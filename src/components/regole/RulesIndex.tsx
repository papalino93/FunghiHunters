import Link from 'next/link'

import { coverage, formatLongDate } from '@/lib/rules/format'
import type { PickingRules } from '@/lib/rules/types'

export function RulesIndex({ rules }: { rules: readonly PickingRules[] }) {
  const lastCheck = rules.reduce((max, r) => (r.verifiedOn > max ? r.verifiedOn : max), '')

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        Raccolta funghi: le regole regione per regione
      </h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-dim">
        Tesserino, quantità, giorni, orari e divieti, riassunti dalle leggi regionali e dalle pagine
        ufficiali{lastCheck === '' ? '' : `, verificati il ${formatLongDate(lastCheck)}`}. Dove una
        regola non è confermata da una fonte ufficiale lo diciamo, invece di indovinarla.
      </p>

      <ul className="mt-5 divide-y divide-edge rounded-xl border border-edge bg-surface-1">
        {rules.map((r) => {
          const level = coverage(r)
          return (
            <li key={r.slug}>
              <Link
                href={`/regole/${r.slug}`}
                className="flex min-h-12 items-center justify-between gap-3 px-3 py-2.5 text-sm
                           transition-colors hover:bg-surface-2 focus:outline-none
                           focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              >
                <span className="font-medium text-ink">{r.name}</span>
                <span className="shrink-0 text-xs text-ink-faint">
                  {r.dailyLimitKg === null ? '' : `${String(r.dailyLimitKg).replace('.', ',')} kg · `}
                  {level === 'completa' ? 'scheda completa' : level === 'parziale' ? 'scheda parziale' : 'da verificare'}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="mt-6 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-snug text-ink-dim">
        Un riassunto, non una consulenza legale: Comuni, Unioni montane e parchi possono avere regole
        proprie e più restrittive. Prima di partire verifica la versione vigente sul sito della
        Regione o dell&apos;ente del posto.
      </p>
    </div>
  )
}
