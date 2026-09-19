'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  bearingDegrees,
  compassLabel,
  directionsUrl,
  distanceMeters,
  type Waypoint,
  type WaypointKind,
} from '@/lib/waypoints/types'
import { createWaypointRepository, type WaypointRepository } from '@/lib/waypoints/store'
import { useIsHydrated } from '@/lib/ui/useIsHydrated'

const KIND_LABEL: Readonly<Record<WaypointKind, string>> = {
  car: 'Auto',
  access: 'Accesso',
  reference: 'Riferimento',
  departure: 'Partenza',
}

const KIND_HINT: Readonly<Record<WaypointKind, string>> = {
  car: 'dove hai lasciato l’auto',
  access: 'dove sei entrato nel bosco',
  reference: 'un bivio, una radura, un punto a cui tornare',
  departure: 'un punto di partenza da riusare, es. casa o un parcheggio abituale',
}

type GeoState = 'idle' | 'asking' | 'denied' | 'unavailable' | 'timeout'

const GEO_ERROR_TEXT: Readonly<Record<Exclude<GeoState, 'idle' | 'asking'>, string>> = {
  denied: 'Permesso di posizione negato. Puoi concederlo dalle impostazioni del browser.',
  unavailable: 'Posizione non disponibile: nessun segnale GPS qui.',
  timeout: 'Il GPS non ha risposto in tempo. Riprova, magari spostandoti verso il cielo aperto.',
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
      (error) => {
        const code =
          error.code === error.PERMISSION_DENIED
            ? 'denied'
            : error.code === error.TIMEOUT
              ? 'timeout'
              : 'unavailable'
        reject(new Error(code))
      },
      { timeout: 10_000, maximumAge: 60_000 },
    )
  })
}

export interface WaypointsPanelProps {
  /**
   * `null` per i punti liberi (compresi i punti di partenza preferiti — vedi `LocationPrompt`),
   * l'id di una voce del diario per i punti di quella specifica uscita. Un punto vive nell'uno o
   * nell'altro elenco, mai in entrambi: vedi il commento su `entryId` in `lib/waypoints/types.ts`.
   */
  readonly entryId: string | null
  readonly title: string
  readonly description: string
  /** Se il pannello parte già aperto. I punti di un'uscita appena creata conviene vederli subito. */
  readonly defaultOpen?: boolean
  readonly emptyText: string
  /** Quali categorie proporre: un'uscita passata non ha bisogno di "Partenza", i punti liberi sì. */
  readonly kinds?: readonly WaypointKind[]
}

/**
 * Punti salvati: auto, accesso al sentiero, un riferimento, un punto di partenza.
 *
 * Nessuna traccia continua, nessun monitoraggio in background: un punto si salva solo dopo un
 * tocco esplicito, con la posizione di quel preciso momento. Mai sincronizzato, mai condiviso —
 * l'unica eccezione è "apri in mappe", un gesto dell'utente che apre un'app scelta da lui.
 */
export function WaypointsPanel({
  entryId,
  title,
  description,
  defaultOpen = false,
  emptyText,
  kinds = ['car', 'access', 'reference', 'departure'],
}: WaypointsPanelProps) {
  const hydrated = useIsHydrated()
  const repo: WaypointRepository | null = useMemo(
    () => (hydrated ? createWaypointRepository() : null),
    [hydrated],
  )
  const [open, setOpen] = useState(defaultOpen)
  const [points, setPoints] = useState<Waypoint[] | null>(null)
  const [kind, setKind] = useState<WaypointKind>(kinds[0] ?? 'reference')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [geoState, setGeoState] = useState<GeoState>('idle')
  const [error, setError] = useState<string | null>(null)
  /** Quale punto ha chiesto conferma di cancellazione: uno solo per volta. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [here, setHere] = useState<{ latitude: number; longitude: number } | null>(null)

  const reload = useCallback(async () => {
    if (repo === null) return
    const all = await repo.list()
    setPoints(entryId === null ? all.filter((p) => p.entryId === null) : all.filter((p) => p.entryId === entryId))
  }, [repo, entryId])

  useEffect(() => {
    if (!open || repo === null) return
    let cancelled = false
    // `.then()/.catch()` inline, non tramite `reload()`: passare per una funzione richiamata
    // indirettamente impedisce al linter di verificare che l'aggiornamento di stato sia
    // asincrono, e segnala un falso rischio di render a cascata.
    void repo
      .list()
      .then((all) => {
        if (cancelled) return
        setPoints(entryId === null ? all.filter((p) => p.entryId === null) : all.filter((p) => p.entryId === entryId))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPoints([])
        setError(err instanceof Error ? err.message : 'Non riesco a leggere i punti salvati.')
      })
    return () => { cancelled = true }
  }, [open, repo, entryId])

  const save = async (): Promise<void> => {
    if (repo === null) return
    setError(null)
    setGeoState('asking')
    setSaving(true)

    /*
     * Due try separati, non uno solo che copra tutto: prendere la posizione e scriverla su disco
     * falliscono per ragioni diverse e vanno dette diversamente. Con un unico blocco, un archivio
     * bloccato da un'altra scheda (`DatabaseBlockedError`, che ha un messaggio utile e preciso)
     * veniva annunciato come "nessun segnale GPS" — e un errore nella rilettura dopo un
     * salvataggio riuscito faceva sparire un punto che invece c'era, invitando a risalvarlo.
     */
    let position: { latitude: number; longitude: number }
    try {
      position = await getPosition()
      setGeoState('idle')
    } catch (err) {
      const code = err instanceof Error ? err.message : 'unavailable'
      setGeoState(code === 'denied' || code === 'timeout' ? code : 'unavailable')
      setSaving(false)
      return
    }

    try {
      await repo.add({
        entryId,
        kind,
        label: label.trim() === '' ? KIND_LABEL[kind] : label.trim(),
        ...position,
      })
      setLabel('')
      await reload()
    } catch (err) {
      setError(
        err instanceof Error
          ? `Punto non salvato: ${err.message}`
          : 'Punto non salvato: archivio non disponibile su questo dispositivo.',
      )
    }
    setSaving(false)
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
          <span className="text-sm font-semibold text-ink">{title}</span>
          <span className="ml-2 text-xs text-ink-faint">{description}</span>
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

          <fieldset>
            <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Che punto è
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setKind(k) }}
                  aria-pressed={kind === k}
                  title={KIND_HINT[k]}
                  className={`min-h-11 rounded-lg border px-3 text-xs font-medium
                              transition-colors focus:outline-none focus-visible:ring-2
                              focus-visible:ring-accent ${
                                kind === k
                                  ? 'border-accent bg-accent/15 text-ink'
                                  : 'border-edge bg-surface-2 text-ink-dim hover:text-ink'
                              }`}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">{KIND_HINT[kind]}</p>
          </fieldset>

          <div className="mt-2.5 flex gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => { setLabel(e.target.value) }}
              placeholder={`etichetta (facoltativa, es. "${KIND_LABEL[kind]}")`}
              className="min-h-11 flex-1 rounded-lg border border-edge bg-surface-2 px-3 text-sm
                         text-ink placeholder:text-ink-faint focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-accent"
            />
            <button
              type="button"
              onClick={() => { void save() }}
              disabled={saving}
              className="min-h-11 shrink-0 rounded-lg border border-accent/40 bg-accent/15 px-3
                         text-sm font-medium text-ink transition-colors hover:bg-accent/25
                         disabled:opacity-60 focus:outline-none focus-visible:ring-2
                         focus-visible:ring-accent"
            >
              {saving ? 'Salvo…' : 'Salva qui'}
            </button>
          </div>
          {(geoState === 'denied' || geoState === 'unavailable' || geoState === 'timeout') && (
            <p className="mt-1.5 text-[11px] leading-snug text-warn">{GEO_ERROR_TEXT[geoState]}</p>
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
                          title="Apre l'app mappe del dispositivo: condivide questa posizione con quell'app"
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
              <p className="mt-2 text-[11px] leading-snug text-ink-faint">
                &quot;Apri in mappe&quot; condivide quella coordinata con l&apos;app che scegli sul telefono.
                Per il resto, questi punti restano solo su questo dispositivo: mai sincronizzati.
              </p>
            </>
          )}

          {points !== null && points.length === 0 && (
            <p className="mt-3 text-[11px] leading-snug text-ink-faint">{emptyText}</p>
          )}
        </div>
      )}
    </section>
  )
}
