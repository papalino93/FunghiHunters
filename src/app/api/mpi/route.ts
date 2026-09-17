import { NextResponse } from 'next/server'

import { loadSnapshot } from '@/lib/snapshot/load'

/**
 * Lo snapshot come API di sola lettura.
 *
 * Serve a due cose: leggere i punteggi da fuori senza fare scraping della pagina, e avere un
 * punto unico a cui puntare quando lo snapshot diventera' una query su Postgres. Il contratto
 * non cambia: cambia solo da dove arrivano le righe.
 *
 *   /api/mpi              tutte le zone
 *   /api/mpi?zone=amiata  una sola
 *   /api/mpi?date=2026-09-19  punteggi di un giorno specifico
 */
export const revalidate = 3600

export async function GET(request: Request): Promise<NextResponse> {
  const snapshot = await loadSnapshot()
  const url = new URL(request.url)
  const zoneCode = url.searchParams.get('zone')
  const date = url.searchParams.get('date')

  const zones = zoneCode === null ? snapshot.zones : snapshot.zones.filter((z) => z.code === zoneCode)

  if (zoneCode !== null && zones.length === 0) {
    return NextResponse.json({ error: `Zona sconosciuta: ${zoneCode}` }, { status: 404 })
  }

  if (date === null) {
    return NextResponse.json({ ...snapshot, zones })
  }

  // Con una data si restituisce la fotografia di quel giorno, non l'intera serie.
  const onDate = zones.map((zone) => {
    const point = zone.series.find((p) => p.date === date)
    return {
      code: zone.code,
      name: zone.name,
      latitude: zone.latitude,
      longitude: zone.longitude,
      elevationM: zone.elevationM,
      date,
      mpi: point?.mpi ?? null,
      confidence: point?.confidence ?? null,
      provenance: point?.provenance ?? null,
    }
  })

  return NextResponse.json({
    generatedAt: snapshot.generatedAt,
    algorithmVersion: snapshot.algorithmVersion,
    referenceDate: snapshot.referenceDate,
    date,
    zones: onDate,
    sources: snapshot.sources,
  })
}
