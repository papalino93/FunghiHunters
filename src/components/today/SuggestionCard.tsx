'use client'

import Link from 'next/link'

import type { Suggestion } from '@/lib/recommend/rank'
import { zoneFacts } from '@/lib/recommend/verdict'
import { PotentialBar } from '@/components/today/PotentialBar'
import { Reliability } from '@/components/today/Reliability'
import { FollowButton } from '@/components/today/FollowButton'
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
  date = today,
  region,
  following = false,
  onToggleFollow,
}: {
  suggestion: Suggestion
  today: string
  /**
   * Il giorno che l'utente sta guardando in home. Viaggia nell'indirizzo della mappa: prima la
   * scheda ripartiva sempre da oggi, e chi aveva scelto sabato si ritrovava a leggere mercoledì.
   */
  date?: string
  region?: { readonly slug: string; readonly catalogue: boolean }
  /** `true` se questa zona è fra quelle che l'utente segue — vedi "Le tue zone" in home. */
  readonly following?: boolean
  /** Assente in contesti dove seguire non ha senso (es. una lista sola-lettura). */
  readonly onToggleFollow?: () => void
}) {
  const { zone, mpi, distanceKm, bestDay } = suggestion
  const facts = zoneFacts(zone)
  const betterLater = bestDay !== null && bestDay.date !== date && bestDay.mpi > mpi + 3

  return (
    <article className="rounded-xl border border-edge bg-surface-1 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <h3 className="truncate text-base font-semibold leading-tight text-ink">{zone.name}</h3>
          {following && (
            <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-accent">
              seguita
            </span>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs text-ink-faint">
          {distanceKm !== null && (
            <span title="Distanza in linea d'aria, non stradale">
              {distanceKm.toFixed(0)} km in linea d&apos;aria ·{' '}
            </span>
          )}
          {zone.elevationM} m
          {onToggleFollow !== undefined && (
            <FollowButton following={following} onToggle={onToggleFollow} compact />
          )}
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-ink-faint">{zone.forest.join(', ')}</p>

      <div className="mt-2.5">
        <PotentialBar mpi={mpi} />
      </div>

      <ul className="mt-2.5 space-y-1.5">
        {facts.good !== null && (
          <li className="flex gap-2 text-sm leading-snug text-ink-dim">
            <Mark kind="good" />
            {facts.good}
          </li>
        )}
        {facts.bad !== null && (
          <li className="flex gap-2 text-sm leading-snug text-ink-dim">
            <Mark kind="bad" />
            {facts.bad}
          </li>
        )}
      </ul>

      <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-dim">
        {/*
          * Solo quando c'è davvero un giorno migliore: «Nessun giorno migliore in vista» ripetuto
          * identico su ogni scheda era rumore, e il suo contrario si nota comunque.
          */}
        {betterLater && (
          <>
            <span>
              Meglio <strong className="font-medium text-ink">{formatDate(bestDay.date)}</strong>
            </span>
            <span aria-hidden="true" className="text-ink-faint">
              ·
            </span>
          </>
        )}
        <Reliability dataQuality={zone.dataQuality} hasStations={zone.stations.length > 0} />
      </p>

      <Link
        href={mapHref(zone.code, region, date === today ? null : date)}
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
 * L'indirizzo della mappa per una zona.
 *
 * Senza `regione` la mappa apre la regione di riferimento dell'utente, che e' esattamente quella
 * da cui arriva questo collegamento quando si parte dalla home: l'indirizzo resta corto e non
 * duplica un'informazione che il cookie ha gia'.
 *
 * Con `regione` si sta navigando il catalogo (Italia -> una regione), e allora va detto: la
 * regione di riferimento potrebbe essere un'altra, e senza il parametro la mappa aprirebbe quella
 * — che e' il difetto per cui da una zona trentina si finiva a guardare la Toscana.
 */
function mapHref(
  code: string,
  region: { readonly slug: string; readonly catalogue: boolean } | undefined,
  date: string | null,
): string {
  const params = new URLSearchParams()
  if (region !== undefined && region.catalogue) params.set('regione', region.slug)
  params.set('zona', code)
  if (date !== null) params.set('giorno', date)
  return `/mappa?${params.toString()}`
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
