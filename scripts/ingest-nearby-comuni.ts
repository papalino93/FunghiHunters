/**
 * Comuni reali entro un raggio dal punto di riferimento di ogni zona, contro i confini ISTAT.
 *
 *   npx tsx scripts/ingest-nearby-comuni.ts
 *
 * Scrive `public/data/nearby-comuni.json`, letto da `scripts/build-snapshot.ts`.
 *
 * **Perché questo file esiste.** Le sette zone di taratura sono punti, non poligoni (vedi
 * `zones.ts`): "Garfagnana" non ha un confine ufficiale, è un nome storico-geografico. Dire
 * all'utente "vai qui" con un pin esatto sarebbe inventare una precisione che il modello non ha —
 * nessuna fonte reale lega coordinate GPS a ritrovamenti di porcino. Ma i comuni reali entro un
 * raggio ragionevole dal punto sono un dato verificabile, utile per orientarsi senza fabbricare
 * nulla: stesso principio del pilota di granularità geografica (D8 in DECISIONS.md), applicato ai
 * toponimi invece che alla griglia.
 *
 * **Raggio.** 15 km, scelto perché copre l'area che un cercatore percorrerebbe in giornata da un
 * punto di riferimento in montagna, senza dilatarsi fino a comuni che con quella zona non hanno
 * più nulla a che fare. È un parametro dichiarato, non calibrato: se si rivela sbagliato in campo,
 * si cambia qui.
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { ZONES } from '@/lib/config/zones'
import {
  fetchBoundaries,
  nearbyMunicipalities,
  BOUNDARIES_URL,
  BOUNDARIES_LICENSE,
} from '@/lib/sources/istat-boundaries'

const RADIUS_KM = 15

interface NearbyEntry {
  readonly municipality: string
  readonly province: string
  readonly provinceAcronym: string
  readonly distanceKm: number
}

interface NearbyComuniFile {
  readonly source: string
  readonly sourceUrl: string
  readonly license: string
  readonly radiusKm: number
  readonly fetchedAt: string
  readonly zones: Readonly<Record<string, readonly NearbyEntry[]>>
}

async function main(): Promise<void> {
  console.log(`Scarico i confini comunali da ${BOUNDARIES_URL}…`)
  const collection = await fetchBoundaries()
  console.log(`Ricevuti ${collection.features.length} comuni.`)

  const zones: Record<string, NearbyEntry[]> = {}
  for (const zone of ZONES) {
    const nearby = nearbyMunicipalities(zone.longitude, zone.latitude, collection, RADIUS_KM)
    zones[zone.code] = nearby.map((m) => ({
      municipality: m.municipality,
      province: m.province,
      provinceAcronym: m.provinceAcronym,
      distanceKm: Math.round(m.distanceKm * 10) / 10,
    }))
    console.log(
      `${zone.code.padEnd(14)} → ${nearby.map((m) => `${m.municipality} (${m.distanceKm.toFixed(1)} km)`).join(', ') || '— nessuno entro il raggio —'}`,
    )
  }

  const out: NearbyComuniFile = {
    source: 'Confini amministrativi ISTAT (comuni), via guglielmo/geojson-italy',
    sourceUrl: BOUNDARIES_URL,
    license: BOUNDARIES_LICENSE,
    radiusKm: RADIUS_KM,
    fetchedAt: new Date().toISOString(),
    zones,
  }

  const outPath = path.join(process.cwd(), 'public', 'data', 'nearby-comuni.json')
  await writeFile(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf-8')
  console.log(`Scritto ${outPath}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
