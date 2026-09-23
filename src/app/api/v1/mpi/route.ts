import { NextResponse } from 'next/server'

import { loadSnapshot } from '@/lib/snapshot/load'

/**
 * Lo snapshot come API di sola lettura, versionata.
 *
 * Serve a due cose: leggere i punteggi da fuori senza fare scraping della pagina, e avere un
 * punto unico a cui puntare quando lo snapshot diventera' una query su Postgres. Il contratto
 * non cambia: cambia solo da dove arrivano le righe.
 *
 *   /api/v1/mpi              tutte le zone
 *   /api/v1/mpi?zone=amiata  una sola
 *   /api/v1/mpi?date=2026-09-19  punteggi di un giorno specifico
 *
 * **Solo Toscana.** Come lo snapshot che legge, copre le sette zone di taratura: le altre 1.195
 * zone del catalogo nazionale vivono in `public/data/regioni/<slug>.json`, non ancora esposte qui
 * — nessun consumatore esterno le ha mai chieste, e improvvisare un contratto senza una richiesta
 * reale davanti sarebbe la stessa falsa precisione che questo progetto evita altrove. Se serve,
 * si aggiunge un parametro `regione`, non un endpoint parallelo.
 *
 * **`v1` nell'indirizzo, non solo `schemaVersion` nel corpo.** Il numero nel corpo dice a chi
 * legge già la risposta se il contratto è quello atteso; il numero nell'indirizzo permette di
 * pubblicarne uno nuovo (`/api/v2/mpi`) senza rompere chi punta ancora a questo, il giorno in cui
 * la forma cambierà davvero.
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
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    algorithmVersion: snapshot.algorithmVersion,
    referenceDate: snapshot.referenceDate,
    date,
    zones: onDate,
    sources: snapshot.sources,
  })
}
