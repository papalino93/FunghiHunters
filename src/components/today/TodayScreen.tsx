'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import type { Snapshot } from '@/lib/snapshot/types'
import {
  availableForestTypes,
  rankZones,
  type Suggestion,
  type UserPosition,
} from '@/lib/recommend/rank'
import { buildVerdict } from '@/lib/recommend/verdict'
import { VerdictCard } from '@/components/today/VerdictCard'
import { SuggestionCard } from '@/components/today/SuggestionCard'
import { LocationPrompt } from '@/components/today/LocationPrompt'
import { FilterBar, type Filters } from '@/components/today/FilterBar'
import { BeforeYouGo } from '@/components/today/BeforeYouGo'
import { SourceHealth } from '@/components/today/SourceHealth'
import { formatDate } from '@/lib/ui/scale'
import { useIsHydrated } from '@/lib/ui/useIsHydrated'

const POSITION_KEY = 'fungicast.position'

function readStoredPosition(): UserPosition | null {
  try {
    const saved = localStorage.getItem(POSITION_KEY)
    return saved === null ? null : (JSON.parse(saved) as UserPosition)
  } catch {
    // Storage bloccato o dato corrotto: nessuna posizione è uno stato valido, non un errore.
    return null
  }
}

export interface TodayScreenProps {
  readonly snapshot: Snapshot
}

/**
 * La schermata che risponde alla domanda vera: dove vado.
 *
 * L'ordine dei blocchi è deliberato. Prima le aree, perché è per quelle che apri l'app. La
 * posizione si chiede **dopo** aver già mostrato qualcosa, così vedi cosa ci guadagni prima di
 * concedere un permesso. I filtri stanno sotto il primo risultato, non sopra: quasi sempre la
 * risposta giusta è la prima, e chi deve filtrare sa cercare il controllo.
 */
export function TodayScreen({ snapshot }: TodayScreenProps) {
  const today = snapshot.referenceDate
  const hydrated = useIsHydrated()

  /*
   * La posizione concessa si ricorda, così non si richiede il permesso a ogni apertura.
   *
   * `undefined` significa "l'utente non l'ha ancora toccata in questa sessione": in quel caso
   * vale quella salvata. Leggere lo storage qui invece che in un effetto evita il render a
   * cascata, e sul server il valore è semplicemente nullo.
   */
  const [override, setOverride] = useState<UserPosition | null | undefined>(undefined)
  const stored = useMemo(() => (hydrated ? readStoredPosition() : null), [hydrated])
  const position = override === undefined ? stored : override
  const [date, setDate] = useState(today)
  const [filters, setFilters] = useState<Filters>({
    maxDistanceKm: null,
    forestTypes: [],
    minDataQuality: null,
  })

  const remember = (next: UserPosition | null): void => {
    setOverride(next)
    try {
      if (next === null) localStorage.removeItem(POSITION_KEY)
      else localStorage.setItem(POSITION_KEY, JSON.stringify(next))
    } catch {
      // Non poter ricordare la posizione non è un errore da mostrare.
    }
  }

  const suggestions = useMemo(
    () =>
      rankZones(snapshot.zones, {
        date,
        from: position,
        maxDistanceKm: filters.maxDistanceKm,
        forestTypes: filters.forestTypes,
        minDataQuality: filters.minDataQuality,
      }),
    [snapshot.zones, date, position, filters],
  )

  const forestTypes = useMemo(() => availableForestTypes(snapshot.zones), [snapshot.zones])
  const dates = useMemo(
    () => (snapshot.zones[0]?.series ?? []).filter((p) => p.date >= today).map((p) => p.date),
    [snapshot.zones, today],
  )

  if (snapshot.zones.length === 0) return <EmptySnapshot />

  const top = suggestions.slice(0, 5)
  const best = top[0]
  const verdict = buildVerdict({ zones: snapshot.zones, suggestions, date, today, formatDate })

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-4">
      <h1 className="sr-only">Dove vado oggi</h1>

      <DayPicker dates={dates} selected={date} today={today} onSelect={setDate} />

      <div className="mt-3">
        <VerdictCard verdict={verdict} />
      </div>

      {best === undefined ? (
        <NoResults onReset={() => { setFilters({ maxDistanceKm: null, forestTypes: [], minDataQuality: null }) }} />
      ) : (
        <>
          <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {position === null ? 'Le aree, dalla migliore' : 'Le aree raggiungibili, dalla migliore'}
          </p>
          <ol className="space-y-3">
            {top.map((suggestion) => (
              <li key={suggestion.zone.code}>
                <SuggestionCard suggestion={suggestion} today={today} />
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="mt-5 space-y-4">
        <LocationPrompt position={position} onChange={remember} zones={snapshot.zones} />
        <FilterBar
          filters={filters}
          onChange={setFilters}
          forestTypes={forestTypes}
          hasPosition={position !== null}
        />
        <BeforeYouGo topSuggestion={best ?? null} />
        <SourceHealth snapshot={snapshot} />
      </div>
    </div>
  )
}

function DayPicker({
  dates,
  selected,
  today,
  onSelect,
}: {
  dates: readonly string[]
  selected: string
  today: string
  onSelect: (date: string) => void
}) {
  if (dates.length === 0) return null
  return (
    <div
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1"
      role="group"
      aria-label="Giorno da valutare"
    >
      {dates.map((date) => {
        const active = date === selected
        return (
          <button
            key={date}
            type="button"
            onClick={() => { onSelect(date) }}
            aria-pressed={active}
            className={`min-h-11 shrink-0 rounded-lg border px-3 text-xs font-medium transition-colors
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          active
                            ? 'border-accent bg-accent/15 text-ink'
                            : 'border-edge bg-surface-1 text-ink-dim hover:text-ink'
                        }`}
          >
            {date === today ? 'oggi' : formatDate(date)}
          </button>
        )
      })}
    </div>
  )
}

function NoResults({ onReset }: { onReset: () => void }) {
  return (
    <div className="mt-4 rounded-xl border border-edge bg-surface-1 p-4 text-center">
      <p className="text-sm text-ink">Nessuna area corrisponde ai filtri.</p>
      <p className="mt-1 text-xs leading-snug text-ink-dim">
        Preferisco dirtelo piuttosto che mostrarti qualcosa che non rispetta quello che hai chiesto.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-3 min-h-11 rounded-lg border border-edge bg-surface-2 px-4 text-sm
                   font-medium text-ink transition-colors hover:bg-surface-3
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Azzera i filtri
      </button>
    </div>
  )
}

function EmptySnapshot() {
  return (
    <div className="mx-auto max-w-md px-6 py-12 text-center">
      <h1 className="text-lg font-semibold text-ink">FungiCast Toscana</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        I dati non sono ancora stati calcolati. Vengono ricostruiti una volta al giorno; finché non
        esistono non c&apos;è niente di onesto da mostrare.
      </p>
      <Link
        href="/mappa"
        className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-edge bg-surface-2
                   px-4 text-sm font-medium text-ink focus:outline-none focus-visible:ring-2
                   focus-visible:ring-accent"
      >
        Vai alla mappa
      </Link>
    </div>
  )
}

export type { Suggestion }
