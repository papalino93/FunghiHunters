/**
 * Il catalogo dei comuni toscani, tutti, colline comprese.
 *
 *   npx tsx scripts/ingest-zones-toscana.ts
 *
 * Scrive `public/data/zones-toscana.json`, con la stessa forma di `zones-italia.json`.
 *
 * **Perche' esiste.** Il catalogo nazionale tiene solo i comuni sopra una quota (e, in Toscana,
 * i 24 piu' alti): e' il tetto imposto dal piano gratuito di Open-Meteo, che con il solo modello
 * meteo non regge tutti i comuni d'Italia. Il 25/09/2026 una segnalazione da Roveta (Scandicci,
 * porcini trovati) ha mostrato il buco: la zona piu' vicina era a 36 km, e il banco di prova GBIF
 * dice che d'autunno il porcino esce anche sotto i 700 m. In Toscana pero' c'e' la rete di
 * pluviometri della Regione (SIR), che il calcolo toscano scarica gia': con quella la pioggia e le
 * temperature vengono dalle misure, e a Open-Meteo resta solo il resto, per pochi giorni.
 *
 * Quale comune diventa davvero una zona lo decide dopo il bosco misurato
 * (`scripts/ingest-forest-italia.ts --catalog toscana`), non la quota: qui si scrivono tutti.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ItalianZone } from '@/../scripts/ingest-zones-italia'
import { ELEVATION_URL, resolveElevations } from '@/lib/sources/elevation'
import {
  buildCandidates,
  fetchNationalBoundaries,
  NATIONAL_BOUNDARIES_URL,
  NATIONAL_LICENSE,
} from '@/lib/sources/istat-national'

export const TUSCANY_ZONES_FILE = 'public/data/zones-toscana.json'

async function main(): Promise<void> {
  console.log(`Scarico i confini comunali da ${NATIONAL_BOUNDARIES_URL}…`)
  const collection = await fetchNationalBoundaries()
  const candidates = buildCandidates(collection).filter((c) => c.region === 'Toscana')
  console.log(`Comuni toscani: ${candidates.length}.`)

  const elevations = await resolveElevations(
    candidates.map((c) => ({ key: c.istatCode, latitude: c.latitude, longitude: c.longitude })),
  )
  const zones: ItalianZone[] = candidates
    .map((c) => ({
      code: `it-${c.istatCode}`,
      name: c.name,
      region: c.region,
      province: c.province,
      provinceAcronym: c.provinceAcronym,
      latitude: c.latitude,
      longitude: c.longitude,
      elevationM: elevations.get(c.istatCode) ?? 0,
      forest: [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))

  const file = {
    source: 'ISTAT (confini comunali), Open-Meteo (quota del terreno)',
    sourceUrls: [NATIONAL_BOUNDARIES_URL, ELEVATION_URL],
    license: NATIONAL_LICENSE,
    generatedAt: new Date().toISOString(),
    criteria: {
      minElevationM: 0,
      maxZones: zones.length,
      selectionRule:
        'Tutti i comuni della Toscana. Quali diventano zone lo decide la copertura di bosco ' +
        'misurata (ForestPaths), non la quota.',
    },
    zones,
  }
  const outPath = path.join(process.cwd(), TUSCANY_ZONES_FILE)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
  console.log(`Scritto ${TUSCANY_ZONES_FILE}: ${zones.length} comuni, quote da ${Math.min(...zones.map((z) => z.elevationM))} a ${Math.max(...zones.map((z) => z.elevationM))} m.`)
}

if (process.argv[1]?.includes('ingest-zones-toscana')) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
