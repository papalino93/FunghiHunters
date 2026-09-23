import { NextResponse } from 'next/server'

import { fetchPlaceForecast, searchPlaces } from '@/lib/sources/open-meteo-place'
import { reverseGeocode } from '@/lib/sources/nominatim'

/**
 * Meteo e pluviometria per un luogo qualsiasi, cercato dall'utente.
 *
 * Tre modalità sullo stesso endpoint, perché sono passi dello stesso flusso in UI (cerca il
 * luogo, poi guardane il meteo):
 *
 *   /api/meteo?q=Abetone                            luoghi che corrispondono al nome
 *   /api/meteo?lat=44.14&lon=10.66&elevation=1350    previsione per quel punto
 *   /api/meteo?lat=44.14&lon=10.66&reverse=1         nome del posto a quelle coordinate
 *
 * Gira lato server (non nel browser direttamente) perché così la chiave di Open-Meteo — che non
 * serve, è gratuita e senza autenticazione — resta comunque un dettaglio infrastrutturale che può
 * cambiare senza toccare il client, e riusa `fetchJson` (timeout e retry) invece del `fetch` nudo.
 *
 * Il messaggio d'errore verso il client è sempre generico: quello vero (`error.message`), che per
 * un `HttpError` include l'URL completo costruito lato server, resta nei log del server e basta —
 * non è un segreto, ma è un dettaglio implementativo interno senza motivo di uscire da qui.
 */
export const revalidate = 0

const MAX_QUERY_LENGTH = 100

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const q = url.searchParams.get('q')
  const lat = url.searchParams.get('lat')
  const lon = url.searchParams.get('lon')

  try {
    if (lat !== null && lon !== null) {
      const latitude = Number(lat)
      const longitude = Number(lon)
      if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
        return NextResponse.json({ error: 'Coordinate non valide' }, { status: 400 })
      }

      if (url.searchParams.get('reverse') === '1') {
        const place = await reverseGeocode(latitude, longitude)
        return NextResponse.json({ place })
      }

      const elevationRaw = url.searchParams.get('elevation')
      const elevationParsed = elevationRaw === null ? null : Number(elevationRaw)
      const elevationM = elevationParsed !== null && Number.isFinite(elevationParsed) ? elevationParsed : null

      const forecast = await fetchPlaceForecast(latitude, longitude, elevationM)
      return NextResponse.json(forecast)
    }

    if (q !== null) {
      /*
       * Limiti sulla ricerca prima di girarla a Open-Meteo. Sotto i due caratteri non c'è un
       * nome di luogo da cercare (e il client non li manda); sopra i cento nessun comune italiano
       * ci arriva, e una stringa lunga a piacere è solo un modo di far lavorare il servizio
       * esterno a nostro nome. Contano i caratteri dopo `trim`, come in `searchPlaces`.
       */
      const length = q.trim().length
      if (length < 2 || length > MAX_QUERY_LENGTH) {
        return NextResponse.json(
          { error: `La ricerca deve avere fra 2 e ${String(MAX_QUERY_LENGTH)} caratteri` },
          { status: 400 },
        )
      }
      const results = await searchPlaces(q)
      return NextResponse.json({ results })
    }

    return NextResponse.json(
      { error: 'Specifica "q" per cercare un luogo, oppure "lat" e "lon" per la previsione' },
      { status: 400 },
    )
  } catch (error) {
    console.error('[api/meteo]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Richiesta meteo non riuscita' }, { status: 502 })
  }
}
