import { NextResponse } from 'next/server'

import { isModelOnly, toApiZone, zoneOnDate } from '@/lib/api/mpi'
import { loadSnapshot } from '@/lib/snapshot/load'
import { loadItaliaIndex, loadRegion } from '@/lib/snapshot/load-italia'
import type { Snapshot } from '@/lib/snapshot/types'

/**
 * Lo snapshot come API di sola lettura, versionata.
 *
 * Serve a due cose: leggere i punteggi da fuori senza fare scraping della pagina, e avere un
 * punto unico a cui puntare quando lo snapshot diventerà una query su Postgres. Il contratto
 * non cambia: cambia solo da dove arrivano le righe.
 *
 *   /api/v1/mpi                          le sette zone di taratura toscane (come sempre)
 *   /api/v1/mpi?zone=amiata              una sola zona — di taratura o del catalogo nazionale
 *   /api/v1/mpi?date=2026-09-19          i punteggi di un giorno
 *   /api/v1/mpi?region=toscana           tutte le zone di una regione, serie completa
 *   /api/v1/mpi?region=toscana&date=…    una regione in un giorno
 *   /api/v1/mpi?region=all               ogni zona d'Italia, col valore di oggi
 *
 * **Tutto aggiuntivo.** Senza `region` la risposta è quella di prima — le sette zone di taratura,
 * con il dettaglio completo — più il solo campo `modelOnly` su ogni zona. Chi usava già l'API non
 * vede cambiare niente di ciò che leggeva. `region` e non `regione`, come suggeriva la versione
 * precedente di questo commento: gli altri parametri sono in inglese (`zone`, `date`), e in
 * un'API la coerenza conta più della lingua.
 *
 * **Le zone del catalogo escono in forma di dati** (`toApiZone`): tutti i numeri, nessuna frase
 * scritta per l'interfaccia. Il perché, e il peso che avrebbe il dettaglio completo, è spiegato
 * in `src/lib/api/mpi.ts`.
 *
 * **`modelOnly` su ogni zona.** Vero quando la zona non ha nessuna stazione meteo reale vicina:
 * l'app la chiama «anteprima, solo modello» e non le concede mai «stima solida». Senza questo
 * campo, chi usa l'API prenderebbe per solida una stima fatta di solo modello. Nel riepilogo
 * nazionale (`region=all`) è `null` per una zona la cui regione non si è potuta leggere: meglio
 * «non lo so» che un'indovinata.
 *
 * **`v1` nell'indirizzo, non solo `schemaVersion` nel corpo.** Il numero nel corpo dice a chi
 * legge già la risposta se il contratto è quello atteso; il numero nell'indirizzo permette di
 * pubblicarne uno nuovo (`/api/v2/mpi`) senza rompere chi punta ancora a questo, il giorno in cui
 * la forma cambierà davvero.
 */
export const revalidate = 3600

/*
 * `revalidate` da solo non bastava: la rotta legge `request.url` (i parametri), quindi è
 * dinamica, e ogni risposta usciva con `max-age=0` e un MISS in CDN — un ricalcolo per ogni
 * chiamata a dati che cambiano una volta al giorno. L'intestazione esplicita fa tenere alla CDN
 * di Vercel una copia per URL (parametri compresi) per un'ora, e per un giorno ancora le permette
 * di servirla scaduta mentre la rinnova in background.
 */
const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
} as const

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, status === 200 ? { headers: CACHE_HEADERS } : { status })
}

/** Le intestazioni di uno snapshot, senza le zone. */
function meta(snapshot: Snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    algorithmVersion: snapshot.algorithmVersion,
    referenceDate: snapshot.referenceDate,
    sources: snapshot.sources,
  }
}

/*
 * Quali zone nazionali hanno una stazione vicina, per il riepilogo `region=all`.
 *
 * L'indice nazionale è leggero apposta e non porta le stazioni: per saperlo bisogna leggere i
 * file delle regioni. Si fa una volta per istanza — i file sono statici, cambiano solo con un
 * nuovo deploy — e la CDN tiene comunque la risposta per un'ora. Una regione che non si riesce a
 * leggere lascia le sue zone fuori dalla mappa, e la risposta dirà `null`, non `true`.
 */
let stationsByCode: Promise<ReadonlyMap<string, boolean>> | null = null

function readStations(slugs: readonly string[]): Promise<ReadonlyMap<string, boolean>> {
  stationsByCode ??= (async () => {
    const map = new Map<string, boolean>()
    for (const slug of slugs) {
      const region = await loadRegion(slug)
      for (const zone of region?.zones ?? []) map.set(zone.code, zone.stations.length > 0)
    }
    return map
  })()
  return stationsByCode
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const zoneCode = url.searchParams.get('zone')
  const date = url.searchParams.get('date')
  const region = url.searchParams.get('region')

  if (region === 'all') {
    if (date !== null) {
      return json({
        error:
          'Il riepilogo nazionale porta solo il valore di oggi. Per un giorno preciso chiedi una ' +
          'regione, es. ?region=toscana&date=' + date,
      }, 400)
    }
    const [index, snapshot] = await Promise.all([loadItaliaIndex(), loadSnapshot()])
    const stations = await readStations(index.regions.map((r) => r.slug))
    const entries = zoneCode === null ? index.zones : index.zones.filter((z) => z.code === zoneCode)
    return json({
      schemaVersion: snapshot.schemaVersion,
      generatedAt: index.generatedAt,
      algorithmVersion: index.algorithmVersion,
      referenceDate: index.referenceDate,
      region: 'all',
      regions: index.regions,
      zones: entries.map((entry) => {
        const hasStations = stations.get(entry.code)
        return { ...entry, modelOnly: hasStations === undefined ? null : !hasStations }
      }),
    })
  }

  if (region !== null) {
    const snapshot = await loadRegion(region)
    if (snapshot === null) {
      const index = await loadItaliaIndex()
      return json({
        error: `Regione sconosciuta: ${region}`,
        regions: ['all', ...index.regions.map((r) => r.slug)],
      }, 404)
    }
    const zones = zoneCode === null ? snapshot.zones : snapshot.zones.filter((z) => z.code === zoneCode)
    if (zoneCode !== null && zones.length === 0) {
      return json({ error: `Zona sconosciuta in ${region}: ${zoneCode}` }, 404)
    }
    return json({
      ...meta(snapshot),
      region,
      ...(date === null
        ? { zones: zones.map(toApiZone) }
        : { date, zones: zones.map((z) => zoneOnDate(z, date)) }),
    })
  }

  // Senza `region`: le sette zone di taratura, come sempre.
  const snapshot = await loadSnapshot()

  if (zoneCode !== null) {
    const calibration = snapshot.zones.filter((z) => z.code === zoneCode)
    if (calibration.length > 0) {
      return json(date === null
        ? { ...snapshot, zones: calibration.map((z) => ({ ...z, modelOnly: isModelOnly(z) })) }
        : { ...meta(snapshot), date, zones: calibration.map((z) => zoneOnDate(z, date)) })
    }

    // Non è una zona di taratura: la si cerca nel catalogo nazionale, senza chiedere la regione.
    const index = await loadItaliaIndex()
    const entry = index.zones.find((z) => z.code === zoneCode)
    const regional = entry === undefined ? null : await loadRegion(entry.regionSlug)
    const zone = regional?.zones.find((z) => z.code === zoneCode)
    if (regional === null || zone === undefined || entry === undefined) {
      return json({ error: `Zona sconosciuta: ${zoneCode}` }, 404)
    }
    return json({
      ...meta(regional),
      region: entry.regionSlug,
      ...(date === null ? { zones: [toApiZone(zone)] } : { date, zones: [zoneOnDate(zone, date)] }),
    })
  }

  if (date === null) {
    return json({
      ...snapshot,
      zones: snapshot.zones.map((z) => ({ ...z, modelOnly: isModelOnly(z) })),
      // Per chi arriva qui e cerca il resto d'Italia: dove trovarlo, senza leggere la documentazione.
      moreZones: '/api/v1/mpi?region=all',
    })
  }

  return json({
    ...meta(snapshot),
    date,
    zones: snapshot.zones.map((z) => zoneOnDate(z, date)),
  })
}
