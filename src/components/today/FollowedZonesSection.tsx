'use client'

import { useState } from 'react'
import Link from 'next/link'

import type { FollowedZonesState } from '@/lib/zones/useFollowedZones'
import { resolveFollowedZone, type IndexSource, type SnapshotSource, type ZoneReliability } from '@/lib/zones/resolve'
import { zoneMapHref } from '@/lib/zones/types'
import { PotentialBar } from '@/components/today/PotentialBar'
import { FollowButton } from '@/components/today/FollowButton'
import { Reliability } from '@/components/today/Reliability'
import { formatDate } from '@/lib/ui/scale'

/** Quante zone mostrare prima di "mostra tutte": una lista compatta, non una seconda classifica. */
const COLLAPSED_LIMIT = 5

/**
 * "Le tue zone" — sezione compatta in home, subito sotto il verdetto.
 *
 * Non è un secondo ordinamento generale: mostra solo le zone che l'utente ha scelto di seguire,
 * con lo stesso potenziale e la stessa affidabilità che vedrebbe aprendole, mai un valore
 * congelato al momento del "segui" (vedi `src/lib/zones/resolve.ts`). Non tocca né nasconde
 * `rankZones` qui sotto: una zona seguita che è già fra i primi suggerimenti compare in entrambi i
 * posti, non sparisce da uno dei due.
 */
export function FollowedZonesSection({
  state,
  snapshot,
  index,
}: {
  readonly state: FollowedZonesState
  readonly snapshot: SnapshotSource
  readonly index: IndexSource | null | undefined
}) {
  const [expanded, setExpanded] = useState(false)

  if (state.zones === null) return null // ancora in lettura: niente salto di layout in un lampo
  if (state.zones.length === 0) {
    return (
      <p className="text-xs leading-snug text-ink-faint">
        Nessuna zona seguita. Tocca <span className="text-ink-dim">★ Segui</span> su una scheda
        per ritrovarla qui.
      </p>
    )
  }

  const resolved = state.zones.map((zone) => ({
    zone,
    data: resolveFollowedZone(zone.zoneCode, snapshot, index ?? null),
  }))
  // Le zone con un punteggio vero vengono prima, ordinate dalla più favorevole; quelle senza dati
  // (fuori dalla regione corrente e non nell'indice nazionale, il caso raro descritto in
  // `resolve.ts`) restano in fondo, per nome.
  const sorted = [...resolved].sort((a, b) => {
    if (a.data !== null && b.data !== null) return b.data.mpi - a.data.mpi
    if (a.data !== null) return -1
    if (b.data !== null) return 1
    return a.zone.zoneName.localeCompare(b.zone.zoneName, 'it')
  })
  const visible = expanded ? sorted : sorted.slice(0, COLLAPSED_LIMIT)

  return (
    <section aria-labelledby="le-tue-zone">
      <div className="mb-2 flex items-baseline justify-between">
        <p id="le-tue-zone" className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Le tue zone
        </p>
        {sorted.length > COLLAPSED_LIMIT && (
          <button
            type="button"
            onClick={() => { setExpanded((v) => !v) }}
            className="min-h-11 text-[11px] font-medium text-ink-dim underline underline-offset-2
                       hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {expanded ? 'mostra meno' : `mostra tutte (${sorted.length})`}
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {visible.map(({ zone, data }) => (
          <li key={zone.id} className="rounded-xl border border-edge bg-surface-1 p-3">
            <div className="flex items-center gap-2">
              <Link
                href={zoneMapHref(zone)}
                className="flex min-h-11 min-w-0 flex-1 items-center rounded-lg
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="block truncate text-sm font-medium text-ink">{zone.zoneName}</span>
              </Link>
              <FollowButton
                following
                compact
                onToggle={() => { void state.toggle(zone) }}
              />
            </div>

            {data === null ? (
              <p className="mt-2 text-xs leading-snug text-ink-faint">
                Dati non disponibili per questa zona dalla regione aperta ora. Apri la mappa della
                sua regione per vederli.
              </p>
            ) : (
              <>
                <div className="mt-2">
                  <PotentialBar mpi={data.mpi} showValue={false} />
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-dim">
                  <ZoneReliabilityLabel reliability={data.reliability} />
                  <span aria-hidden="true" className="text-ink-faint">·</span>
                  <span>aggiornato il {formatDate(data.referenceDate)}</span>
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Due numeri diversi, due parole diverse — mai la stessa etichetta per `dataQuality` e
 * `confidence`: sono la distinzione che B2 in `docs/AUDIT.md` ha introdotto apposta, e
 * confonderle qui vorrebbe dire reintrodurla di nascosto in un posto nuovo. Per `dataQuality` si
 * riusa lo stesso componente `Reliability` delle altre schede; per `confidence` (l'unico numero
 * che l'indice nazionale porta) si mostra il numero, non le stesse parole tarate sull'altro dato.
 */
function ZoneReliabilityLabel({ reliability }: { reliability: ZoneReliability }) {
  if (reliability.kind === 'quality') {
    return <Reliability dataQuality={reliability.dataQuality} hasStations={reliability.hasStations} />
  }
  return <span>affidabilità {reliability.confidence.toFixed(0)}/100</span>
}
