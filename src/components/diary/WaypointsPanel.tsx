'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  bearingDegrees,
  compassLabel,
  directionsUrl,
  distanceMeters,
  type Waypoint,
} from '@/lib/waypoints/types'
import { createWaypointRepository, type WaypointRepository } from '@/lib/waypoints/store'
import { useIsHydrated } from '@/lib/ui/useIsHydrated'

const KIND_LABEL: Readonly<Record<Waypoint['kind'], string>> = {
  car: 'Auto',
  point: 'Punto',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function getPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
      reject(new Error('unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (result) => { resolve({ latitude: result.coords.latitude, longitude: result.coords.longitude }) },
      (error) => { reject(new Error(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable')) },
      { timeout: 10_000, maximumAge: 60_000 },
    )
  })
}

/**
 * Punti salvati: dove ho lasciato l'auto, o un punto a cui tornare se mi perdo nel bosco.
 *
 * Diverso dal diario apposta (vedi `src/lib/waypoints/types.ts`): niente esito da calibrare, solo
 * un posto e un'ora, e mai sincronizzato — serve solo a chi l'ha salvato, sullo stesso telefono con
 * cui ci è tornato nel bosco.
 */
export function WaypointsPanel() {
  const hydrated = useIsHydrated()
  const repo: WaypointRepository | null = useMemo(
    () => (hydrated ? createWaypointRepository() : null),
    [hydrated],
  )
  const [open, setOpen] = useState(false)
  const [points, setPoints] = useState<Waypoint[] | null>(null)
  const [saving, setSaving] = useState<'car' | 'point' | null>(null)
  const [addingLabel, setAddingLabel] = useState(false)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** Quale punto ha chiesto conferma di cancellazione: uno solo per volta. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [here, setHere] = useState<{ latitude: number; longitude: number } | null>(null)

  const reload = useCallback(async () => {
    if (repo === null) return
    setPoints(await repo.list())
  }, [repo])

  useEffect(() => {
    if (!open || repo === null) return
    let cancelled = false
    void repo
      .list()
      .then((list) => { if (!cancelled) setPoints(list) })
      .catch((err: unknown) => {
        if (cancelled) return
        setPoints([])
        setError(err instanceof Error ? err.message : 'Non riesco a leggere i punti salvati.')
      })
    return () => { cancelled = true }
  }, [open, repo])

  const saveCar = async (): Promise<void> => {
    if (repo === null) return
    setError(null)
    setSaving('car')
    try {
      const position = await getPosition()
      await repo.add({ kind: 'car', label: 'Auto', ...position })
      await reload()
    } catch {
      setError('Posizione non disponibile: controlla il permesso di geolocalizzazione.')
    }
    setSaving(null)
  }

  const savePoint = async (): Promise<void> => {
    if (repo === null) return
    setError(null)
    setSaving('point')
    try {
      const position = await getPosition()
      await repo.add({ kind: 'point', label: label.trim() === '' ? 'Punto' : label.trim(), ...position })
      await reload()
      setLabel('')
      setAddingLabel(false)
    } catch {
      setError('Posizione non disponibile: controlla il permesso di geolocalizzazione.')
    }
    setSaving(null)
  }

  const refreshHere = (): void => {
    void getPosition()
      .then(setHere)
      .catch(() => { setError('Posizione non disponibile per calcolare la distanza.') })
  }

  const remove = async (id: string): Promise<void> => {
    if (repo === null) return
    await repo.remove(id)
    await reload()
  }

  return (
    <section className="rounded-xl border border-edge bg-surface-1 p-3">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v) }}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between text-left focus:outline-none
                   focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span>
          <span className="text-sm font-semibold text-ink">Punti salvati</span>
          <span className="ml-2 text-xs text-ink-faint">
            auto parcheggiata, o un punto a cui tornare nel bosco
          </span>
        </span>
        <svg
          width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"
          className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-3">
          {error !== null && (
            <p className="mb-2 rounded-lg bg-surface-2 px-2.5 py-2 text-[11px] leading-snug text-warn">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveCar}
              disabled={saving !== null}
              className="min-h-11 flex-1 rounded-lg border border-accent/40 bg-accent/15 px-3 text-sm
                         font-medium text-ink transition-colors hover:bg-accent/25 disabled:opacity-60
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {saving === 'car' ? 'Salvo…' : 'Salva posizione auto'}
            </button>
            <button
              type="button"
              onClick={() => { setAddingLabel((v) => !v) }}
              aria-expanded={addingLabel}
              className="min-h-11 flex-1 rounded-lg border border-edge bg-surface-2 px-3 text-sm
                         font-medium text-ink-dim transition-colors hover:text-ink focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-accent"
            >
              + Salva punto
            </button>
          </div>

          {addingLabel && (
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={label}
                onChange={(e) => { setLabel(e.target.value) }}
                placeholder="es. bivio, radura, sorgente…"
                className="min-h-11 flex-1 rounded-lg border border-edge bg-surface-2 px-3 text-sm
                           text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
              <button
                type="button"
                onClick={savePoint}
                disabled={saving !== null}
                className="min-h-11 shrink-0 rounded-lg border border-accent/40 bg-accent/15 px-3
                           text-sm font-medium text-ink disabled:opacity-60 focus:outline-none
                           focus-visible:ring-2 focus-visible:ring-accent"
              >
                {saving === 'point' ? 'Salvo…' : 'Salva'}
              </button>
            </div>
          )}

          {points !== null && points.length > 0 && (
            <>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {points.length} {points.length === 1 ? 'punto' : 'punti'}
                </p>
                <button
                  type="button"
                  onClick={refreshHere}
                  className="text-[11px] font-medium text-ink-dim underline underline-offset-2
                             hover:text-ink focus:outline-none focus-visible:ring-2
                             focus-visible:ring-accent"
                >
                  Calcola distanza da qui
                </button>
              </div>
              <ul className="mt-1.5 space-y-1.5">
                {points.map((point) => (
                  <li
                    key={point.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-ink">
                        {KIND_LABEL[point.kind]}{point.label !== KIND_LABEL[point.kind] ? ` · ${point.label}` : ''}
                      </p>
                      <p className="text-[11px] text-ink-faint">
                        {formatTime(point.createdAt)}
                        {here !== null && (
                          <>
                            {' · '}
                            {Math.round(distanceMeters(here, point))} m a{' '}
                            {compassLabel(bearingDegrees(here, point))}
                          </>
                        )}
                      </p>
                    </div>
                    {/*
                      * Due tocchi per cancellare, come nel diario: qui un tocco sbagliato
                      * cancella il punto dell'auto, cioè proprio la cosa che serve quando si è
                      * disorientati — e si tocca male, spesso con i guanti.
                      */}
                    {confirmingId === point.id ? (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => { setConfirmingId(null); void remove(point.id) }}
                          className="min-h-11 rounded-lg px-2 text-[11px] font-medium text-danger
                                     focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                        >
                          elimina
                        </button>
                        <button
                          type="button"
                          onClick={() => { setConfirmingId(null) }}
                          className="min-h-11 rounded-lg px-2 text-[11px] text-ink-faint
                                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          annulla
                        </button>
                      </div>
                    ) : (
                      <>
                        <a
                          href={directionsUrl(point)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-11 shrink-0 rounded-lg px-2 text-[11px] font-medium text-accent
                                     transition-colors hover:underline focus:outline-none
                                     focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          apri in mappe
                        </a>
                        <button
                          type="button"
                          onClick={() => { setConfirmingId(point.id) }}
                          aria-label={`Elimina il punto ${point.label}`}
                          className="min-h-11 shrink-0 rounded-lg px-2 text-ink-faint transition-colors
                                     hover:text-danger focus:outline-none focus-visible:ring-2
                                     focus-visible:ring-accent"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          </svg>
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {points !== null && points.length === 0 && (
            <p className="mt-3 text-[11px] leading-snug text-ink-faint">
              Nessun punto salvato. Resta solo su questo dispositivo, non viene mai sincronizzato.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
