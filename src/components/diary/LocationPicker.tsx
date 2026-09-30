'use client'

import { useEffect, useRef, useState } from 'react'
// MapLibre 6 non ha un default export: si importa il namespace.
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import type { FoundPlace } from '@/lib/sources/photon'

// Vedi il commento in `MapView.tsx`: senza, sotto Turbopack la mappa resta nera.
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

/**
 * Voyager e non lo stile della mappa principale: qui si deve riconoscere il posto (laghi, strade,
 * nomi delle località), non leggere dei punteggi sopra un fondo neutro.
 */
const STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

export interface PickedPoint {
  readonly latitude: number
  readonly longitude: number
  /** Il nome cercato, quando il punto viene da una ricerca: «Lago San Zanobi». */
  readonly label: string | null
}

/**
 * Scegliere dove si è stati, come su una mappa qualsiasi: si cerca il posto per nome («Lago di
 * San Zanobi»), la mappa ci va, e il segnaposto si sposta trascinandolo o toccando la mappa.
 *
 * Serve per le uscite registrate dopo, a casa: lì il GPS darebbe la posizione del divano. La
 * ricerca parte solo da 3 lettere e dopo una pausa nella scrittura, e passa dal nostro server
 * (`/api/luoghi`), che la gira a Photon/OpenStreetMap senza l'indirizzo di chi cerca.
 */
export function LocationPicker({
  initial,
  center,
  onChange,
}: {
  /** Il punto già scelto, se c'è. */
  initial: PickedPoint | null
  /** Dove aprire la mappa se non c'è ancora un punto: la zona scelta nel modulo. */
  center: { latitude: number; longitude: number } | null
  onChange: (point: PickedPoint) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly FoundPlace[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [mapError, setMapError] = useState(false)
  /** Il nome scritto nel campo da una scelta, non dalla tastiera: non va cercato di nuovo. */
  const pickedQuery = useRef<string | null>(null)

  const centerRef = useRef(center)
  useEffect(() => {
    centerRef.current = center
  }, [center])

  // Letti una volta alla creazione della mappa: dopo, a spostarla pensano la ricerca e i tocchi.
  const startRef = useRef({ initial, center })

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const { initial: start, center: fallback } = startRef.current
    const focus = start ?? fallback
    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: focus === null ? [11.25, 43.77] : [focus.longitude, focus.latitude],
      zoom: start !== null ? 15 : focus !== null ? 12 : 6,
      attributionControl: { compact: true },
      pitchWithRotate: false,
      dragRotate: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('error', (event) => {
      console.error('[maplibre]', event.error?.message ?? event)
      if (!map.isStyleLoaded()) setMapError(true)
    })
    // Toponimi in italiano, come nella mappa principale.
    map.on('style.load', () => {
      for (const layer of map.getStyle().layers ?? []) {
        if (layer.type !== 'symbol') continue
        const field = map.getLayoutProperty(layer.id, 'text-field')
        if (field === undefined || field === null) continue
        map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:it'], ['get', 'name']])
      }
    })

    const marker = new maplibregl.Marker({ color: '#0d7456', draggable: true })
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLngLat()
      onChangeRef.current({ latitude: lat, longitude: lng, label: null })
    })
    if (start !== null) marker.setLngLat([start.longitude, start.latitude]).addTo(map)
    map.on('click', (event) => {
      marker.setLngLat(event.lngLat).addTo(map)
      onChangeRef.current({ latitude: event.lngLat.lat, longitude: event.lngLat.lng, label: null })
    })
    mapRef.current = map
    markerRef.current = marker
    return () => {
      marker.remove()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  // Ricerca con una pausa di 450 ms dopo l'ultima lettera: una richiesta per parola, non per tasto.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3 || query === pickedQuery.current) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSearching(true)
      setSearchError(null)
      /*
       * Per avvicinare i risultati basta la zona, arrotondata a un decimale (circa 10 km). Mai il
       * segnaposto: può essere il punto esatto dove si è trovato, e finirebbe a un servizio
       * esterno e nei log, qualunque precisione l'utente abbia scelto per salvarlo.
       */
      const near = centerRef.current
      const params = new URLSearchParams({ q })
      if (near !== null) {
        params.set('lat', near.latitude.toFixed(1))
        params.set('lon', near.longitude.toFixed(1))
      }
      fetch(`/api/luoghi?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error('ricerca')
          const body = (await response.json()) as { results?: FoundPlace[] }
          setResults(body.results ?? [])
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setSearchError('La ricerca non ha risposto. Puoi sempre toccare la mappa nel punto giusto.')
          setResults(null)
        })
        .finally(() => { setSearching(false) })
    }, 450)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const pick = (place: FoundPlace): void => {
    const map = mapRef.current
    const marker = markerRef.current
    if (map !== null && marker !== null) {
      marker.setLngLat([place.longitude, place.latitude]).addTo(map)
      map.flyTo({ center: [place.longitude, place.latitude], zoom: 15, duration: 600 })
    }
    onChangeRef.current({ latitude: place.latitude, longitude: place.longitude, label: place.name })
    setResults(null)
    pickedQuery.current = place.name
    setQuery(place.name)
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <label htmlFor="entry-place-search" className="sr-only">
          Cerca un posto
        </label>
        <input
          id="entry-place-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (e.target.value.trim().length < 3) setResults(null)
          }}
          onKeyDown={(e) => {
            // Invio sceglie il primo risultato invece di inviare tutto il modulo.
            if (e.key === 'Enter') {
              e.preventDefault()
              const first = results?.[0]
              if (first !== undefined) pick(first)
            }
          }}
          placeholder="Cerca un posto: Lago di San Zanobi, Scandicci"
          autoComplete="off"
          enterKeyHint="search"
          className="min-h-11 w-full rounded-lg border border-edge bg-surface-1 px-3 text-sm text-ink
                     placeholder:text-ink-faint focus:outline-none focus-visible:ring-2
                     focus-visible:ring-accent"
        />
        {searching && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">
            cerco…
          </span>
        )}
      </div>

      {results !== null && (
        <ul className="overflow-hidden rounded-lg border border-edge bg-surface-1" role="listbox" aria-label="Posti trovati">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-ink-faint">
              Nessun posto con questo nome. Prova con il comune accanto, oppure tocca la mappa.
            </li>
          ) : (
            results.map((place) => (
              <li key={`${place.name}-${place.latitude}-${place.longitude}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => { pick(place) }}
                  className="flex min-h-11 w-full flex-col items-start justify-center border-b border-edge px-3 py-1.5
                             text-left last:border-b-0 hover:bg-surface-2 focus:outline-none
                             focus-visible:bg-surface-2"
                >
                  <span className="text-sm font-medium text-ink">{place.name}</span>
                  <span className="text-xs text-ink-dim">
                    {[place.kind, place.detail].filter((x) => x !== '').join(' · ')}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {searchError !== null && <p className="text-xs text-warn">{searchError}</p>}

      {/* Il contenitore ha l'altezza sua: MapLibre gli impone `position: relative`. */}
      <div className="overflow-hidden rounded-lg border border-edge">
        <div ref={containerRef} className="h-64 w-full" />
      </div>
      {mapError && (
        <p className="text-xs text-warn">
          La mappa non si carica (serve la rete). Puoi comunque cercare il posto per nome qui sopra.
        </p>
      )}
      <p className="text-xs leading-snug text-ink-faint">
        Tocca la mappa o trascina il segnaposto per metterlo nel punto esatto. I risultati vengono da
        OpenStreetMap: al servizio arriva solo la parola cercata e la zona, non il punto.
      </p>
    </div>
  )
}
