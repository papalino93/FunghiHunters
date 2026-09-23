'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'

import type { Snapshot } from '@/lib/snapshot/types'
import type { RegionChoice } from '@/lib/region/preference'
import { DEFAULT_REGION_SLUG } from '@/lib/region/preference'
import { RegionPicker } from '@/components/RegionPicker'
import { TimeSlider } from '@/components/TimeSlider'
import { ZoneSheet } from '@/components/ZoneSheet'
import { formatDate, mpiColor, mpiGradientCss } from '@/lib/ui/scale'
import { useFollowedZones } from '@/lib/zones/useFollowedZones'

// MapLibre tocca `window` all'import: non puo' essere renderizzata sul server.
const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-surface-0" aria-hidden="true">
      <div className="flex flex-col items-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-edge border-t-accent" />
        <p className="text-xs text-ink-faint">Sto caricando la mappa…</p>
      </div>
    </div>
  ),
})

export interface AppShellProps {
  readonly snapshot: Snapshot
  /** La regione mostrata: sulla mappa dev'essere scritto, o non si sa cosa si sta guardando. */
  readonly regionName?: string
  readonly regionSlug?: string
  /** Le regioni fra cui spostarsi. Cambiarle qui non cambia la regione di riferimento. */
  readonly regionChoices?: readonly RegionChoice[]
}

export function AppShell({ snapshot, regionName, regionSlug, regionChoices }: AppShellProps) {
  const todayDate = snapshot.referenceDate
  const dates = useMemo(
    () => snapshot.zones[0]?.series.map((p) => p.date) ?? [todayDate],
    [snapshot.zones, todayDate],
  )

  /*
   * Zona preselezionata da "Dove vado oggi".
   *
   * Arrivare qui da una scheda deve aprire quella zona, altrimenti il pulsante "vedi sulla mappa"
   * prometterebbe qualcosa che non fa. Il parametro vale come stato iniziale: appena l'utente
   * tocca un'altra zona, comanda lui.
   */
  const searchParams = useSearchParams()
  const initialCode = searchParams.get('zona')
  /*
   * Stesso principio per il giorno: chi in home ha scelto sabato e tocca "Dettaglio e mappa"
   * deve ritrovare sabato, non oggi. Vale solo se quel giorno esiste nella serie (un indirizzo
   * vecchio salvato fra i preferiti può puntare a un giorno ormai uscito dall'orizzonte).
   */
  const requestedDate = searchParams.get('giorno')
  const [selectedDate, setSelectedDate] = useState(() =>
    requestedDate !== null && (snapshot.zones[0]?.series ?? []).some((p) => p.date === requestedDate)
      ? requestedDate
      : todayDate,
  )
  const [override, setOverride] = useState<string | null | undefined>(undefined)
  const selectedCode = override === undefined ? initialCode : override
  const setSelectedCode = setOverride
  const [showStations, setShowStations] = useState(false)
  const [showLegend, setShowLegend] = useState(false)

  const scores = useMemo(() => {
    const out: Record<string, { mpi: number; confidence: number }> = {}
    for (const zone of snapshot.zones) {
      const point = zone.series.find((p) => p.date === selectedDate)
      out[zone.code] = {
        mpi: point?.mpi ?? zone.mpi,
        confidence: point?.confidence ?? zone.confidence,
      }
    }
    return out
  }, [snapshot.zones, selectedDate])

  const ranked = useMemo(
    () =>
      [...snapshot.zones].sort(
        (a, b) => (scores[b.code]?.mpi ?? 0) - (scores[a.code]?.mpi ?? 0),
      ),
    [snapshot.zones, scores],
  )

  const selectedZone = snapshot.zones.find((z) => z.code === selectedCode) ?? null
  const followed = useFollowedZones()
  const selectedProvenance =
    selectedZone?.series.find((p) => p.date === selectedDate)?.provenance ??
    (selectedDate > todayDate ? 'FORECAST' : 'MODELLED')

  if (snapshot.zones.length === 0) {
    return <EmptyState />
  }

  return (
    <section className="relative h-full w-full overflow-hidden bg-surface-0">
      <MapView
        zones={snapshot.zones}
        scores={scores}
        selectedCode={selectedCode}
        onSelect={setSelectedCode}
        showStations={showStations}
        theme="dark"
      />

      {/*
       * Intestazione e classifica restano solo finché non è aperta una scheda: con la scheda
       * sopra, il nome della zona e il suo contesto sono già lì. Tenerle visibili insieme
       * significava tre pannelli sovrapposti nello stesso schermo — il controllo primario deve
       * essere uno solo per volta.
       */}
      {selectedZone === null && (
        <>
          {/*
            * Intestazione e classifica in una sola colonna, non due blocchi con un `top` fisso
            * ciascuno: con il testo più grande l'intestazione va a capo e la classifica, messa a
            * 104 o 156 px, le finiva sotto. `pr-16` lascia libera la colonna dei comandi di
            * MapLibre (zoom e posizione, 44 px), che prima a 390 px coprivano il bordo destro
            * dell'intestazione.
            */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3 pr-16">
          <header>
            <div className="pointer-events-auto inline-flex max-w-full flex-col rounded-xl border border-edge bg-surface-1/90 px-3 py-2 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-ink">FungiCast</h1>
                <span className="rounded bg-surface-3 px-1.5 py-0.5 text-xs text-ink-dim">
                  porcino
                </span>
                {regionName !== undefined && (
                  <span className="truncate text-xs text-ink-dim">{regionName}</span>
                )}
              </div>
              <p className="mt-0.5 max-w-[46ch] text-xs leading-snug text-ink-dim">
                Compatibilità delle condizioni ambientali con una possibile fruttificazione.
                <strong className="font-medium text-ink"> Non indica la presenza di funghi.</strong>
              </p>
              {/*
                * Cambiare regione da qui è navigazione, non una nuova preferenza: `remember`
                * resta falso apposta, così guardare il Trentino non sposta la regione di casa.
                */}
              {regionChoices !== undefined && regionSlug !== undefined && (
                <div className="mt-2">
                  <RegionPicker
                    current={regionSlug}
                    choices={regionChoices}
                    label="Regione"
                    remember={false}
                    hrefFor={(slug) => `/mappa?regione=${encodeURIComponent(slug)}`}
                  />
                </div>
              )}
            </div>
          </header>

          {/* Classifica compatta: risponde a "dove conviene andare" senza aprire nulla. */}
          <div className="overflow-x-auto pb-1">
            <ul className="pointer-events-auto flex gap-1.5">
              {ranked.map((zone) => {
                const score = scores[zone.code]?.mpi ?? 0
                const active = zone.code === selectedCode
                return (
                  <li key={zone.code}>
                    <button
                      type="button"
                      onClick={() => { setSelectedCode(zone.code) }}
                      className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg
                                  border px-2 text-xs backdrop-blur-xl transition-colors
                                  focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                                    active
                                      ? 'border-edge-strong bg-surface-3 text-ink'
                                      : 'border-edge bg-surface-1/90 text-ink-dim hover:text-ink'
                                  }`}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: mpiColor(score) }}
                        aria-hidden="true"
                      />
                      {zone.name}
                      {/* Il denominatore anche qui: le pastiglie e i segnaposti devono dire la
                          stessa cosa, altrimenti il numero sulla mappa resta senza scala. */}
                      <span className="tabular font-semibold">
                        {score.toFixed(0)}
                        <span className="font-normal text-ink-faint">/100</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
          </div>
        </>
      )}

      {/* Legenda, a scomparsa: utile la prima volta, ingombrante dalla seconda. */}
      {/*
        * Da 1024 px in su la parte bassa diventa un pannello laterale a destra: a tutta larghezza
        * su un monitor la scheda copriva quasi tutta la mappa e le righe arrivavano a 1400 px,
        * illeggibili. Sotto resta a tutta larghezza, come un foglio che sale dal basso.
        */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col gap-2 p-3 pb-6 lg:left-auto lg:w-[32rem]">
        {showLegend && (
          <div className="pointer-events-auto rounded-xl border border-edge bg-surface-1/95 px-3 py-2 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Indice di compatibilità
              </span>
              <button
                type="button"
                onClick={() => { setShowLegend(false) }}
                className="-mr-2 min-h-11 px-2 text-sm text-ink-dim hover:text-ink"
              >
                chiudi
              </button>
            </div>
            <div
              className="mt-1.5 h-2 w-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${mpiGradientCss()})` }}
            />
            <div className="mt-1 flex justify-between text-xs text-ink-faint">
              <span>sfavorevoli</span>
              <span>discrete</span>
              <span>molto favorevoli</span>
            </div>
            <p className="mt-2 text-xs leading-snug text-ink-dim">
              Il numero dentro ogni segnaposto è questo indice, da 0 a 100: non è un conteggio di
              funghi né di zone. L&apos;anello attorno al numero si riempie in proporzione.
            </p>
            <p className="mt-2 text-xs leading-snug text-ink-dim">
              Il contorno <span className="text-ink">tratteggiato</span> e il riempimento più
              scarico indicano una stima poco affidabile: pochi dati osservati, oppure previsione
              lontana nel tempo.
            </p>
            {/* Provenienza dei dati: dentro la legenda, dove c'è spazio per leggerla davvero. */}
            <p className="mt-2 border-t border-edge pt-2 text-xs leading-snug text-ink-faint">
              Aggiornato il {formatDate(snapshot.referenceDate)} · modello{' '}
              {snapshot.algorithmVersion}
              <br />
              {snapshot.sources.map((s) => `${s.name} (${s.license})`).join(' · ')}
            </p>
          </div>
        )}

        {selectedZone === null ? (
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="flex-1">
              <TimeSlider
                dates={dates}
                selectedDate={selectedDate}
                todayDate={todayDate}
                onChange={setSelectedDate}
                provenance={selectedProvenance}
              />
            </div>
            <button
              type="button"
              onClick={() => { setShowLegend((v) => !v) }}
              aria-label="Legenda"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-edge
                         bg-surface-1/95 text-ink-dim backdrop-blur-xl transition-colors
                         hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="text-sm font-semibold">?</span>
            </button>
          </div>
        ) : (
          <>
            <TimeSlider
              dates={dates}
              selectedDate={selectedDate}
              todayDate={todayDate}
              onChange={setSelectedDate}
              provenance={selectedProvenance}
            />
            <ZoneSheet
              zone={selectedZone}
              todayDate={todayDate}
              selectedDate={selectedDate}
              onClose={() => { setSelectedCode(null) }}
              showStations={showStations}
              onToggleStations={() => { setShowStations((v) => !v) }}
              sources={snapshot.sources}
              following={followed.isFollowed(selectedZone.code)}
              onToggleFollow={() => {
                void followed.toggle({
                  zoneCode: selectedZone.code,
                  zoneName: selectedZone.name,
                  regionSlug: regionSlug ?? DEFAULT_REGION_SLUG,
                })
              }}
            />
          </>
        )}


      </div>
    </section>
  )
}

function EmptyState() {
  return (
    <section className="grid h-full place-items-center bg-surface-0 px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold text-ink">FungiCast</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Lo snapshot dei dati non è ancora stato generato. Viene ricostruito una volta al giorno;
          finché non esiste, la mappa non ha nulla di onesto da mostrare.
        </p>
        <code className="mt-4 block rounded-lg bg-surface-2 px-3 py-2 text-left text-xs text-ink-dim">
          npx tsx scripts/build-snapshot.ts
        </code>
      </div>
    </section>
  )
}
