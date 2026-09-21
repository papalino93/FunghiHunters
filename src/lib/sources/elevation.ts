/**
 * Quota del terreno di un elenco di punti, da Open-Meteo.
 *
 * Vive qui, e non dentro lo script che ha creato il catalogo, perche' i consumatori sono due: la
 * prima costruzione delle zone (`scripts/ingest-zones-italia.ts`) e lo spostamento del punto di
 * calcolo dentro il bosco (`scripts/ingest-forest-italia.ts --relocate`), che muovendo il punto
 * deve per forza rileggerne la quota — altrimenti il punto sarebbe quello del bosco e la quota
 * quella del crinale, che e' esattamente il bug che sta correggendo.
 */

import { fetchJson } from '@/lib/sources/http'
import { RatePacer } from '@/lib/sources/open-meteo-rate'

/** L'API elevazione di Open-Meteo accetta al massimo 100 coordinate per richiesta. */
export const ELEVATION_BATCH = 100
export const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation'

/**
 * Peso di una coordinata sull'API elevazione: uno.
 *
 * Non e' documentato, e' misurato. Il 21/09/2026 sei richieste da 100 coordinate hanno esaurito
 * esattamente il limite di 600 al minuto: il multi-localita' non e' uno sconto, ogni punto conta
 * come una chiamata. Da qui l'attesa fra un lotto e l'altro, altrimenti la settima richiesta
 * prende 429 — che e' precisamente come e' andata la prima volta.
 */
export const ELEVATION_WEIGHT_PER_POINT = 1

export interface ElevationPoint {
  /** Chiave con cui il chiamante ritrovera' la quota: codice ISTAT, codice zona, quello che vuole. */
  readonly key: string
  readonly latitude: number
  readonly longitude: number
}

export async function resolveElevations(
  points: readonly ElevationPoint[],
  log: (message: string) => void = console.log,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  // Un'ora di attesa massima per lotto: la finestra oraria e' 5.000, quindi con 7.500 candidati
  // la corsa deve per forza scavallare un'ora. Meglio che dorma qui, dichiarandolo, che fallire.
  const pacer = new RatePacer({ maxWaitMs: 65 * 60_000 })
  let sleptMs = 0
  for (let i = 0; i < points.length; i += ELEVATION_BATCH) {
    const batch = points.slice(i, i + ELEVATION_BATCH)
    const waited = await pacer.reserve(batch.length * ELEVATION_WEIGHT_PER_POINT)
    if (waited > 0) {
      sleptMs += waited
      log(`  pausa di ${Math.round(waited / 1000)} s per restare nei limiti Open-Meteo`)
    }
    const params = new URLSearchParams({
      latitude: batch.map((p) => p.latitude).join(','),
      longitude: batch.map((p) => p.longitude).join(','),
    })
    const payload = await fetchJson<{ elevation: Array<number | null> }>(
      `${ELEVATION_URL}?${params.toString()}`,
      { timeoutMs: 60_000 },
    )
    if (payload.elevation.length !== batch.length) {
      // Un disallineamento assegnerebbe la quota di un comune a un altro: meglio fermarsi.
      throw new Error(
        `Elevazioni ricevute ${payload.elevation.length} per ${batch.length} punti richiesti`,
      )
    }
    for (const [j, point] of batch.entries()) {
      const value = payload.elevation[j]
      if (value !== null && value !== undefined) out.set(point.key, Math.round(value))
    }
    log(`  quote risolte: ${Math.min(i + ELEVATION_BATCH, points.length)}/${points.length}`)
  }
  if (sleptMs > 0) log(`  attesa totale per i limiti: ${Math.round(sleptMs / 60_000)} min`)
  return out
}
