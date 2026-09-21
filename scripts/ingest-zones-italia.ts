/**
 * Costruisce il catalogo nazionale delle zone, regione per regione.
 *
 *   npx tsx scripts/ingest-zones-italia.ts
 *   npx tsx scripts/ingest-zones-italia.ts --min-elevation 600 --max-zones 1200
 *
 * Scrive `public/data/zones-italia.json`. Non gira nel cron giornaliero: i confini comunali e la
 * quota del terreno non cambiano, si rigenera solo quando si cambiano i criteri.
 *
 * **Da dove viene ogni campo, perche' nessuno sia inventato.**
 * - nome, provincia, regione, codice ISTAT, geometria → GeoJSON ISTAT nazionale (CC-BY), tutto
 *   dalla stessa feature: unire una seconda tabella sul codice comune aveva gia' fatto sparire la
 *   Sardegna intera, vedi `src/lib/sources/istat-national.ts`
 * - punto di riferimento → centroide dell'anello esterno piu' esteso del comune; approssimazione
 *   dichiarata, vedi `referencePoint` in `src/lib/sources/istat-national.ts`
 * - quota → API elevazione di Open-Meteo, cioe' il terreno reale in quel punto, non l'altitudine
 *   del municipio
 * - tipo di bosco → **nessuna fonte, quindi vuoto.** La Carta Forestale d'Italia (CFI2020, CREA,
 *   vettoriale 1:10.000 nazionale) e' la fonte giusta e non e' ancora integrata: finche' non lo e',
 *   una zona nazionale dichiara di non sapere che bosco ha, invece di ereditare l'etichetta di
 *   un'altra. Le sette zone toscane storiche restano quelle di `zones.ts`, con il bosco verificato
 *   a mano.
 *
 * **Perche' un tetto al numero di zone, e perche' proprio 1200.** Ogni zona e' un punto in piu'
 * nelle richieste giornaliere a Open-Meteo, e il piano gratuito concede 10.000 chiamate pesate al
 * giorno. Con la finestra di 68 giorni dello snapshot una sola localita' pesa circa 4,9
 * (`forecastWeightPerPoint`), quindi 1200 zone costano circa 5.900 a corsa: sta nella giornata con
 * margine per un ritentativo. Il numero non e' piu' una stima prudente ma un conto: il primo
 * tentativo del 21/09/2026 e' fallito con HTTP 429 ed e' servito a misurare il peso vero.
 * Il criterio di selezione, quando il tetto morde, e' dichiarato e riproducibile: si tengono i
 * comuni piu' alti di ciascuna regione, in proporzione a quanti ne ha sopra la soglia — non una
 * scelta a mano, e nessuna regione esclusa del tutto.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { ELEVATION_URL, resolveElevations } from '@/lib/sources/elevation'
import {
  buildCandidates,
  fetchNationalBoundaries,
  NATIONAL_BOUNDARIES_URL,
  NATIONAL_LICENSE,
} from '@/lib/sources/istat-national'

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  return Number.isFinite(value) ? value : fallback
}

export interface ItalianZone {
  readonly code: string
  readonly name: string
  readonly region: string
  readonly province: string
  readonly provinceAcronym: string
  readonly latitude: number
  readonly longitude: number
  readonly elevationM: number
  /** Vuoto finche' la Carta Forestale d'Italia non e' integrata: vedi l'intestazione. */
  readonly forest: readonly string[]
}

interface ZonesFile {
  readonly source: string
  readonly sourceUrls: readonly string[]
  readonly license: string
  readonly generatedAt: string
  readonly criteria: {
    readonly minElevationM: number
    readonly maxZones: number
    readonly selectionRule: string
  }
  readonly zones: readonly ItalianZone[]
}

/**
 * Applica il tetto mantenendo le proporzioni fra regioni.
 *
 * Tagliare le zone piu' basse a livello nazionale avrebbe cancellato quasi per intero le regioni
 * mediterranee, che sono proprio quelle dove vive il porcino nero: la quota tipica del suo bosco e'
 * piu' bassa di quella di una faggeta appenninica. Il tetto quindi si applica dentro ciascuna
 * regione, in proporzione a quante zone quella regione ha sopra la soglia.
 */
export function capByRegion(
  zones: readonly ItalianZone[],
  maxZones: number,
): ItalianZone[] {
  if (zones.length <= maxZones) return [...zones]

  const byRegion = new Map<string, ItalianZone[]>()
  for (const zone of zones) {
    const list = byRegion.get(zone.region) ?? []
    list.push(zone)
    byRegion.set(zone.region, list)
  }

  const ratio = maxZones / zones.length
  const out: ItalianZone[] = []
  for (const [, list] of byRegion) {
    const keep = Math.max(1, Math.round(list.length * ratio))
    const sorted = [...list].sort((a, b) => b.elevationM - a.elevationM)
    out.push(...sorted.slice(0, keep))
  }
  return out.sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name))
}

async function main(): Promise<void> {
  const minElevationM = arg('min-elevation', 600)
  const maxZones = arg('max-zones', 1200)

  console.log(`Scarico i confini comunali nazionali da ${NATIONAL_BOUNDARIES_URL}…`)
  const collection = await fetchNationalBoundaries()
  console.log(`Ricevuti ${collection.features.length} comuni.`)

  const candidates = buildCandidates(collection)
  const regionCount = new Set(candidates.map((c) => c.region)).size
  console.log(`Candidati: ${candidates.length} comuni in ${regionCount} regioni.`)

  console.log('Risolvo la quota del terreno su Open-Meteo…')
  const elevations = await resolveElevations(
    candidates.map((c) => ({ key: c.istatCode, latitude: c.latitude, longitude: c.longitude })),
  )

  const aboveThreshold: ItalianZone[] = []
  for (const candidate of candidates) {
    const elevationM = elevations.get(candidate.istatCode)
    if (elevationM === undefined || elevationM < minElevationM) continue
    aboveThreshold.push({
      code: `it-${candidate.istatCode}`,
      name: candidate.name,
      region: candidate.region,
      province: candidate.province,
      provinceAcronym: candidate.provinceAcronym,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      elevationM,
      forest: [],
    })
  }
  console.log(`Sopra ${minElevationM} m: ${aboveThreshold.length} comuni.`)

  const zones = capByRegion(aboveThreshold, maxZones)
  const keptRegions = new Set(zones.map((z) => z.region)).size
  console.log(`Catalogo finale: ${zones.length} zone in ${keptRegions} regioni.`)

  const file: ZonesFile = {
    source: 'ISTAT (confini comunali, con regione e provincia), Open-Meteo (quota del terreno)',
    sourceUrls: [NATIONAL_BOUNDARIES_URL, ELEVATION_URL],
    license: NATIONAL_LICENSE,
    generatedAt: new Date().toISOString(),
    criteria: {
      minElevationM,
      maxZones,
      selectionRule:
        'Comuni la cui quota del terreno nel punto di riferimento supera la soglia; se il numero ' +
        'eccede il tetto, si tengono i piu\' alti di ciascuna regione in proporzione, mai ' +
        'escludendo del tutto una regione.',
    },
    zones,
  }

  const outPath = path.join(process.cwd(), 'public/data/zones-italia.json')
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
  console.log(`Scritto ${outPath}`)
}

if (process.argv[1]?.includes('ingest-zones-italia')) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
