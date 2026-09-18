/**
 * Risolve comune e provincia reali per le sette zone di taratura, contro i confini ISTAT.
 *
 *   npx tsx scripts/ingest-admin-boundaries.ts
 *
 * Scrive `public/data/admin-boundaries.json`, che `scripts/build-snapshot.ts` legge per arricchire
 * ogni zona — non rifetcha 1.9 MB di confini a ogni build dello snapshot, solo quando questo
 * script gira di nuovo (a mano, quando le zone cambiano; non è nel cron giornaliero, i confini
 * comunali non cambiano ogni giorno).
 *
 * Eseguito la prima volta il 17 settembre 2026: ha trovato che `zones.ts` dichiarava "SI" per le
 * Colline Metallifere quando le coordinate della zona cadono a Montieri, provincia di Grosseto.
 * Corretto in `zones.ts` nello stesso commit.
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { ZONES } from '@/lib/config/zones'
import { fetchBoundaries, findMunicipality, BOUNDARIES_URL, BOUNDARIES_LICENSE } from '@/lib/sources/istat-boundaries'

interface AdminBoundaryEntry {
  readonly zoneCode: string
  readonly municipality: string
  readonly province: string
  readonly provinceAcronym: string
  readonly istatCode: string
  readonly matchType: 'exact' | 'nearest-fallback'
}

interface AdminBoundariesFile {
  readonly source: string
  readonly sourceUrl: string
  readonly license: string
  readonly fetchedAt: string
  readonly zones: readonly AdminBoundaryEntry[]
}

async function main(): Promise<void> {
  console.log(`Scarico i confini comunali da ${BOUNDARIES_URL}…`)
  const collection = await fetchBoundaries()
  console.log(`Ricevuti ${collection.features.length} comuni.`)

  const entries: AdminBoundaryEntry[] = []
  for (const zone of ZONES) {
    const match = findMunicipality(zone.longitude, zone.latitude, collection)
    if (match === null) {
      throw new Error(`Nessun comune trovato per la zona ${zone.code}: la collezione è vuota?`)
    }
    const mismatch = match.provinceAcronym !== zone.province
    console.log(
      `${zone.code.padEnd(14)} → ${match.municipality} (${match.provinceAcronym})` +
        (match.matchType === 'nearest-fallback' ? '  [ripiego: nessun poligono esatto]' : '') +
        (mismatch ? `  ⚠ zones.ts dichiara provincia '${zone.province}', non '${match.provinceAcronym}'` : ''),
    )
    entries.push({
      zoneCode: zone.code,
      municipality: match.municipality,
      province: match.province,
      provinceAcronym: match.provinceAcronym,
      istatCode: match.istatCode,
      matchType: match.matchType,
    })
  }

  const out: AdminBoundariesFile = {
    source: 'Confini amministrativi ISTAT (comuni), via guglielmo/geojson-italy',
    sourceUrl: BOUNDARIES_URL,
    license: BOUNDARIES_LICENSE,
    fetchedAt: new Date().toISOString(),
    zones: entries,
  }

  const outPath = path.join(process.cwd(), 'public', 'data', 'admin-boundaries.json')
  await writeFile(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf-8')
  console.log(`Scritto ${outPath}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
