/**
 * Pilota di granularità geografica: genera una griglia reale attorno a una zona e mostra,
 * onestamente, che oggi nessuna cella è valutabile.
 *
 *   npx tsx scripts/pilot-grid.ts amiata
 *
 * Non produce un output usato dall'app: è la prova che il meccanismo funziona (geometria +
 * comune/provincia reali) e che il gate di valutabilità si comporta come richiesto — "le celle
 * senza dati o senza copertura forestale sufficiente devono risultare non valutabili, non
 * favorevoli" — con le fonti disponibili oggi (nessuna maschera forestale, nessun DTM: vedi
 * `docs/CATALOGO-FONTI.md`).
 */

import { ZONES } from '@/lib/config/zones'
import { assessEvaluability, generateGrid } from '@/lib/spatial/grid'
import { fetchBoundaries, findMunicipality } from '@/lib/sources/istat-boundaries'

const RESOLUTION_M = 1000
const RADIUS_KM = 2

async function main(): Promise<void> {
  const zoneCode = process.argv[2] ?? 'amiata'
  const zone = ZONES.find((z) => z.code === zoneCode)
  if (zone === undefined) {
    console.error(`Zona sconosciuta: ${zoneCode}. Zone disponibili: ${ZONES.map((z) => z.code).join(', ')}`)
    process.exitCode = 1
    return
  }

  console.log(`Griglia pilota per ${zone.name}: raggio ${RADIUS_KM} km, celle da ${RESOLUTION_M} m.`)
  const cells = generateGrid({
    zoneCode: zone.code,
    centerLat: zone.latitude,
    centerLon: zone.longitude,
    radiusKm: RADIUS_KM,
    resolutionM: RESOLUTION_M,
  })
  console.log(`Generate ${cells.length} celle.`)

  console.log('Scarico i confini comunali reali per risolvere comune/provincia per cella…')
  const boundaries = await fetchBoundaries()

  const resolved = cells.map((cell) => {
    const match = findMunicipality(cell.centroidLon, cell.centroidLat, boundaries)
    return {
      ...cell,
      adminMunicipality: match?.municipality ?? null,
      adminProvince: match?.province ?? null,
    }
  })

  const municipalities = new Set(resolved.map((c) => c.adminMunicipality).filter((m) => m !== null))
  console.log(`Comuni toccati dalla griglia: ${[...municipalities].join(', ')}`)

  const evaluable = resolved.filter((c) => assessEvaluability(c).status === 'evaluable')
  console.log(
    `Celle valutabili: ${evaluable.length} / ${resolved.length} — ` +
      (evaluable.length === 0
        ? 'corretto: manca la maschera forestale, nessuna cella deve sembrare "favorevole".'
        : 'ATTENZIONE: non dovrebbe succedere finché non è ingerita una fonte di copertura forestale reale.'),
  )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
