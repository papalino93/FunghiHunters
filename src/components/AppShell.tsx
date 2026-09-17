'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'

import type { Snapshot } from '@/lib/snapshot/types'
import { TimeSlider } from '@/components/TimeSlider'
import { ZoneSheet } from '@/components/ZoneSheet'
import { formatDate, mpiColor, mpiGradientCss } from '@/lib/ui/scale'

// MapLibre tocca `window` all'import: non puo' essere renderizzata sul server.
const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-surface-0" />,
})

export interface AppShellProps {
  readonly snapshot: Snapshot
}

export function AppShell({ snapshot }: AppShellProps) {
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
  const initialCode = useSearchParams().get('zona')
  const [selectedDate, setSelectedDate] = useState(todayDate)
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

      {/* Intestazione: cosa stai guardando, e il promemoria che non e' una promessa. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
        <div className="pointer-events-auto inline-flex max-w-full flex-col rounded-xl border border-edge bg-surface-1/90 px-3 py-2 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-ink">FungiCast Toscana</h1>
            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-dim">
              porcino
            </span>
          </div>
          <p className="mt-0.5 max-w-[46ch] text-[11px] leading-snug text-ink-dim">
            Compatibilità delle condizioni ambientali con una possibile fruttificazione.
            <strong className="font-medium text-ink"> Non indica la presenza di funghi.</strong>
          </p>
        </div>
      </header>

      {/* Classifica compatta: risponde a "dove conviene andare" senza aprire nulla. */}
      <div className="pointer-events-none absolute inset-x-0 top-[104px] z-10 overflow-x-auto px-3 pb-1">
        <ul className="pointer-events-auto flex gap-1.5">
          {ranked.map((zone) => {
            const score = scores[zone.code]?.mpi ?? 0
            const active = zone.code === selectedCode
            return (
              <li key={zone.code}>
                <button
                  type="button"
                  onClick={() => { setSelectedCode(zone.code) }}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 py-1
                              text-[11px] backdrop-blur-xl transition-colors
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
                  <span className="tabular font-semibold">{score.toFixed(0)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Legenda, a scomparsa: utile la prima volta, ingombrante dalla seconda. */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col gap-2 p-3 pb-6">
        {showLegend && (
          <div className="pointer-events-auto rounded-xl border border-edge bg-surface-1/95 px-3 py-2 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Indice di compatibilità
              </span>
              <button
                type="button"
                onClick={() => { setShowLegend(false) }}
                className="text-[11px] text-ink-dim hover:text-ink"
              >
                chiudi
              </button>
            </div>
            <div
              className="mt-1.5 h-2 w-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${mpiGradientCss()})` }}
            />
            <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
              <span>sfavorevoli</span>
              <span>discrete</span>
              <span>molto favorevoli</span>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-ink-dim">
              Il contorno <span className="text-ink">tratteggiato</span> e il riempimento più
              scarico indicano una stima poco affidabile: pochi dati osservati, oppure previsione
              lontana nel tempo.
            </p>
            {/* Provenienza dei dati: dentro la legenda, dove c'è spazio per leggerla davvero. */}
            <p className="mt-2 border-t border-edge pt-2 text-[10px] leading-snug text-ink-faint">
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
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-edge
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
              onSelectDate={setSelectedDate}
              onClose={() => { setSelectedCode(null) }}
              showStations={showStations}
              onToggleStations={() => { setShowStations((v) => !v) }}
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
        <h1 className="text-lg font-semibold text-ink">FungiCast Toscana</h1>
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
