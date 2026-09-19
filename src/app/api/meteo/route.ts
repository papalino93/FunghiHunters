import { NextResponse } from 'next/server'

import { fetchPlaceForecast, searchPlaces } from '@/lib/sources/open-meteo-place'

/**
 * Meteo e pluviometria per un luogo qualsiasi, cercato dall'utente.
 *
 * Due modalità sullo stesso endpoint, perché sono due passi dello stesso flusso in UI (cerca il
 * luogo, poi guardane il meteo):
 *
 *   /api/meteo?q=Abetone                    luoghi che corrispondono al nome
 *   /api/meteo?lat=44.14&lon=10.66&elevation=1350   previsione per quel punto
 *
 * Gira lato server (non nel browser direttamente) perché così la chiave di Open-Meteo — che non
 * serve, è gratuita e senza autenticazione — resta comunque un dettaglio infrastrutturale che può
 * cambiare senza toccare il client, e riusa `fetchJson` (timeout e retry) invece del `fetch` nudo.
 */
export const revalidate = 0

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const q = url.searchParams.get('q')
  const lat = url.searchParams.get('lat')
  const lon = url.searchParams.get('lon')

  try {
    if (lat !== null && lon !== null) {
      const latitude = Number(lat)
      const longitude = Number(lon)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return NextResponse.json({ error: 'Coordinate non valide' }, { status: 400 })
      }
      const elevationRaw = url.searchParams.get('elevation')
      const elevationParsed = elevationRaw === null ? null : Number(elevationRaw)
      const elevationM = elevationParsed !== null && Number.isFinite(elevationParsed) ? elevationParsed : null

      const forecast = await fetchPlaceForecast(latitude, longitude, elevationM)
      return NextResponse.json(forecast)
    }

    if (q !== null) {
      const results = await searchPlaces(q)
      return NextResponse.json({ results })
    }

    return NextResponse.json(
      { error: 'Specifica "q" per cercare un luogo, oppure "lat" e "lon" per la previsione' },
      { status: 400 },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore imprevisto nella richiesta a Open-Meteo' },
      { status: 502 },
    )
  }
}
