'use client'

import { useState } from 'react'

export interface Filters {
  readonly maxDistanceKm: number | null
  readonly forestTypes: readonly string[]
  readonly minDataQuality: number | null
}

/**
 * Filtri, a scomparsa.
 *
 * Aperti per default occuperebbero lo schermo per una funzione che serve raramente: quasi sempre
 * la risposta giusta è la prima della lista. Chi ha bisogno di filtrare sa cercare il controllo,
 * e il numero di filtri attivi resta visibile anche da chiuso.
 */
export function FilterBar({
  filters,
  onChange,
  forestTypes,
  hasPosition,
}: {
  filters: Filters
  onChange: (next: Filters) => void
  forestTypes: readonly string[]
  hasPosition: boolean
}) {
  const [open, setOpen] = useState(false)
  const activeCount =
    (filters.maxDistanceKm === null ? 0 : 1) +
    (filters.forestTypes.length > 0 ? 1 : 0) +
    (filters.minDataQuality === null ? 0 : 1)

  const toggleForest = (type: string): void => {
    const next = filters.forestTypes.includes(type)
      ? filters.forestTypes.filter((t) => t !== type)
      : [...filters.forestTypes, type]
    onChange({ ...filters, forestTypes: next })
  }

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
        <span>
          Filtri
          {activeCount > 0 && (
            <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-[11px] text-accent">
              {activeCount}
            </span>
          )}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
          className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="space-y-4 border-t border-edge px-3 py-3">
          <fieldset>
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Distanza massima
            </legend>
            {!hasPosition && (
              <p className="mt-1 text-[11px] text-ink-faint">
                Serve la posizione: senza, non c&apos;è da dove misurare.
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[null, 30, 60, 120].map((km) => (
                <Chip
                  key={String(km)}
                  active={filters.maxDistanceKm === km}
                  disabled={!hasPosition && km !== null}
                  onClick={() => { onChange({ ...filters, maxDistanceKm: km }) }}
                >
                  {km === null ? 'qualsiasi' : `${km} km`}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Tipo di bosco
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {forestTypes.map((type) => (
                <Chip
                  key={type}
                  active={filters.forestTypes.includes(type)}
                  onClick={() => { toggleForest(type) }}
                >
                  {type}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Affidabilità minima dei dati
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[null, 50, 70].map((value) => (
                <Chip
                  key={String(value)}
                  active={filters.minDataQuality === value}
                  onClick={() => { onChange({ ...filters, minDataQuality: value }) }}
                >
                  {value === null ? 'qualsiasi' : `almeno ${value}`}
                </Chip>
              ))}
            </div>
          </fieldset>

          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => { onChange({ maxDistanceKm: null, forestTypes: [], minDataQuality: null }) }}
              className="min-h-11 w-full rounded-lg border border-edge bg-surface-2 text-sm
                         font-medium text-ink-dim transition-colors hover:text-ink
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Azzera
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled === true}
      aria-pressed={active}
      className={`min-h-11 rounded-lg border px-3 text-xs font-medium transition-colors
                  disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none
                  focus-visible:ring-2 focus-visible:ring-accent ${
                    active
                      ? 'border-accent bg-accent/15 text-ink'
                      : 'border-edge bg-surface-2 text-ink-dim hover:text-ink'
                  }`}
    >
      {children}
    </button>
  )
}
