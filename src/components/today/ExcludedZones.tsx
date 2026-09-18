'use client'

import { useState } from 'react'

import type { ExcludedZone } from '@/lib/recommend/rank'

/**
 * Le aree che i filtri correnti escludono, con il motivo — mai solo sparite.
 *
 * Chiusa per default e con solo il conteggio visibile: non deve competere con le aree che
 * l'utente può davvero scegliere, ma deve restare a un tocco di distanza per chi si chiede
 * "perché non vedo l'Amiata?".
 */
export function ExcludedZones({ excluded }: { excluded: readonly ExcludedZone[] }) {
  const [open, setOpen] = useState(false)
  if (excluded.length === 0) return null

  return (
    <section className="rounded-xl border border-edge bg-surface-1">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v) }}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between px-3 text-sm font-medium
                   text-ink-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-inset
                   focus-visible:ring-accent"
      >
        <span>
          {excluded.length} {excluded.length === 1 ? 'area esclusa dai filtri' : 'aree escluse dai filtri'}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
          className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <ul className="space-y-1.5 border-t border-edge px-3 py-3 text-xs leading-snug text-ink-dim">
          {excluded.map(({ zone, reason }) => (
            <li key={zone.code}>
              <span className="font-medium text-ink">{zone.name}</span>: {reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
