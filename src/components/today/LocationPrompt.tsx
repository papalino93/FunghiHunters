'use client'

import { useEffect, useMemo, useState } from 'react'

import type { UserPosition } from '@/lib/recommend/rank'
import type { SnapshotZone } from '@/lib/snapshot/types'
import { departurePoints, type Waypoint } from '@/lib/waypoints/types'
import { createWaypointRepository } from '@/lib/waypoints/store'
import { useIsHydrated } from '@/lib/ui/useIsHydrated'

/**
 * Posizione: opzionale, con consenso esplicito, revocabile.
 *
 * Il permesso si chiede dopo aver già mostrato i risultati, così si vede cosa si guadagna prima
 * di concederlo. E c'è sempre la scelta manuale, perché nel bosco il GPS può non agganciare e
 * perché non tutti vogliono dare la posizione a un'app.
 *
 * La posizione resta sul dispositivo: non viene inviata da nessuna parte, e non potrebbe, perché
 * l'app non ha un server a cui mandarla.
 */
export function LocationPrompt({
  position,
  onChange,
  zones,
}: {
  position: UserPosition | null
  onChange: (next: UserPosition | null) => void
  zones: readonly SnapshotZone[]
}) {
  const [state, setState] = useState<'idle' | 'asking' | 'denied' | 'unavailable'>('idle')
  const [manual, setManual] = useState(false)
  const hydrated = useIsHydrated()
  const [saved, setSaved] = useState<readonly Waypoint[]>([])

  /*
   * Alfabetico su `reference` (il testo che compare sul chip), non l'ordine di arrivo.
   *
   * `zones` arriva già ordinato per punteggio del giorno (vedi `build-snapshot-italia.ts`), utile
   * per una classifica ma non per una scelta manuale: con le 190 zone del Piemonte o le 183 della
   * Lombardia, un ordine che cambia ogni giorno rende impossibile sia impararlo a memoria sia
   * scandirlo a colpo d'occhio. Qui si sceglie un punto di partenza per nome, non il migliore.
   */
  const zonesAlphabetical = useMemo(
    () => [...zones].sort((a, b) => a.reference.localeCompare(b.reference, 'it')),
    [zones],
  )

  // I punti di partenza preferiti si salvano dal Diario ("Punti fissi"): qui si leggono soltanto,
  // per offrirli come terza scelta accanto al GPS e ai riferimenti di zona. Restano locali, come
  // ogni punto salvato — vedi `lib/waypoints/types.ts`.
  useEffect(() => {
    if (!hydrated) return
    let cancelled = false
    void createWaypointRepository()
      .list()
      .then((all) => { if (!cancelled) setSaved(departurePoints(all)) })
      .catch(() => { if (!cancelled) setSaved([]) })
    return () => { cancelled = true }
  }, [hydrated])

  const requestLocation = (): void => {
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
      setState('unavailable')
      return
    }
    setState('asking')
    navigator.geolocation.getCurrentPosition(
      (result) => {
        onChange({ latitude: result.coords.latitude, longitude: result.coords.longitude })
        setState('idle')
      },
      (error) => {
        // 1 = permesso negato. Gli altri casi sono guasti temporanei, e vanno detti diversamente.
        setState(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable')
      },
      { timeout: 10_000, maximumAge: 300_000 },
    )
  }

  if (position !== null) {
    return (
      <section className="rounded-xl border border-edge bg-surface-1 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-dim">
            Distanze calcolate dalla tua posizione.
            {/*
              * Senza le coordinate non c'è modo di sapere se il GPS ha agganciato il punto giusto,
              * o se è rimasto quello di un punto di partenza scelto in un giro precedente: mostrarle
              * è l'unico riscontro immediato, prima di fidarsi delle distanze calcolate su di esse.
              */}
            <span className="mt-0.5 block text-[11px] text-ink-faint">
              {position.latitude.toFixed(4)}, {position.longitude.toFixed(4)} · resta sul
              dispositivo, non viene inviata da nessuna parte.
            </span>
          </p>
          <button
            type="button"
            onClick={() => { onChange(null) }}
            className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-medium text-ink-dim
                       transition-colors hover:bg-surface-2 hover:text-ink focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-accent"
          >
            Rimuovi
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-edge bg-surface-1 p-3">
      <h2 className="text-sm font-semibold text-ink">Ordina per distanza</h2>
      <p className="mt-1 text-xs leading-snug text-ink-dim">
        Con la tua posizione l&apos;elenco tiene conto di quanto è lontana ogni area. Senza, ordina
        solo per potenziale e affidabilità.
      </p>

      {state === 'denied' && (
        <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2 text-xs leading-snug text-warn">
          Permesso negato. Puoi concederlo dalle impostazioni del browser, oppure scegliere un
          punto di partenza qui sotto.
        </p>
      )}
      {state === 'unavailable' && (
        <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2 text-xs leading-snug text-warn">
          Posizione non disponibile su questo dispositivo o segnale assente. Scegli un punto di
          partenza qui sotto.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={requestLocation}
          disabled={state === 'asking'}
          className="min-h-11 flex-1 rounded-lg border border-accent/40 bg-accent/15 px-3 text-sm
                     font-medium text-ink transition-colors hover:bg-accent/25 disabled:opacity-60
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {state === 'asking' ? 'Attendo la posizione…' : 'Usa la mia posizione'}
        </button>
        <button
          type="button"
          onClick={() => { setManual((v) => !v) }}
          aria-expanded={manual}
          className="min-h-11 flex-1 rounded-lg border border-edge bg-surface-2 px-3 text-sm
                     font-medium text-ink-dim transition-colors hover:text-ink focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-accent"
        >
          Scelgo io da dove parto
        </button>
      </div>

      {manual && (
        <div className="mt-2.5">
          {saved.length > 0 && (
            <>
              <p className="mb-1.5 text-[11px] text-ink-faint">
                Da un punto di partenza salvato…
              </p>
              <ul className="mb-3 flex flex-wrap gap-1.5">
                {saved.map((point) => (
                  <li key={point.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange({ latitude: point.latitude, longitude: point.longitude })
                        setManual(false)
                      }}
                      className="min-h-11 rounded-lg border border-accent/40 bg-accent/15 px-3 text-xs
                                 font-medium text-ink transition-colors hover:bg-accent/25
                                 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {point.label}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mb-1.5 text-[11px] text-ink-faint">…oppure da vicino a</p>
            </>
          )}
          {saved.length === 0 && (
            <p className="mb-1.5 text-[11px] text-ink-faint">
              Parto da vicino a…
            </p>
          )}
          <ul className="flex flex-wrap gap-1.5">
            {zonesAlphabetical.map((zone) => (
              <li key={zone.code}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ latitude: zone.latitude, longitude: zone.longitude })
                    setManual(false)
                  }}
                  className="min-h-11 rounded-lg border border-edge bg-surface-2 px-3 text-xs
                             text-ink-dim transition-colors hover:text-ink focus:outline-none
                             focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {zone.reference}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-ink-faint">
            L&apos;elenco è quello delle località di riferimento delle aree coperte. Inserire un
            indirizzo qualsiasi richiederebbe un servizio di geocodifica, che non è ancora
            collegato.
            {saved.length === 0 && (
              <> Salva un punto di partenza (casa, un parcheggio abituale) dal Diario → Punti
              fissi: comparirà qui come scelta rapida.</>
            )}
          </p>
        </div>
      )}
    </section>
  )
}
