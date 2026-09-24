'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import type { Snapshot } from '@/lib/snapshot/types'
import {
  availableForestTypes,
  excludedZones,
  rankZones,
  type Suggestion,
  type UserPosition,
} from '@/lib/recommend/rank'
import { buildVerdict } from '@/lib/recommend/verdict'
import { VerdictCard } from '@/components/today/VerdictCard'
import { SuggestionCard } from '@/components/today/SuggestionCard'
import { LocationPrompt } from '@/components/today/LocationPrompt'
import { FilterBar, type Filters } from '@/components/today/FilterBar'
import { ExcludedZones } from '@/components/today/ExcludedZones'
import { BeforeYouGo } from '@/components/today/BeforeYouGo'
import { SourceHealth } from '@/components/today/SourceHealth'
import { FollowedZonesSection } from '@/components/today/FollowedZonesSection'
import { ModelLimitsNotice } from '@/components/today/ModelLimitsNotice'
import { WelcomeHero } from '@/components/WelcomeHero'
import { InstallPrompt } from '@/components/InstallPrompt'
import { RegionPicker } from '@/components/RegionPicker'
import { DEFAULT_REGION_SLUG, type RegionChoice } from '@/lib/region/preference'
import { formatDate } from '@/lib/ui/scale'
import { today as localToday } from '@/lib/domain/time'
import { effectiveToday } from '@/lib/snapshot/freshness'
import { useIsHydrated } from '@/lib/ui/useIsHydrated'
import { useFollowedZones } from '@/lib/zones/useFollowedZones'
import { useItaliaIndexClient } from '@/lib/zones/useItaliaIndexClient'

const POSITION_KEY = 'fungicast.position'

function readStoredPosition(): UserPosition | null {
  try {
    const saved = localStorage.getItem(POSITION_KEY)
    return saved === null ? null : (JSON.parse(saved) as UserPosition)
  } catch {
    // Storage bloccato o dato corrotto: nessuna posizione è uno stato valido, non un errore.
    return null
  }
}

/**
 * La regione a cui appartengono le zone mostrate.
 *
 * `catalogue` distingue i due modi in cui una regione arriva qui, e non e' un dettaglio: la
 * Toscana esiste sia come le sette zone di taratura (home, `catalogue: false`) sia come i
 * ventiquattro comuni del catalogo nazionale (Italia -> Toscana, `catalogue: true`). I link verso
 * la mappa devono dire quale dei due si sta guardando, altrimenti la mappa apre l'altro.
 */
export interface TodayRegion {
  readonly slug: string
  readonly name: string
  /** `true` quando le zone vengono da `regioni/<slug>.json` e non dallo snapshot di taratura. */
  readonly catalogue: boolean
  /** Presente solo in home: attiva il selettore della regione di riferimento. */
  readonly choices?: readonly RegionChoice[]
}

const TUSCANY_CALIBRATION: TodayRegion = {
  slug: DEFAULT_REGION_SLUG,
  name: 'Toscana',
  catalogue: false,
}

export interface TodayScreenProps {
  readonly snapshot: Snapshot
  /** Senza, si assume la Toscana delle sette zone: e' cio' che questa schermata ha sempre mostrato. */
  readonly region?: TodayRegion
  /**
   * `false` quando la pagina che la contiene ha già il proprio `<h1>` (le regioni del catalogo):
   * due titoli di primo livello nella stessa pagina confondono lettori di schermo e motori di
   * ricerca su quale sia l'argomento.
   */
  readonly heading?: boolean
}

/**
 * La schermata che risponde alla domanda vera: dove vado.
 *
 * L'ordine dei blocchi è deliberato. Prima le aree, perché è per quelle che apri l'app. La
 * posizione si chiede **dopo** aver già mostrato qualcosa, così vedi cosa ci guadagni prima di
 * concedere un permesso. I filtri stanno sotto il primo risultato, non sopra: quasi sempre la
 * risposta giusta è la prima, e chi deve filtrare sa cercare il controllo.
 */
export function TodayScreen({
  snapshot,
  region = TUSCANY_CALIBRATION,
  heading = true,
}: TodayScreenProps) {
  // Vedi `effectiveToday`: uno snapshot di ieri non deve chiamare «oggi» il giorno prima.
  const today = effectiveToday(snapshot, localToday())
  const hydrated = useIsHydrated()

  /*
   * La posizione concessa si ricorda, così non si richiede il permesso a ogni apertura.
   *
   * `undefined` significa "l'utente non l'ha ancora toccata in questa sessione": in quel caso
   * vale quella salvata. Leggere lo storage qui invece che in un effetto evita il render a
   * cascata, e sul server il valore è semplicemente nullo.
   */
  const [override, setOverride] = useState<UserPosition | null | undefined>(undefined)
  const stored = useMemo(() => (hydrated ? readStoredPosition() : null), [hydrated])
  const position = override === undefined ? stored : override
  const [date, setDate] = useState(today)
  const [filters, setFilters] = useState<Filters>({
    maxDistanceKm: null,
    forestTypes: [],
    minDataQuality: null,
  })

  const remember = (next: UserPosition | null): void => {
    setOverride(next)
    try {
      if (next === null) localStorage.removeItem(POSITION_KEY)
      else localStorage.setItem(POSITION_KEY, JSON.stringify(next))
    } catch {
      // Non poter ricordare la posizione non è un errore da mostrare.
    }
  }

  const rankOptions = useMemo(
    () => ({
      date,
      from: position,
      maxDistanceKm: filters.maxDistanceKm,
      forestTypes: filters.forestTypes,
      minDataQuality: filters.minDataQuality,
    }),
    [date, position, filters],
  )
  const suggestions = useMemo(
    () => rankZones(snapshot.zones, rankOptions),
    [snapshot.zones, rankOptions],
  )
  const excluded = useMemo(
    () => excludedZones(snapshot.zones, rankOptions),
    [snapshot.zones, rankOptions],
  )

  const forestTypes = useMemo(() => availableForestTypes(snapshot.zones), [snapshot.zones])
  const dates = useMemo(
    () => (snapshot.zones[0]?.series ?? []).filter((p) => p.date >= today).map((p) => p.date),
    [snapshot.zones, today],
  )

  const followed = useFollowedZones()
  const followedCodes = followed.codes
  // L'indice nazionale leggero serve solo per mostrare in "Le tue zone" una zona seguita che non
  // appartiene alla regione aperta ora: richiederlo sempre sarebbe una richiesta di rete in più a
  // ogni apertura della home anche per chi segue solo zone della propria regione.
  const needsNationalIndex = useMemo(
    () =>
      (followed.zones ?? []).some((z) => !snapshot.zones.some((sz) => sz.code === z.zoneCode)),
    [followed.zones, snapshot.zones],
  )
  const nationalIndex = useItaliaIndexClient(needsNationalIndex)

  if (snapshot.zones.length === 0) return <EmptySnapshot heading={heading} />

  const top = suggestions.slice(0, 5)
  const best = top[0]
  const verdict = buildVerdict({ zones: snapshot.zones, suggestions, date, today, formatDate })

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-4">
      {/*
        * La regione nel titolo separata da una virgola e non da una preposizione: "in Marche" e
        * "in Umbria" sono sbagliati, e una preposizione articolata per ognuna delle venti regioni
        * sarebbe una tabella da mantenere per una riga che nessuno vede. Il nome per esteso lo
        * dice comunque il selettore qui sotto.
        */}
      {heading && <h1 className="sr-only">Dove vado oggi, {region.name}</h1>}
      <WelcomeHero zoneCount={snapshot.zones.length} />
      <InstallPrompt />

      {region.choices !== undefined && (
        <div className="mb-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <RegionPicker current={region.slug} choices={region.choices} />
          </div>
          {/*
            * L'elenco delle regioni non ha più una voce sua nella barra in basso: era il quarto
            * posto per cambiare regione (con questo selettore, la mappa e Account) e costava una
            * voce su sei, quella che a 320 px mandava a capo "Dove vado". Resta raggiungibile da
            * qui, accanto al selettore che fa la stessa cosa.
            */}
          <Link
            href="/italia"
            prefetch={false}
            aria-label="Tutte le regioni"
            className="flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm text-accent
                       underline underline-offset-2 hover:text-ink focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-accent"
          >
            Tutte
          </Link>
        </div>
      )}

      <DayPicker dates={dates} selected={date} today={today} onSelect={setDate} />

      <div className="mt-3">
        <VerdictCard verdict={verdict} />
      </div>
      <div className="mt-2">
        <ModelLimitsNotice />
      </div>

      <div className="mt-5">
        <FollowedZonesSection
          state={followed}
          snapshot={snapshot}
          index={needsNationalIndex ? nationalIndex : null}
        />
      </div>

      {best === undefined ? (
        <NoResults onReset={() => { setFilters({ maxDistanceKm: null, forestTypes: [], minDataQuality: null }) }} />
      ) : (
        <>
          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {position === null ? 'Le aree, dalla più consigliata' : 'Le aree raggiungibili, dalla più consigliata'}
          </p>
          <ol className="space-y-3">
            {top.map((suggestion) => (
              <li key={suggestion.zone.code}>
                <SuggestionCard
                  suggestion={suggestion}
                  today={today}
                  date={date}
                  region={region}
                  following={followedCodes.has(suggestion.zone.code)}
                  onToggleFollow={() => {
                    void followed.toggle({
                      zoneCode: suggestion.zone.code,
                      zoneName: suggestion.zone.name,
                      regionSlug: region.slug,
                    })
                  }}
                />
              </li>
            ))}
          </ol>
        </>
      )}

      {/*
        * Le sette zone toscane sono macro-aree (la Garfagnana, il Casentino), non comuni: chi
        * cerca il proprio paese non lo trova in questo elenco e non ha modo di indovinare che i
        * comuni stanno sotto Italia. Una riga, solo dove il caso si presenta.
        */}
      {!region.catalogue && (
        <p className="mt-4 text-center text-xs text-ink-faint">
          Cerchi il tuo comune?{' '}
          <Link
            href={`/italia/${region.slug}`}
            className="text-accent underline underline-offset-2 hover:text-ink
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Vedi l&apos;elenco completo
          </Link>
        </p>
      )}

      <div className="mt-5 space-y-4">
        <LocationPrompt position={position} onChange={remember} zones={snapshot.zones} />
        <FilterBar
          filters={filters}
          onChange={setFilters}
          forestTypes={forestTypes}
          hasPosition={position !== null}
        />
        <ExcludedZones excluded={excluded} />
        <BeforeYouGo topSuggestion={best ?? null} regionSlug={region.slug} regionName={region.name} />
        <SourceHealth snapshot={snapshot} />
      </div>
    </div>
  )
}

function DayPicker({
  dates,
  selected,
  today,
  onSelect,
}: {
  dates: readonly string[]
  selected: string
  today: string
  onSelect: (date: string) => void
}) {
  if (dates.length === 0) return null
  return (
    <div
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1"
      role="group"
      aria-label="Giorno da valutare"
    >
      {dates.map((date) => {
        const active = date === selected
        return (
          <button
            key={date}
            type="button"
            onClick={() => { onSelect(date) }}
            aria-pressed={active}
            className={`min-h-11 shrink-0 rounded-lg border px-3 text-xs font-medium transition-colors
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          active
                            ? 'border-accent bg-accent/15 text-ink'
                            : 'border-edge bg-surface-1 text-ink-dim hover:text-ink'
                        }`}
          >
            {date === today ? 'oggi' : formatDate(date)}
          </button>
        )
      })}
    </div>
  )
}

function NoResults({ onReset }: { onReset: () => void }) {
  return (
    <div className="mt-4 rounded-xl border border-edge bg-surface-1 p-4 text-center">
      <p className="text-sm text-ink">Nessuna area corrisponde ai filtri.</p>
      <p className="mt-1 text-xs leading-snug text-ink-dim">
        Preferisco dirtelo piuttosto che mostrarti qualcosa che non rispetta quello che hai chiesto.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-3 min-h-11 rounded-lg border border-edge bg-surface-2 px-4 text-sm
                   font-medium text-ink transition-colors hover:bg-surface-3
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Azzera i filtri
      </button>
    </div>
  )
}

function EmptySnapshot({ heading }: { heading: boolean }) {
  return (
    <div className="mx-auto max-w-md px-6 py-12 text-center">
      {heading && <h1 className="text-lg font-semibold text-ink">FungiCast</h1>}
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        I dati non sono ancora stati calcolati. Vengono ricostruiti una volta al giorno; finché non
        esistono non c&apos;è niente di onesto da mostrare.
      </p>
      <Link
        href="/mappa"
        className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-edge bg-surface-2
                   px-4 text-sm font-medium text-ink focus:outline-none focus-visible:ring-2
                   focus-visible:ring-accent"
      >
        Vai alla mappa
      </Link>
    </div>
  )
}

export type { Suggestion }
