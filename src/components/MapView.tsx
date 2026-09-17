'use client'

import { useEffect, useRef } from 'react'
// MapLibre 6 non ha un default export: si importa il namespace.
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import type { SnapshotZone } from '@/lib/snapshot/types'
import { confidenceOpacity, isLowConfidence, mpiColor, readableTextOn } from '@/lib/ui/scale'

/**
 * Stili di base senza chiave API, cartografici e sobri.
 * CARTO li serve liberamente con attribuzione, che MapLibre aggiunge da sola leggendola dallo
 * stile: non la scriviamo a mano, cosi' non puo' andare fuori sincrono.
 */
const STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
} as const

/*
 * MapLibre crea il proprio worker come modulo ES risolto a runtime, e sotto Turbopack quella
 * risoluzione finisce su un URL che risponde HTML: il browser lo rifiuta e la mappa resta nera
 * senza un errore evidente. I due file del worker vengono copiati fra gli asset statici da
 * `scripts/copy-maplibre-worker.mjs` prima di ogni dev e build, e qui li indichiamo esplicitamente.
 */
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

/** Riquadro della Toscana, con un margine. */
const TUSCANY_BOUNDS: [[number, number], [number, number]] = [
  [9.6, 42.2],
  [12.5, 44.6],
]

export interface MapViewProps {
  readonly zones: readonly SnapshotZone[]
  /** Punteggio da mostrare, per zona, nel giorno selezionato. */
  readonly scores: Readonly<Record<string, { mpi: number; confidence: number }>>
  readonly selectedCode: string | null
  readonly onSelect: (code: string) => void
  readonly showStations: boolean
  readonly theme: 'dark' | 'light'
}

export function MapView({
  zones,
  scores,
  selectedCode,
  onSelect,
  showStations,
  theme,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const zoneMarkers = useRef(new Map<string, maplibregl.Marker>())
  const stationMarkers = useRef<maplibregl.Marker[]>([])
  // Il callback cambia a ogni render: lo teniamo in un ref per non ricreare i marker a ogni
  // render del genitore. La sincronizzazione va in un effetto, perche' scrivere su un ref
  // durante il render e' proprio cio' che rende imprevedibile quale valore leggera' l'handler.
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    const map = new maplibregl.Map({
      container,
      style: STYLES[theme] as unknown as StyleSpecification | string,
      bounds: TUSCANY_BOUNDS,
      // Il margine tiene conto dei pannelli sovrapposti: intestazione in alto, cursore in basso.
      fitBoundsOptions: { padding: { top: 150, bottom: 150, left: 16, right: 16 } },
      attributionControl: { compact: true },
      // Il pitch confonde su una mappa di dati: la teniamo piatta.
      pitchWithRotate: false,
      dragRotate: false,
    })
    /*
     * Gli errori della mappa vanno in console, sempre.
     * MapLibre fallisce in silenzio: uno stile che non carica o un worker che non parte danno
     * una tela nera e nessun messaggio, e senza questo listener si perde tempo a cercare il
     * problema nel posto sbagliato.
     */
    map.on('error', (event) => {
      console.error('[maplibre]', event.error?.message ?? event)
    })
    if (process.env.NODE_ENV === 'development') {
      ;(window as unknown as { __map?: MapLibreMap }).__map = map
    }
    /*
     * Toponimi in italiano.
     *
     * Gli stili CARTO usano il campo `name`, che per l'Italia e' spesso l'esonimo inglese:
     * "Tuscany", "Florence". Su una mappa italiana e' straniante. Riscriviamo il campo di testo
     * di ogni livello simbolico preferendo `name:it`, con `name` come ripiego dove la traduzione
     * non c'e'.
     */
    map.on('style.load', () => {
      for (const layer of map.getStyle().layers ?? []) {
        if (layer.type !== 'symbol') continue
        const field = map.getLayoutProperty(layer.id, 'text-field')
        if (field === undefined || field === null) continue
        map.setLayoutProperty(layer.id, 'text-field', [
          'coalesce',
          ['get', 'name:it'],
          ['get', 'name'],
        ])
      }
    })

    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(
      new maplibregl.GeolocateControl({ trackUserLocation: false, showAccuracyCircle: true }),
      'top-right',
    )
    mapRef.current = map

    // I ref si copiano qui: al momento della pulizia potrebbero gia' puntare altrove.
    const zones = zoneMarkers.current
    const stations = stationMarkers.current
    return () => {
      map.remove()
      mapRef.current = null
      zones.clear()
      stations.length = 0
    }
  }, [theme])

  // Marker delle zone: ricreati quando cambiano i punteggi, che e' a ogni spostamento dello slider.
  useEffect(() => {
    const map = mapRef.current
    if (map === null) return

    for (const marker of zoneMarkers.current.values()) marker.remove()
    zoneMarkers.current.clear()

    for (const zone of zones) {
      const score = scores[zone.code] ?? { mpi: zone.mpi, confidence: zone.confidence }
      const element = document.createElement('button')
      element.type = 'button'
      element.setAttribute(
        'aria-label',
        `${zone.name}: indice ${score.mpi.toFixed(0)} su 100, affidabilità ${score.confidence.toFixed(0)}`,
      )
      element.className =
        'grid place-items-center rounded-full border transition-[transform,box-shadow] ' +
        'duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 ' +
        'focus-visible:ring-white/70'
      const selected = zone.code === selectedCode
      const size = selected ? 52 : 44
      element.style.width = `${size}px`
      element.style.height = `${size}px`
      element.style.backgroundColor = mpiColor(score.mpi)
      element.style.opacity = String(confidenceOpacity(score.confidence))
      element.style.color = readableTextOn(score.mpi)
      element.style.borderColor = selected ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)'
      element.style.borderWidth = selected ? '2.5px' : '1.5px'
      // Il tratteggio dice "stima incerta" senza costringere a leggere un secondo numero.
      element.style.borderStyle = isLowConfidence(score.confidence) ? 'dashed' : 'solid'
      element.style.boxShadow = selected
        ? '0 0 0 6px rgba(255,255,255,0.12), 0 8px 24px rgba(0,0,0,0.45)'
        : '0 4px 14px rgba(0,0,0,0.4)'

      const value = document.createElement('span')
      value.textContent = score.mpi.toFixed(0)
      value.className = 'text-[15px] font-semibold leading-none tabular'
      element.append(value)

      element.addEventListener('click', (event) => {
        event.stopPropagation()
        onSelectRef.current(zone.code)
      })

      const marker = new maplibregl.Marker({ element })
        .setLngLat([zone.longitude, zone.latitude])
        .addTo(map)
      zoneMarkers.current.set(zone.code, marker)
    }
  }, [zones, scores, selectedCode])

  // Stazioni SIR della zona selezionata.
  useEffect(() => {
    const map = mapRef.current
    if (map === null) return

    for (const marker of stationMarkers.current) marker.remove()
    stationMarkers.current = []
    if (!showStations) return

    const zone = zones.find((z) => z.code === selectedCode)
    if (zone === undefined) return

    const seen = new Set<string>()
    for (const station of zone.stations) {
      if (seen.has(station.code)) continue
      seen.add(station.code)

      const element = document.createElement('div')
      element.className = 'rounded-[3px] border border-white/70 bg-white/85 shadow'
      element.style.width = '9px'
      element.style.height = '9px'
      element.title =
        `${station.name} (${station.code}) — ${station.distanceKm.toFixed(1)} km, ` +
        `${station.elevationDiffM.toFixed(0)} m di dislivello`

      stationMarkers.current.push(
        new maplibregl.Marker({ element })
          .setLngLat([station.longitude, station.latitude])
          .addTo(map),
      )
    }
  }, [zones, selectedCode, showStations])

  // Centra sulla zona scelta, lasciando spazio al pannello inferiore.
  useEffect(() => {
    const map = mapRef.current
    if (map === null || selectedCode === null) return
    const zone = zones.find((z) => z.code === selectedCode)
    if (zone === undefined) return
    map.easeTo({
      center: [zone.longitude, zone.latitude],
      offset: [0, -110],
      duration: 600,
      zoom: Math.max(map.getZoom(), 8.5),
    })
  }, [zones, selectedCode])

  /*
   * Altezza esplicita invece di `absolute inset-0`.
   *
   * Il CSS di MapLibre dichiara `.maplibregl-map { position: relative }` con la stessa
   * specificita' della utility `absolute`, e siccome viene importato dopo vince lui: `inset-0`
   * smetteva di applicarsi e il contenitore collassava a zero di altezza. La mappa si costruiva
   * senza errori, WebGL funzionava, e restava semplicemente nera.
   */
  return <div ref={containerRef} className="h-full w-full" />
}
