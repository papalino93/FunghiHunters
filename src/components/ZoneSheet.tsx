'use client'

import { useState } from 'react'

import type { SnapshotFactor, SnapshotSource, SnapshotZone } from '@/lib/snapshot/types'
import { Sparkline } from '@/components/Sparkline'
import { SourceStatusList } from '@/components/SourceStatusList'
import { PotentialBar } from '@/components/today/PotentialBar'
import { zoneFacts } from '@/lib/recommend/verdict'
import { formatDate, formatValue, provenanceLabel } from '@/lib/ui/scale'
import { describeOutingWind, describeWaterWind, type WindAssessment } from '@/lib/model/wind'
import { habitatCuesFor } from '@/lib/model/habitat'

export interface ZoneSheetProps {
  readonly zone: SnapshotZone
  readonly todayDate: string
  readonly selectedDate: string
  readonly onSelectDate: (date: string) => void
  readonly onClose: () => void
  readonly showStations: boolean
  readonly onToggleStations: () => void
  readonly sources: readonly SnapshotSource[]
}

type Tab = 'sintesi' | 'meteo' | 'dove' | 'perche' | 'dati'

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'sintesi', label: 'Sintesi' },
  { id: 'meteo', label: 'Meteo' },
  { id: 'dove', label: 'Dove cercare' },
  { id: 'perche', label: 'Perché' },
  { id: 'dati', label: 'Dati' },
]

export function ZoneSheet({
  zone,
  todayDate,
  selectedDate,
  onSelectDate,
  onClose,
  showStations,
  onToggleStations,
  sources,
}: ZoneSheetProps) {
  const [tab, setTab] = useState<Tab>('sintesi')
  const point = zone.series.find((p) => p.date === selectedDate) ?? zone.series[0]
  if (point === undefined) return null

  const isToday = selectedDate === todayDate
  const facts = zoneFacts(zone)

  return (
    <section
      className="pointer-events-auto flex max-h-[68vh] flex-col overflow-hidden rounded-t-2xl
                 border border-b-0 border-edge bg-surface-1/95 shadow-[0_-8px_40px_rgba(0,0,0,0.5)]
                 backdrop-blur-xl"
      aria-label={`Dettaglio ${zone.name}`}
    >
      <header className="border-b border-edge px-4 pb-3 pt-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-tight text-ink">{zone.name}</h2>
            <p className="truncate text-xs text-ink-dim">
              {zone.municipality !== null && zone.municipality !== undefined
                ? `${zone.municipality} (${zone.province})`
                : zone.reference} ·{' '}
              {zone.elevationM} m · {zone.forest.join(', ')}
            </p>
          </div>

          <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="-mr-1 -mt-1 rounded-lg p-2 text-ink-faint transition-colors hover:bg-surface-2
                     hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* La scala invece del numero isolato: si capisce dove cade senza sapere cosa sia un 24. */}
        <div className="mt-2.5">
          <PotentialBar mpi={point.mpi} />
        </div>

        {!isToday && (
          <p className="mt-1 text-[11px] text-ink-faint">{formatDate(selectedDate)}</p>
        )}

        <ul className="mt-2 space-y-1">
          {facts.good !== null && (
            <li className="text-xs leading-snug text-ink-dim">
              <span className="text-accent" aria-hidden="true">✓ </span>
              {facts.good}
            </li>
          )}
          {facts.bad !== null && (
            <li className="text-xs leading-snug text-ink-dim">
              <span className="text-warn" aria-hidden="true">! </span>
              {facts.bad}
            </li>
          )}
        </ul>

        {/* Provenienza del dato di questo giorno: misura, modello o previsione. */}
        <p className="mt-1.5 text-[11px] text-ink-faint">
          dato {provenanceLabel(point.provenance)}
          {point.rainMm !== null && ` · pioggia ${point.rainMm.toFixed(1)} mm`}
          {point.tMinC !== null &&
            point.tMaxC !== null &&
            ` · ${point.tMinC.toFixed(0)}–${point.tMaxC.toFixed(0)} °C`}
        </p>
      </header>

      <nav
        className="flex gap-1 overflow-x-auto border-b border-edge px-2 py-1.5"
        aria-label="Sezioni"
      >
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => { setTab(entry.id) }}
            aria-current={tab === entry.id ? 'page' : undefined}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium
                        transition-colors focus:outline-none focus-visible:ring-2
                        focus-visible:ring-accent ${
                          tab === entry.id
                            ? 'bg-surface-3 text-ink'
                            : 'text-ink-dim hover:bg-surface-2 hover:text-ink'
                        }`}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-3">
        {tab === 'sintesi' && (
          <Summary zone={zone} todayDate={todayDate} selectedDate={selectedDate} onSelectDate={onSelectDate} />
        )}
        {tab === 'meteo' && <Weather zone={zone} selectedDate={selectedDate} />}
        {tab === 'dove' && <Where zone={zone} />}
        {tab === 'perche' && <Why zone={zone} />}
        {tab === 'dati' && (
          <DataProvenance
            zone={zone}
            showStations={showStations}
            onToggleStations={onToggleStations}
            sources={sources}
          />
        )}
      </div>
    </section>
  )
}


function Summary({
  zone,
  todayDate,
  selectedDate,
  onSelectDate,
}: {
  zone: SnapshotZone
  todayDate: string
  selectedDate: string
  onSelectDate: (date: string) => void
}) {
  return (
    <div className="space-y-4">
      {zone.bestWindow !== null && (
        <div className="min-w-0 space-y-1.5">
          {splitSentences(zone.bestWindow.narrative).map((sentence, index) => (
            <p
              key={index}
              className="min-w-0 break-words text-sm leading-relaxed text-ink"
            >
              {sentence}
            </p>
          ))}
        </div>
      )}

      <div className="min-w-0">
        <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px] text-ink-faint">
          <span className="truncate">{formatDate(zone.series[0]?.date ?? todayDate)}</span>
          <span className="shrink-0">oggi</span>
          <span className="truncate text-right">
            {formatDate(zone.series[zone.series.length - 1]?.date ?? todayDate)}
          </span>
        </div>
        <Sparkline
          points={zone.series}
          todayDate={todayDate}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />
      </div>

      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Tendenza" value={`${signed(zone.development)} pt`} hint="prossimi 4 giorni" />
        <Stat
          label="Limite"
          value={zone.limitingFactor === null ? '—' : shorten(zone.limitingFactor)}
          hint="cosa frena"
        />
        <Stat
          label="Ottimo"
          value={`${zone.thermalOptimumC.toFixed(1)} °C`}
          hint="per quota e stagione"
        />
      </dl>

      {/* I due numeri separati: dicono se il limite sono i dati o l'orizzonte previsionale. */}
      <dl className="grid grid-cols-2 gap-2">
        <Stat
          label="Qualità dati"
          value={`${zone.dataQuality.toFixed(0)}/100`}
          hint="stazioni e copertura"
        />
        <Stat
          label="Certezza previsione"
          value={`${(
            zone.series.find((p) => p.date === selectedDate)?.forecastCertainty ??
            zone.forecastCertainty
          ).toFixed(0)}/100`}
          hint="orizzonte del giorno"
        />
      </dl>

      <Wind zone={zone} selectedDate={selectedDate} />
    </div>
  )
}

/**
 * Il testo composto in `narrative.ts` incatena piu' fatti in un unico periodo lungo: corretto per
 * mantenere le frasi test-abili come stringa unica, ma denso da leggere su schermo stretto. Qui si
 * spezza solo per la presentazione, una riga per frase, senza toccare il testo o i test che lo
 * verificano.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-ZÀÈÉÌÒÙ])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Vento, in due blocchi separati apposta — vedi `src/lib/model/wind.ts`. Non tocca il
 * potenziale mostrato sopra: il primo spiega il bilancio idrico, il secondo e' un avviso di
 * prudenza per il giorno scelto, non un giudizio sulle condizioni ambientali.
 */
function Wind({ zone, selectedDate }: { zone: SnapshotZone; selectedDate: string }) {
  const point = zone.series.find((p) => p.date === selectedDate)
  const water = describeWaterWind(zone.weather.windMean7d)
  const outing = describeOutingWind(point?.windMs ?? null)

  return (
    <div className="space-y-2">
      <WindRow title="Vento e asciugamento del suolo" assessment={water} />
      <WindRow title="Vento previsto per il giorno scelto" assessment={outing} />
    </div>
  )
}

function WindRow({ title, assessment }: { title: string; assessment: WindAssessment }) {
  const tone =
    assessment.level === 'forte'
      ? 'text-warn'
      : assessment.level === 'dati-insufficienti'
        ? 'text-ink-faint'
        : 'text-ink-dim'
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{title}</p>
      <p className={`mt-0.5 text-xs leading-snug ${tone}`}>{assessment.message}</p>
    </div>
  )
}

function Weather({ zone, selectedDate }: { zone: SnapshotZone; selectedDate: string }) {
  const w = zone.weather
  const point = zone.series.find((p) => p.date === selectedDate)
  return (
    <div className="space-y-4">
      {point !== undefined && (
        <Group title={`Giorno selezionato — ${formatDate(selectedDate)}`}>
          <Row label="Pioggia" value={formatValue(point.rainMm, 'mm')} emphasis />
          <Row
            label="Temperatura"
            value={
              point.tMinC === null || point.tMaxC === null
                ? '—'
                : `${point.tMinC.toFixed(0)}–${point.tMaxC.toFixed(0)} °C`
            }
            emphasis
          />
          <Row
            label="Vento (massimo giornaliero)"
            value={formatValue(point.windMs, 'm/s')}
            hint="non una media: vedi la scheda Sintesi per il dettaglio"
          />
          <Row label="Dato" value={provenanceLabel(point.provenance)} hint="misura, modello o previsione" />
        </Group>
      )}

      <Group title="Acqua">
        <Row label="Pioggia 24 h" value={formatValue(w.rain24h, 'mm')} />
        <Row label="Pioggia 72 h" value={formatValue(w.rain72h, 'mm')} />
        <Row label="Pioggia 7 giorni" value={formatValue(w.rain7d, 'mm')} />
        <Row label="Pioggia 14 giorni" value={formatValue(w.rain14d, 'mm')} />
        <Row label="Pioggia 26 giorni" value={formatValue(w.rain26d, 'mm')} emphasis />
        <Row
          label="Acqua ancora disponibile"
          value={formatValue(w.effectiveWaterMm, 'mm')}
          emphasis
          hint="dopo evapotraspirazione, vento e calore"
        />
        {w.initialDeficitMm > 1 && (
          <Row
            label="Deficit del terreno"
            value={formatValue(w.initialDeficitMm, 'mm')}
            hint="quanto in più serve perché partiva secco"
          />
        )}
        <Row label="Evapotraspirazione 14 g" value={formatValue(w.et0_14d, 'mm')} />
      </Group>

      <Group title="Temperatura">
        <Row
          label="Media 20 giorni"
          value={formatValue(w.tMean20d, '°C')}
          emphasis
          hint={`ottimo ${zone.thermalOptimumC.toFixed(1)} °C`}
        />
        <Row label="Minima nella finestra" value={formatValue(w.tMinWindow, '°C')} />
        <Row label="Massima nella finestra" value={formatValue(w.tMaxWindow, '°C')} />
        <Row label="Temperatura del suolo" value={formatValue(w.soilTemperatureMean, '°C')} />
      </Group>

      <Group title="Aria e suolo">
        <Row label="Umidità del suolo" value={formatValue(w.soilMoisture, 'm³/m³', 3)} />
        <Row label="Deficit di vapore (VPD)" value={formatValue(w.vpdMean7d, 'kPa', 2)} />
        <Row label="Vento medio 7 giorni" value={formatValue(w.windMean7d, 'm/s')} />
      </Group>
    </div>
  )
}

/**
 * Habitat e toponimi reali, mai un pin. Vedi `src/lib/model/habitat.ts`: nessuna fonte lega
 * coordinate GPS a ritrovamenti di porcino, quindi qui non compare nessuna coordinata inventata,
 * solo ecologia generale del bosco presente e comuni reali verificati contro i confini ISTAT.
 */
function Where({ zone }: { zone: SnapshotZone }) {
  const cues = habitatCuesFor(zone.forest)
  const nearby = zone.nearbyMunicipalities.slice(0, 6)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Che bosco cercare
        </h3>
        {cues.length === 0 ? (
          <p className="text-xs leading-relaxed text-ink-dim">
            Nessuna indicazione disponibile per il tipo di bosco di questa zona.
          </p>
        ) : (
          <ul className="space-y-2">
            {cues.map((cue) => (
              <li key={cue.forestType} className="rounded-lg bg-surface-2 px-3 py-2">
                <p className="text-sm font-medium capitalize text-ink">
                  {cue.forestType} <span className="font-normal text-ink-faint">— {cue.host}</span>
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">{cue.note}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Ecologia generale del genere, valida ovunque compaia questo tipo di bosco: non è
          calibrata su questa zona e non promette nulla su questa uscita.
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Comuni della zona
        </h3>
        {nearby.length === 0 ? (
          <p className="text-xs leading-relaxed text-ink-dim">
            Nessun comune risolto entro raggio per questa zona.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {nearby.map((m) => (
              <li
                key={m.municipality}
                className="flex items-baseline justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"
              >
                <span className="truncate text-sm text-ink">{m.municipality}</span>
                <span className="tabular shrink-0 text-xs text-ink-faint">
                  {m.provinceAcronym} · {m.distanceKm.toFixed(1)} km
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Comuni reali entro 15 km in linea d&apos;aria dal punto di riferimento della zona,
          verificati contro i confini ISTAT — non il confine della zona, che non esiste: le sette
          zone di taratura sono punti, non poligoni.
        </p>
      </div>
    </div>
  )
}

function Why({ zone }: { zone: SnapshotZone }) {
  return (
    <div className="space-y-4">
      <FactorList title="Cosa alza il punteggio" factors={zone.positiveFactors} tone="positive" />
      <FactorList title="Cosa lo abbassa" factors={zone.negativeFactors} tone="negative" />
      <FactorList title="Ininfluenti oggi" factors={zone.neutralFactors} tone="neutral" />
      <p className="border-t border-edge pt-3 text-[11px] leading-relaxed text-ink-faint">
        Ogni contributo è la differenza rispetto allo stesso calcolo con quel fattore neutralizzato.
        I fattori marcati <em>da calibrare</em> usano parametri non ancora validati da una fonte:
        sono stime, non dati scientifici.
      </p>
    </div>
  )
}

function FactorList({
  title,
  factors,
  tone,
}: {
  title: string
  factors: readonly SnapshotFactor[]
  tone: 'positive' | 'negative' | 'neutral'
}) {
  if (factors.length === 0) return null
  const colour =
    tone === 'positive' ? 'text-accent' : tone === 'negative' ? 'text-danger' : 'text-ink-faint'

  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {title}
      </h3>
      <ul className="space-y-2">
        {factors.map((factor) => (
          <li key={factor.key} className="rounded-lg bg-surface-2 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink">{factor.label}</span>
              <span className={`tabular shrink-0 text-sm font-semibold ${colour}`}>
                {factor.contribution > 0 ? '+' : ''}
                {factor.contribution.toFixed(1)}
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">{factor.value}</p>
            {factor.provenance === 'calibrate' ? (
              <p className="mt-1 text-[10px] uppercase tracking-wide text-warn">da calibrare</p>
            ) : (
              <>
                <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-ink-faint">
                  fonte: {factor.source}
                </p>
                {factor.transferabilityCaution !== undefined && (
                  <p className="mt-1 text-[10px] leading-snug text-warn">
                    ⚠ studiato altrove o su altro habitat: {factor.transferabilityCaution}
                  </p>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function DataProvenance({
  zone,
  showStations,
  onToggleStations,
  sources,
}: {
  zone: SnapshotZone
  showStations: boolean
  onToggleStations: () => void
  sources: readonly SnapshotSource[]
}) {
  const unique = new Map(zone.stations.map((s) => [s.code, s]))

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Fonti di questo dato
        </h3>
        <SourceStatusList sources={sources} />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Stesse fonti di tutta l&apos;app, qui nel contesto di questa zona: se una risulta &quot;non
          raggiungibile&quot; o &quot;in parte&quot;, si riflette nella qualità dati e nella certezza
          di previsione mostrate nella scheda Sintesi — mai in un numero silenziosamente inventato.
        </p>
      </div>

      <Group title="Copertura">
        <Row
          label="Giorni con osservazioni"
          // Il denominatore viene dallo snapshot: `series.length + 40` era un numero inventato
          // che non corrispondeva né alla finestra di calcolo né ai punti mostrati.
          value={`${zone.observedDays} su ${zone.windowDays}`}
          hint="nella finestra di calcolo"
        />
        <Row label="Ultimo dato osservato" value={zone.lastObservedDate ?? '—'} />
        <Row
          label="Gradiente termico stimato"
          value={zone.lapseRateCPerKm === null ? '—' : `${zone.lapseRateCPerKm.toFixed(2)} °C/km`}
          hint="dai dati del giorno, non assunto"
        />
      </Group>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Stazioni usate ({unique.size})
          </h3>
          <button
            type="button"
            onClick={onToggleStations}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-accent transition-colors
                       hover:bg-surface-2 focus:outline-none focus-visible:ring-2
                       focus-visible:ring-accent"
          >
            {showStations ? 'nascondi sulla mappa' : 'mostra sulla mappa'}
          </button>
        </div>
        <ul className="space-y-1.5">
          {[...unique.values()].map((station) => (
            <li key={station.code} className="rounded-lg bg-surface-2 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm text-ink">{station.name}</span>
                <span className="tabular shrink-0 text-xs text-ink-dim">
                  {station.distanceKm.toFixed(1)} km
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-faint">
                {station.code} · {station.elevationM === null ? '—' : `${station.elevationM.toFixed(0)} m`}
                {' · '}
                {station.elevationDiffM.toFixed(0)} m di dislivello
                {' · distanza efficace '}
                {station.effectiveKm.toFixed(1)} km
              </p>
            </li>
          ))}
        </ul>
      </div>

      <p className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-ink-dim">
        {zone.stationNotes}
      </p>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {title}
      </h3>
      <dl className="divide-y divide-edge overflow-hidden rounded-lg bg-surface-2">{children}</dl>
    </div>
  )
}

function Row({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string
  value: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="min-w-0 text-xs text-ink-dim">
        {label}
        {hint !== undefined && <span className="block text-[10px] text-ink-faint">{hint}</span>}
      </dt>
      <dd
        className={`tabular shrink-0 text-sm ${emphasis === true ? 'font-semibold text-ink' : 'text-ink-dim'}`}
      >
        {value}
      </dd>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-ink">{value}</dd>
      <p className="truncate text-[10px] text-ink-faint">{hint}</p>
    </div>
  )
}

function signed(value: number): string {
  if (Math.abs(value) < 0.5) return 'stabile'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`
}

function shorten(factor: string): string {
  return factor.replace('Acqua disponibile nel suolo', 'Acqua').replace('Penalita meteorologiche', 'Meteo')
}
