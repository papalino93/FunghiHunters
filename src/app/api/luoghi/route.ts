import { NextResponse } from 'next/server'

import { searchOsmPlaces } from '@/lib/sources/photon'

/**
 * Cerca un posto per nome, per il diario: `/api/luoghi?q=Lago di San Zanobi&lat=43.72&lon=11.17`.
 *
 * `lat`/`lon` facoltativi: avvicinano i risultati alla zona scelta, non li limitano. La risposta
 * dipende solo dall'indirizzo della richiesta, quindi la CDN di Vercel può tenerla: la stessa
 * ricerca fatta da due persone arriva a Photon una volta sola.
 *
 * Il messaggio d'errore verso il browser è sempre generico: quello vero resta nei log.
 */
const MAX_QUERY_LENGTH = 100

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 3 || q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: `La ricerca deve avere fra 3 e ${String(MAX_QUERY_LENGTH)} caratteri` },
      { status: 400 },
    )
  }
  const lat = Number(url.searchParams.get('lat'))
  const lon = Number(url.searchParams.get('lon'))
  const near =
    url.searchParams.has('lat') && Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180
      ? { latitude: lat, longitude: lon }
      : undefined
  try {
    const results = await searchOsmPlaces(q, near)
    return NextResponse.json(
      { results },
      { headers: { 'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400' } },
    )
  } catch (error) {
    console.error('[api/luoghi]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Ricerca non riuscita' }, { status: 502 })
  }
}
