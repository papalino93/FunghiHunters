'use client'

import { Fragment, useEffect, useRef, useState } from 'react'

import { today } from '@/lib/domain/time'
import type { PlaceCandidate, PlaceForecast, PlaceHourlyWeather } from '@/lib/sources/open-meteo-place'
import { formatDate, formatValue } from '@/lib/ui/scale'
import { weatherCodeLabel } from '@/lib/ui/weatherCode'

/**
 * Meteo e pluviometria per un luogo qualsiasi.
 *
 * A differenza della home ("Dove vado"), che parla delle sette zone di taratura del modello,
 * qui l'utente cerca un punto qualsiasi — un paese, una frazione, un parcheggio — e vede il dato
 * grezzo: temperatura, pioggia, vento, umidità e le altre variabili che Open-Meteo offre per quel
 * punto, senza passare dal punteggio MPI. Sono letture diverse: una guida "dove conviene andare
 * fra le zone note", l'altra risponde a "che tempo fa lì".
 */
export function MeteoScreen() {
  const [query, setQuery] = useState('')
  const [rawCandidates, setRawCandidates] = useState<readonly PlaceCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [place, setPlace] = useState<PlaceCandidate | null>(null)
  const [forecast, setForecast] = useState<PlaceForecast | null>(null)
  const [loadingForecast, setLoadingForecast] = useState(false)
  const [forecastError, setForecastError] = useState<string | null>(null)
  /*
   * La richiesta di previsione in volo, per poterla annullare. A differenza della ricerca per
   * nome (che già usa un `AbortController` nell'effetto qui sotto), questa parte da un evento
   * (il tocco su un risultato o su "Usa la mia posizione"), non da un effetto: serve un
   * riferimento che sopravviva al render, non la funzione di pulizia di un `useEffect`.
   */
  const forecastRequestRef = useRef<AbortController | null>(null)

  // Sotto due caratteri i risultati non vanno mostrati: si deriva dalla query invece di azzerare
  // lo stato in un effetto, così l'effetto sotto ha un solo compito, cercare quando c'è da cercare.
  const trimmedQuery = query.trim()
  const showResults = trimmedQuery.length >= 2
  const candidates = showResults ? rawCandidates : []

  const handleQueryChange = (value: string): void => {
    setQuery(value)
    // Segna subito che si sta cercando (appena l'utente digita, non dopo il debounce): farlo qui
    // invece che nell'effetto tiene l'effetto senza setState sincroni nel suo corpo, come chiede
    // la regola `react-hooks/set-state-in-effect`.
    if (value.trim().length >= 2) setSearching(true)
    else {
      setSearching(false)
      setSearchError(null)
    }
  }

  useEffect(() => {
    if (!showResults) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/meteo?q=${encodeURIComponent(trimmedQuery)}`, { signal: controller.signal })
        .then(async (res) => {
          const body = (await res.json()) as { results?: PlaceCandidate[]; error?: string }
          if (!res.ok) throw new Error(body.error ?? 'Ricerca non riuscita')
          setRawCandidates(body.results ?? [])
          setSearchError(null)
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setRawCandidates([])
          setSearchError('Ricerca non riuscita. Controlla la connessione e riprova.')
        })
        .finally(() => setSearching(false))
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmedQuery, showResults])

  const selectPlace = (candidate: PlaceCandidate): void => {
    setPlace(candidate)
    setRawCandidates([])
    setQuery('')
    setForecast(null)
    setForecastError(null)
    setLoadingForecast(true)

    /*
     * Annulla una richiesta di previsione ancora in volo per il luogo precedente. Senza questo,
     * due tocchi ravvicinati (due "Usa la mia posizione" di seguito, con letture GPS leggermente
     * diverse; oppure un risultato di ricerca scelto subito dopo un altro) fanno partire due
     * fetch concorrenti: se la risposta della prima richiesta (ormai superata) arriva dopo quella
     * della seconda, sovrascriverebbe in silenzio la previsione corretta con quella del luogo
     * sbagliato — l'utente vedrebbe il nome/le coordinate del luogo giusto ma il meteo di un
     * altro.
     */
    forecastRequestRef.current?.abort()
    const controller = new AbortController()
    forecastRequestRef.current = controller

    const params = new URLSearchParams({
      lat: String(candidate.latitude),
      lon: String(candidate.longitude),
    })
    if (candidate.elevationM !== null) params.set('elevation', String(candidate.elevationM))

    fetch(`/api/meteo?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as PlaceForecast & { error?: string }
        if (!res.ok) throw new Error(body.error ?? 'Previsione non disponibile')
        setForecast(body)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setForecastError('Non sono riuscito a scaricare il meteo per questo luogo. Riprova.')
      })
      .finally(() => {
        // Solo se questa è ancora la richiesta corrente: quella annullata non deve spegnere lo
        // stato di caricamento acceso dalla richiesta che l'ha sostituita.
        if (forecastRequestRef.current === controller) setLoadingForecast(false)
      })
  }

  const useMyLocation = (): void => {
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) return
    navigator.geolocation.getCurrentPosition(
      (result) => {
        const { latitude, longitude } = result.coords
        selectPlace({
          id: 0,
          name: 'La mia posizione',
          admin1: null,
          admin2: null,
          country: null,
          latitude,
          longitude,
          elevationM: null,
        })

        /*
         * A parte, senza bloccare la previsione: il nome è un di più, le coordinate (già mostrate,
         * vedi `PlaceWeather`) restano il riscontro che conta comunque se questa chiamata è lenta
         * o non trova nulla. Aggiorna solo se nel frattempo l'utente non ha cercato altro.
         */
        fetch(`/api/meteo?lat=${latitude}&lon=${longitude}&reverse=1`)
          .then(async (res) => (await res.json()) as { place?: { name: string; admin1: string | null } | null })
          .then((body) => {
            if (body.place === undefined || body.place === null) return
            const resolved = body.place
            setPlace((prev) =>
              prev !== null && prev.id === 0 && prev.latitude === latitude && prev.longitude === longitude
                ? { ...prev, name: resolved.name, admin1: resolved.admin1 }
                : prev,
            )
          })
          .catch(() => {
            // Il nome resta "La mia posizione": le coordinate già mostrate bastano da riscontro.
          })
      },
      () => {
        setForecastError('Posizione non disponibile: cerca un luogo per nome.')
      },
      { timeout: 10_000, maximumAge: 300_000 },
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-8">
      <header>
        <h1 className="text-lg font-semibold text-ink">Meteo</h1>
        <p className="mt-1 text-xs leading-snug text-ink-dim">
          Cerca un luogo qualsiasi e guarda temperatura, pioggia, vento e umidità: dato grezzo,
          senza passare dal punteggio delle zone. Fonte Open-Meteo, licenza CC BY 4.0.
        </p>
      </header>

      <div className="relative">
        <label htmlFor="meteo-search" className="sr-only">
          Cerca un luogo
        </label>
        <input
          id="meteo-search"
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Cerca un luogo, es. Abetone"
          className="min-h-11 w-full rounded-xl border border-edge bg-surface-1 px-3 text-sm
                     text-ink placeholder:text-ink-faint focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-accent"
        />

        {(candidates.length > 0 || searching || searchError !== null) && (
          <ul
            aria-live="polite"
            className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-edge
                       bg-surface-1 shadow-lg"
          >
            {searching && (
              <li className="px-3 py-2.5 text-xs text-ink-faint">Cerco…</li>
            )}
            {!searching && searchError !== null && (
              <li className="px-3 py-2.5 text-xs text-warn">{searchError}</li>
            )}
            {!searching &&
              searchError === null &&
              candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectPlace(c)}
                    className="min-h-11 w-full px-3 py-2 text-left text-sm text-ink transition-colors
                               hover:bg-surface-2 focus:outline-none focus-visible:bg-surface-2"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-1.5 text-xs text-ink-faint">
                      {[c.admin2, c.admin1, c.country].filter((v) => v !== null).join(', ')}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={useMyLocation}
        className="min-h-11 self-start rounded-lg border border-edge bg-surface-2 px-3 text-xs
                   font-medium text-ink-dim transition-colors hover:text-ink focus:outline-none
                   focus-visible:ring-2 focus-visible:ring-accent"
      >
        Usa la mia posizione
      </button>

      {place !== null && (
        <PlaceWeather
          place={place}
          forecast={forecast}
          loading={loadingForecast}
          error={forecastError}
        />
      )}
    </div>
  )
}

function PlaceWeather({
  place,
  forecast,
  loading,
  error,
}: {
  place: PlaceCandidate
  forecast: PlaceForecast | null
  loading: boolean
  error: string | null
}) {
  return (
    <section className="rounded-xl border border-edge bg-surface-1 p-3">
      <h2 className="text-sm font-semibold text-ink">
        {place.name}
        {place.admin1 !== null && (
          <span className="ml-1.5 text-xs font-normal text-ink-faint">{place.admin1}</span>
        )}
      </h2>
      {/*
        * "La mia posizione" (id sentinella 0, vedi `useMyLocation`) non ha un nome geocodificato:
        * senza le coordinate, chi tocca il pulsante non ha modo di sapere se il GPS ha agganciato
        * il punto giusto prima di guardare le previsioni. Stesso formato di `EntryForm.tsx`.
        */}
      {place.id === 0 && (
        <p className="mt-0.5 text-xs text-ink-faint">
          {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
        </p>
      )}

      {loading && <p className="mt-2 text-xs text-ink-faint">Scarico il meteo…</p>}
      {!loading && error !== null && <p className="mt-2 text-xs text-warn">{error}</p>}

      {!loading && forecast !== null && (
        <div className="mt-3 space-y-4">
          <CurrentCard forecast={forecast} />
          <DailyTable forecast={forecast} />
          <p className="border-t border-edge pt-2 text-xs leading-snug text-ink-faint">
            Previsione modellata (Open-Meteo, risoluzione ~9-25 km): a livello locale — in una
            valle stretta o in cresta — i valori reali possono differire, come per ogni previsione.
          </p>
        </div>
      )}
    </section>
  )
}

function CurrentCard({ forecast }: { forecast: PlaceForecast }) {
  const c = forecast.current
  if (c === null) return null
  const description = weatherCodeLabel(c.weatherCode)

  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <p className="text-xs text-ink-faint">Adesso{description !== null ? ` · ${description}` : ''}</p>
      <p className="mt-0.5 text-2xl font-semibold text-ink">
        {formatValue(c.temperatureC, '°C', 0)}
        {c.apparentTemperatureC !== null && (
          <span className="ml-1.5 text-sm font-normal text-ink-faint">
            percepiti {formatValue(c.apparentTemperatureC, '°C', 0)}
          </span>
        )}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Umidità" value={formatValue(c.humidityPercent, '%', 0)} />
        <Stat label="Pioggia" value={formatValue(c.precipitationMm, 'mm', 1)} />
        <Stat label="Vento" value={formatValue(c.windSpeedMs, 'm/s', 1)} />
        <Stat label="Raffica" value={formatValue(c.windGustMs, 'm/s', 1)} />
      </dl>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  )
}

/**
 * Giorno per giorno, con dettaglio ora per ora a richiesta.
 *
 * L'ora per ora sta chiuso finché non lo si apre: mostrarlo sempre per dieci giorni sarebbe una
 * tabella lunghissima su un telefono, per un dettaglio che serve solo quando un giorno preciso
 * conta davvero (es. "che vento fa domani mattina alle 8", non ogni giorno alla volta).
 */
function DailyTable({ forecast }: { forecast: PlaceForecast }) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const days = forecast.daily
  if (days.length === 0) return null

  // Non deducibile da `isForecast` (vero solo per i giorni futuri): serve il confronto esplicito
  // per distinguere oggi dagli altri giorni passati, che altrimenti si equivalgono a colpo d'occhio.
  const todayIso = today()

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-ink-dim">Giorno per giorno</p>
      <p className="mb-1.5 text-xs text-ink-faint">Tocca un giorno per il dettaglio ora per ora.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead>
            <tr className="text-ink-faint">
              <th className="py-1 pr-2 font-medium">Giorno</th>
              <th className="py-1 pr-2 font-medium">Pioggia</th>
              <th className="py-1 pr-2 font-medium">Min/Max</th>
              <th className="py-1 pr-2 font-medium">Vento</th>
              <th className="py-1 pr-2 font-medium">Umidità</th>
              <th className="py-1 pr-2 font-medium">Suolo</th>
              <th className="py-1 font-medium">ET0</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const expanded = expandedDate === day.date
              const isToday = day.date === todayIso
              return (
                <Fragment key={day.date}>
                  <tr className={`border-t border-edge ${isToday ? 'bg-accent/5' : ''}`}>
                    <td className="py-1.5 pr-2 text-ink">
                      <button
                        type="button"
                        onClick={() => setExpandedDate(expanded ? null : day.date)}
                        aria-expanded={expanded}
                        className={`-my-1.5 flex min-h-11 items-center gap-1 rounded text-left
                                    transition-colors hover:text-accent focus:outline-none
                                    focus-visible:ring-2 focus-visible:ring-accent ${
                                      isToday ? 'font-semibold text-ink' : 'font-medium text-ink'
                                    }`}
                      >
                        <span aria-hidden="true" className="text-ink-faint">
                          {expanded ? '▾' : '▸'}
                        </span>
                        {formatDate(day.date)}
                        {isToday && (
                          <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-xs
                                            font-semibold text-accent">
                            oggi
                          </span>
                        )}
                        {day.isForecast && (
                          <span className="text-xs text-ink-faint">previsto</span>
                        )}
                      </button>
                    </td>
                    <td className="py-1.5 pr-2 text-ink-dim">{formatValue(day.precipitationMm, 'mm', 1)}</td>
                    <td className="py-1.5 pr-2 text-ink-dim">
                      {formatValue(day.temperatureMinC, '', 0)} / {formatValue(day.temperatureMaxC, '°C', 0)}
                    </td>
                    <td className="py-1.5 pr-2 text-ink-dim">
                      {formatValue(day.windMaxMs, 'm/s', 1)}
                      {day.windGustMaxMs !== null && (
                        <span className="text-ink-faint"> ({formatValue(day.windGustMaxMs, 'm/s', 0)} raffica)</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-ink-dim">{formatValue(day.humidityMeanPercent, '%', 0)}</td>
                    <td className="py-1.5 pr-2 text-ink-dim">
                      {formatValue(day.soilTemperatureMeanC, '°C', 0)}
                      {day.soilMoistureMean !== null && (
                        <span className="text-ink-faint"> · {formatValue(day.soilMoistureMean, 'm³/m³', 2)}</span>
                      )}
                    </td>
                    <td className="py-1.5 text-ink-dim">{formatValue(day.et0Mm, 'mm', 1)}</td>
                  </tr>
                  {expanded && (
                    <tr
                      ref={(node) => {
                        /*
                         * Il giorno toccato può stare in fondo alla lista, con poco schermo
                         * rimasto sotto: senza portare in vista la riga appena apparsa, il
                         * dettaglio si apre fuori dallo schermo e sembra che non sia successo
                         * niente — proprio il giorno "oggi" ne è il caso più comune, a metà
                         * tabella dopo aver già scorso i giorni passati.
                         */
                        node?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                      }}
                    >
                      <td colSpan={7} className="bg-surface-2 p-0">
                        <HourlyDetail hours={forecast.hourlyByDate[day.date] ?? []} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function HourlyDetail({ hours }: { hours: readonly PlaceHourlyWeather[] }) {
  if (hours.length === 0) {
    return (
      <p className="p-2.5 text-xs text-ink-faint">
        Dettaglio orario non disponibile per questo giorno.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto p-2">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead>
          <tr className="text-ink-faint">
            <th className="py-1 pr-2 font-medium">Ora</th>
            <th className="py-1 pr-2 font-medium">Meteo</th>
            <th className="py-1 pr-2 font-medium">Temp</th>
            <th className="py-1 pr-2 font-medium">Pioggia</th>
            <th className="py-1 pr-2 font-medium">Vento</th>
            <th className="py-1 pr-2 font-medium">Umidità</th>
            <th className="py-1 font-medium">Suolo</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((h) => (
            <tr key={h.time} className="border-t border-edge/60">
              <td className="py-1 pr-2 text-ink">{formatHour(h.time)}</td>
              <td className="py-1 pr-2 text-ink-dim">{weatherCodeLabel(h.weatherCode) ?? '—'}</td>
              <td className="py-1 pr-2 text-ink-dim">{formatValue(h.temperatureC, '°C', 0)}</td>
              <td className="py-1 pr-2 text-ink-dim">{formatValue(h.precipitationMm, 'mm', 1)}</td>
              <td className="py-1 pr-2 text-ink-dim">
                {formatValue(h.windSpeedMs, 'm/s', 1)}
                {h.windGustMs !== null && (
                  <span className="text-ink-faint"> ({formatValue(h.windGustMs, 'm/s', 0)})</span>
                )}
              </td>
              <td className="py-1 pr-2 text-ink-dim">{formatValue(h.humidityPercent, '%', 0)}</td>
              <td className="py-1 text-ink-dim">
                {formatValue(h.soilTemperatureC, '°C', 0)}
                {h.soilMoisture !== null && (
                  <span className="text-ink-faint"> · {formatValue(h.soilMoisture, 'm³/m³', 2)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** "2026-09-20T14:00" -> "14:00". */
function formatHour(time: string): string {
  const index = time.indexOf('T')
  return index === -1 ? time : time.slice(index + 1)
}
