'use client'

import { elevationText } from '@/lib/ui/zone-label'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

import type { ItaliaIndexEntry } from '@/../scripts/build-snapshot-italia'
import { mpiBandColor } from '@/lib/ui/scale'
import { searchZones, type SearchableZone } from '@/lib/zones/search'

/*
 * L'indice nazionale, letto solo se la ricerca non trova niente nella regione aperta: chi è sulla
 * mappa della Toscana e scrive «Abetone» deve trovarlo, ma chi scrive «Abetone» sulla mappa
 * della Toscana non deve pagare 450 KB a ogni lettera. Una lettura per sessione di pagina.
 */
type NationalEntry = Pick<ItaliaIndexEntry, 'code' | 'name' | 'region' | 'regionSlug' | 'mpi'> &
  Partial<Pick<ItaliaIndexEntry, 'elevationM'>>
let nationalCache: Promise<readonly NationalEntry[] | null> | null = null

function loadNational(): Promise<readonly NationalEntry[] | null> {
  nationalCache ??= fetch('/data/italia-index.json')
    .then(async (response) => {
      if (!response.ok) return null
      const parsed = (await response.json()) as { zones?: unknown }
      return Array.isArray(parsed.zones) ? (parsed.zones as NationalEntry[]) : null
    })
    .catch(() => null)
  return nationalCache
}

export interface MapSearchProps {
  /** Le zone della regione aperta, con il punteggio del giorno mostrato. */
  readonly zones: readonly SearchableZone[]
  readonly regionName?: string
  readonly regionSlug?: string
  readonly onPick: (code: string) => void
  readonly onClose: () => void
}

/**
 * La ricerca della mappa: un campo, e sotto le zone che corrispondono, col loro punteggio.
 *
 * Prima le zone della regione aperta, che si aprono sul posto. Se lì non c'è niente, quelle delle
 * altre regioni, come collegamento alla loro mappa con la zona già aperta.
 */
export function MapSearch({ zones, regionName, regionSlug, onPick, onClose }: MapSearchProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const local = useMemo(() => searchZones(zones, query), [zones, query])

  const needsNational = local.length === 0 && query.trim().length >= 3
  const [national, setNational] = useState<readonly NationalEntry[] | null | undefined>(undefined)
  useEffect(() => {
    if (!needsNational || national !== undefined) return
    let cancelled = false
    void loadNational().then((entries) => {
      if (!cancelled) setNational(entries)
    })
    return () => { cancelled = true }
  }, [needsNational, national])

  const elsewhere = useMemo(() => {
    if (!needsNational || national === undefined || national === null) return []
    const others = national
      .filter((entry) => entry.regionSlug !== regionSlug)
      .map((entry) => ({ ...entry, score: entry.mpi }))
    return searchZones(others, query, 6)
  }, [needsNational, national, query, regionSlug])

  const trimmed = query.trim()

  return (
    <div className="pointer-events-auto rounded-xl border border-edge bg-surface-1/95 p-2 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <label htmlFor={`${listId}-input`} className="sr-only">
          Cerca un comune{regionName === undefined ? '' : ` in ${regionName}`}
        </label>
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="search"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose()
            if (event.key === 'Enter' && local[0] !== undefined) onPick(local[0].code)
          }}
          placeholder={`Cerca un comune${regionName === undefined ? '' : ` in ${regionName}`}`}
          aria-controls={listId}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-edge bg-surface-2 px-3 text-sm
                     text-ink placeholder:text-ink-faint focus:outline-none focus-visible:ring-2
                     focus-visible:ring-accent"
        />
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 shrink-0 rounded-lg px-2 text-sm text-ink-dim hover:text-ink
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Chiudi
        </button>
      </div>

      {trimmed !== '' && (
        <ul id={listId} className="mt-2 max-h-[45vh] overflow-y-auto" aria-live="polite">
          {local.map((zone) => (
            <li key={zone.code}>
              <button
                type="button"
                onClick={() => { onPick(zone.code) }}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm
                           text-ink hover:bg-surface-3 focus:outline-none focus-visible:ring-2
                           focus-visible:ring-accent"
              >
                <ScoreDot score={zone.score} />
                <span className="min-w-0 flex-1 truncate">
                  {zone.name}
                  {elevationText(zone.elevationM) !== null && (
                    <span className="text-xs text-ink-faint"> · {elevationText(zone.elevationM)}</span>
                  )}
                </span>
                <Score score={zone.score} />
              </button>
            </li>
          ))}

          {local.length === 0 && elsewhere.map((entry) => (
            <li key={entry.code}>
              <Link
                href={`/mappa?regione=${encodeURIComponent(entry.regionSlug)}&zona=${encodeURIComponent(entry.code)}`}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm text-ink
                           hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ScoreDot score={entry.score} />
                <span className="min-w-0 flex-1 truncate">
                  {entry.name}{' '}
                  <span className="text-ink-faint">
                    · {elevationText(entry.elevationM) !== null && <>{elevationText(entry.elevationM)} · </>}
                    {entry.region}
                  </span>
                </span>
                <Score score={entry.score} />
              </Link>
            </li>
          ))}

          {local.length === 0 && elsewhere.length === 0 && (
            <li className="px-2 py-2.5 text-xs leading-snug text-ink-dim">
              {needsNational && national === undefined
                ? 'Cerco nelle altre regioni…'
                : trimmed.length < 3
                  ? 'Scrivi almeno tre lettere per cercare anche nelle altre regioni.'
                  : `Nessuna zona con questo nome. Le zone sono i comuni con abbastanza bosco: prova
                     il comune vicino.`}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function ScoreDot({ score }: { score: number }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: mpiBandColor(score) }}
      aria-hidden="true"
    />
  )
}

function Score({ score }: { score: number }) {
  return (
    <span className="tabular shrink-0 text-xs font-semibold text-ink">
      {score.toFixed(0)}
      <span className="font-normal text-ink-faint">/100</span>
    </span>
  )
}
