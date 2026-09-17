'use client'

import Link from 'next/link'

import type { Suggestion } from '@/lib/recommend/rank'
import { zoneFacts } from '@/lib/recommend/verdict'
import { PotentialBar } from '@/components/today/PotentialBar'
import { formatDate } from '@/lib/ui/scale'

/**
 * Una zona, leggibile senza interpretare numeri.
 *
 * La versione precedente metteva sei numeri su una scheda — punteggio, affidabilità, qualità
 * dati, certezza previsione, tendenza, ottimo termico — e lasciava all'utente il lavoro di capire
 * quali contassero. Era una dashboard, non uno strumento.
 *
 * Qui restano: dove, quanto (sulla scala, non come cifra isolata), cosa funziona, cosa manca,
 * quando conviene. Il resto è nel dettaglio, per chi lo cerca.
 */
export function SuggestionCard({
  suggestion,
  today,
}: {
  suggestion: Suggestion
  today: string
}) {
  const { zone, mpi, distanceKm, bestDay } = suggestion
  const facts = zoneFacts(zone)
  const betterLater = bestDay !== null && bestDay.date !== today && bestDay.mpi > mpi + 3

  return (
    <article className="rounded-xl border border-edge bg-surface-1 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-base font-semibold leading-tight text-ink">{zone.name}</h3>
        <span className="shrink-0 text-xs text-ink-faint">
          {distanceKm !== null && <>{distanceKm.toFixed(0)} km · </>}
          {zone.elevationM} m
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-ink-faint">{zone.forest.join(', ')}</p>

      <div className="mt-2.5">
        <PotentialBar mpi={mpi} />
      </div>

      <ul className="mt-2.5 space-y-1.5">
        {facts.good !== null && (
          <li className="flex gap-2 text-xs leading-snug text-ink-dim">
            <Mark kind="good" />
            {facts.good}
          </li>
        )}
        {facts.bad !== null && (
          <li className="flex gap-2 text-xs leading-snug text-ink-dim">
            <Mark kind="bad" />
            {facts.bad}
          </li>
        )}
      </ul>

      <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-dim">
        {betterLater ? (
          <span>
            Meglio <strong className="font-medium text-ink">{formatDate(bestDay.date)}</strong>
          </span>
        ) : (
          <span>Nessun giorno migliore in vista</span>
        )}
        <span aria-hidden="true" className="text-ink-faint">
          ·
        </span>
        <Reliability dataQuality={zone.dataQuality} />
      </p>

      <Link
        href={`/mappa?zona=${zone.code}`}
        className="mt-3 flex min-h-11 items-center justify-center rounded-lg border border-edge
                   bg-surface-2 text-sm font-medium text-ink transition-colors hover:bg-surface-3
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Dettaglio e mappa
      </Link>
    </article>
  )
}

/**
 * L'affidabilità dei dati in parole.
 * «79» non dice a nessuno se fidarsi; «stima solida» sì, e il numero resta nel dettaglio.
 */
function Reliability({ dataQuality }: { dataQuality: number }) {
  const label =
    dataQuality >= 70 ? 'stima solida' : dataQuality >= 50 ? 'stima discreta' : 'stima incerta'
  const colour =
    dataQuality >= 70 ? 'text-accent' : dataQuality >= 50 ? 'text-ink-dim' : 'text-warn'
  return <span className={colour}>{label}</span>
}

function Mark({ kind }: { kind: 'good' | 'bad' }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
      className={`mt-0.5 shrink-0 ${kind === 'good' ? 'text-accent' : 'text-warn'}`}
    >
      {kind === 'good' ? (
        <path d="M3 7.5l2.8 2.8L11 4.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M7 3v5M7 10.5v.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      )}
    </svg>
  )
}
