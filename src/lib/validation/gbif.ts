/**
 * Le presenze di porcino da GBIF, ripulite per il backtest caso-controllo.
 *
 * Funzioni pure: lo script `scripts/backtest-gbif.ts` scarica le pagine, qui si decide quali
 * record valgono come "caso". Ogni scarto porta un motivo, e i motivi si contano: un backtest che
 * dice "907 record, ne ho usati 310" senza dire perche' non si puo' ricontrollare.
 *
 * DECISIONE SULL'INCERTEZZA DELLE COORDINATE (dichiarata anche in docs/VALIDAZIONE.md).
 * Si accetta un record con `coordinateUncertaintyInMeters` <= 2000 m. Senza incertezza si accetta
 * **solo** se viene dal dataset iNaturalist research-grade e le coordinate non sono state
 * oscurate (`informationWithheld` vuoto): GBIF importa da iNaturalist solo le osservazioni
 * research-grade, e quelle senza accuratezza sono in genere un punto messo a mano sulla mappa, non
 * una coordinata inventata. Gli altri dataset senza incertezza si scartano: li' "mancante" puo'
 * voler dire il centroide di un comune. Le osservazioni oscurate (incertezza portata a ~27 km su
 * richiesta dell'osservatore, circa meta' dei record iNaturalist) si scartano sempre: 27 km sono
 * tre celle della griglia meteo, e il caso finirebbe su un crinale qualunque.
 */

import { distanceKm } from '@/lib/qc/checks'
import { type Rng, shuffled } from '@/lib/validation/rng'

export const GBIF_SEARCH_URL = 'https://api.gbif.org/v1/occurrence/search'

/** Boletus edulis s.l.: i quattro porcini, con le chiavi del backbone GBIF. */
export const PORCINI_TAXA = {
  5954958: 'Boletus edulis',
  8733688: 'Boletus aereus',
  5954691: 'Boletus reticulatus',
  5954949: 'Boletus pinophilus',
} as const

/** Dataset "iNaturalist Research-grade Observations" su GBIF. */
export const INATURALIST_DATASET_KEY = '50c9509d-22c7-4a22-a47d-8c48425ef4a7'

export const GBIF_PAGE_SIZE = 300

export const CASE_YEARS = { from: 2016, to: 2025 } as const
export const CASE_MONTHS = { from: 5, to: 11 } as const
export const MAX_UNCERTAINTY_M = 2000

/** URL di una pagina di ricerca GBIF, con i filtri che GBIF sa gia' applicare lato server. */
export function gbifSearchUrl(taxonKey: number, offset: number, limit = GBIF_PAGE_SIZE): string {
  const params = new URLSearchParams({
    country: 'IT',
    taxonKey: String(taxonKey),
    hasCoordinate: 'true',
    hasGeospatialIssue: 'false',
    occurrenceStatus: 'PRESENT',
    year: `${CASE_YEARS.from},${CASE_YEARS.to}`,
    month: `${CASE_MONTHS.from},${CASE_MONTHS.to}`,
    limit: String(limit),
    offset: String(offset),
  })
  return `${GBIF_SEARCH_URL}?${params.toString()}`
}

/** Il sottoinsieme dei campi GBIF che ci serve. Tutto opzionale: GBIF omette i campi vuoti. */
export interface GbifOccurrence {
  readonly key: number
  readonly datasetKey?: string
  readonly basisOfRecord?: string
  readonly occurrenceStatus?: string
  readonly taxonKey?: number
  readonly acceptedTaxonKey?: number
  readonly species?: string
  readonly decimalLatitude?: number
  readonly decimalLongitude?: number
  readonly coordinateUncertaintyInMeters?: number
  readonly informationWithheld?: string
  readonly eventDate?: string
  readonly year?: number
  readonly month?: number
  readonly day?: number
  readonly elevation?: number
  readonly stateProvince?: string
  readonly issues?: readonly string[]
}

export interface GbifPage {
  readonly offset: number
  readonly limit: number
  readonly endOfRecords: boolean
  readonly count: number
  readonly results: readonly GbifOccurrence[]
}

/** Una presenza accettata come caso. */
export interface PresenceRecord {
  readonly gbifKey: number
  readonly datasetKey: string
  readonly species: string
  readonly latitude: number
  readonly longitude: number
  /** `null` quando manca (ammesso solo per iNaturalist research-grade, vedi sopra). */
  readonly uncertaintyM: number | null
  readonly date: string
  readonly year: number
  readonly month: number
  readonly region: string
  /** Quota dichiarata dal record, quasi sempre assente. */
  readonly elevationM: number | null
}

export type RejectReason =
  | 'basis'
  | 'coordinates'
  | 'coordinate-issue'
  | 'uncertainty-large'
  | 'uncertainty-missing'
  | 'obscured'
  | 'date-imprecise'
  | 'out-of-period'

export type AcceptResult =
  | { readonly ok: true; readonly record: PresenceRecord }
  | { readonly ok: false; readonly reason: RejectReason }

/** Problemi di coordinate che rendono il punto inutilizzabile, qualunque sia l'incertezza. */
const BAD_COORDINATE_ISSUES = new Set([
  'ZERO_COORDINATE',
  'COORDINATE_OUT_OF_RANGE',
  'COUNTRY_COORDINATE_MISMATCH',
  'COORDINATE_INVALID',
  'PRESUMED_SWAPPED_COORDINATE',
  'PRESUMED_NEGATED_LATITUDE',
  'PRESUMED_NEGATED_LONGITUDE',
])

/**
 * Nomi delle regioni come li scrive GBIF, a volte in inglese: "Sicily" e "Sicilia" devono finire
 * nello stesso strato, altrimenti il campionamento stratificato conta due regioni dove ce n'e' una.
 */
const REGION_ALIASES: Readonly<Record<string, string>> = {
  Sicily: 'Sicilia',
  Sardinia: 'Sardegna',
  Tuscany: 'Toscana',
  Lombardy: 'Lombardia',
  Piedmont: 'Piemonte',
  Apulia: 'Puglia',
  'Aosta Valley': "Valle d'Aosta",
  'Trentino-South Tyrol': 'Trentino-Alto Adige',
  'Trentino-Alto Adige/Südtirol': 'Trentino-Alto Adige',
  'Friuli Venezia Giulia': 'Friuli-Venezia Giulia',
}

export function normaliseRegion(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === '') return 'ignota'
  const trimmed = raw.trim()
  return REGION_ALIASES[trimmed] ?? trimmed
}

/**
 * La data del record, se e' precisa al giorno.
 *
 * `eventDate` puo' essere un intervallo ("2019-09-01/2019-09-30"): quello non e' un giorno di
 * fruttificazione, e' un mese, e il modello lavora a giorno. Un intervallo si accetta solo se
 * inizio e fine sono lo stesso giorno.
 */
export function dayPreciseDate(o: GbifOccurrence): string | null {
  const raw = o.eventDate
  if (raw === undefined || o.year === undefined || o.month === undefined || o.day === undefined) {
    return null
  }
  const [start, end] = raw.split('/')
  const startDay = start?.slice(0, 10)
  if (startDay === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(startDay)) return null
  if (end !== undefined && end.slice(0, 10) !== startDay) return null
  const fromFields =
    `${o.year}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')}`
  // Se i campi separati e la stringa non coincidono, GBIF ha reinterpretato qualcosa: meglio non fidarsi.
  return fromFields === startDay ? startDay : null
}

export function acceptOccurrence(o: GbifOccurrence): AcceptResult {
  if (o.basisOfRecord === 'FOSSIL_SPECIMEN' || o.basisOfRecord === 'LIVING_SPECIMEN') {
    return { ok: false, reason: 'basis' }
  }
  const lat = o.decimalLatitude
  const lon = o.decimalLongitude
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, reason: 'coordinates' }
  }
  if ((o.issues ?? []).some((issue) => BAD_COORDINATE_ISSUES.has(issue))) {
    return { ok: false, reason: 'coordinate-issue' }
  }
  if (o.informationWithheld !== undefined && o.informationWithheld.trim() !== '') {
    return { ok: false, reason: 'obscured' }
  }
  const uncertainty = o.coordinateUncertaintyInMeters
  if (uncertainty === undefined || uncertainty === null) {
    if (o.datasetKey !== INATURALIST_DATASET_KEY) return { ok: false, reason: 'uncertainty-missing' }
  } else if (uncertainty > MAX_UNCERTAINTY_M) {
    return { ok: false, reason: 'uncertainty-large' }
  }
  const date = dayPreciseDate(o)
  if (date === null) return { ok: false, reason: 'date-imprecise' }
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  if (
    year < CASE_YEARS.from ||
    year > CASE_YEARS.to ||
    month < CASE_MONTHS.from ||
    month > CASE_MONTHS.to
  ) {
    return { ok: false, reason: 'out-of-period' }
  }
  return {
    ok: true,
    record: {
      gbifKey: o.key,
      datasetKey: o.datasetKey ?? 'ignoto',
      species: o.species ?? 'Boletus sp.',
      latitude: lat,
      longitude: lon,
      uncertaintyM: uncertainty ?? null,
      date,
      year,
      month,
      region: normaliseRegion(o.stateProvince),
      elevationM: o.elevation ?? null,
    },
  }
}

/**
 * Un solo record per giorno entro `radiusKm`.
 *
 * Tre persone che fotografano lo stesso porcino, o una che ne carica cinque dello stesso cesto,
 * sono **un** caso: contarli cinque volte darebbe a quel giorno il peso di cinque giorni diversi.
 * Si tiene il record con l'incertezza migliore; a parita', la chiave GBIF piu' bassa (stabile).
 */
export function dedupeSameDay(
  records: readonly PresenceRecord[],
  radiusKm = 1,
): PresenceRecord[] {
  const ranked = [...records].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.uncertaintyM ?? Number.POSITIVE_INFINITY) - (b.uncertaintyM ?? Number.POSITIVE_INFINITY) ||
      a.gbifKey - b.gbifKey,
  )
  const kept: PresenceRecord[] = []
  for (const r of ranked) {
    const duplicate = kept.some(
      (k) =>
        k.date === r.date && distanceKm(k.latitude, k.longitude, r.latitude, r.longitude) < radiusKm,
    )
    if (!duplicate) kept.push(r)
  }
  return kept
}

/** Un caso assegnato a una localita' (gruppo di record entro un chilometro dal seme). */
export interface LocatedRecord extends PresenceRecord {
  readonly locationId: string
}

/**
 * Raggruppa i record in localita': il primo record non assegnato fa da seme, e tutti quelli entro
 * `radiusKm` dal seme entrano nella stessa localita', in qualunque anno.
 *
 * Serve per i controlli: "almeno 20 giorni da qualunque caso **in quella localita'**" ha senso
 * solo se due foto a 300 m l'una dall'altra sono la stessa localita'. L'ordine dei semi e'
 * deterministico (per chiave GBIF) perche' il raggruppamento greedy dipende dall'ordine.
 */
export function assignLocations(
  records: readonly PresenceRecord[],
  radiusKm = 1,
): LocatedRecord[] {
  const sorted = [...records].sort((a, b) => a.gbifKey - b.gbifKey)
  const seeds: { id: string; lat: number; lon: number }[] = []
  return sorted.map((r) => {
    let seed = seeds.find((s) => distanceKm(s.lat, s.lon, r.latitude, r.longitude) < radiusKm)
    if (seed === undefined) {
      seed = { id: `L${String(seeds.length + 1).padStart(4, '0')}`, lat: r.latitude, lon: r.longitude }
      seeds.push(seed)
    }
    return { ...r, locationId: seed.id }
  })
}

/**
 * L'unita' del backtest: una localita' in un anno.
 *
 * E' anche l'unita' della chiamata meteo (una richiesta per localita'-anno) e del bootstrap: i
 * casi e i controlli della stessa localita'-anno condividono la stessa serie meteo, quindi non
 * sono indipendenti e vanno ricampionati insieme.
 */
export interface LocationYear {
  readonly id: string
  readonly locationId: string
  readonly year: number
  /** Punto della richiesta meteo: il primo caso (per chiave GBIF) della localita'-anno. */
  readonly latitude: number
  readonly longitude: number
  readonly region: string
  /** Mese del primo caso dell'anno, usato solo per stratificare il campione. */
  readonly firstMonth: number
  readonly cases: readonly LocatedRecord[]
}

export function buildLocationYears(records: readonly LocatedRecord[]): LocationYear[] {
  const groups = new Map<string, LocatedRecord[]>()
  for (const r of records) {
    const id = `${r.locationId}-${r.year}`
    const list = groups.get(id) ?? []
    list.push(r)
    groups.set(id, list)
  }
  const out: LocationYear[] = []
  for (const [id, list] of groups) {
    const byKey = [...list].sort((a, b) => a.gbifKey - b.gbifKey)
    const byDate = [...list].sort((a, b) => a.date.localeCompare(b.date))
    const anchor = byKey[0]
    const first = byDate[0]
    if (anchor === undefined || first === undefined) continue
    out.push({
      id,
      locationId: anchor.locationId,
      year: anchor.year,
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      region: anchor.region,
      firstMonth: first.month,
      cases: byDate,
    })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Campione stratificato a giro: si mescola ogni strato con il seme, poi si prende un elemento per
 * strato a turno finche' non si arriva a `n` o gli strati sono vuoti.
 *
 * E' allocazione **uguale** per strato, non proporzionale, ed e' voluto: GBIF in Italia e' per
 * meta' Trentino, e un campione proporzionale misurerebbe il modello sulle Dolomiti. Il costo e'
 * che il campione non rappresenta la distribuzione delle segnalazioni: si dichiara.
 */
export function stratifiedSample<T>(
  items: readonly T[],
  n: number,
  stratumOf: (item: T) => string,
  rng: Rng,
): T[] {
  if (n >= items.length) return [...items]
  const strata = new Map<string, T[]>()
  for (const item of items) {
    const key = stratumOf(item)
    const list = strata.get(key) ?? []
    list.push(item)
    strata.set(key, list)
  }
  // Ordine degli strati mescolato anch'esso: altrimenti all'ultimo giro vincerebbero sempre gli
  // strati con il nome alfabeticamente piu' basso.
  const queues = shuffled(
    [...strata.keys()].sort().map((key) => shuffled(strata.get(key) ?? [], rng)),
    rng,
  )
  const out: T[] = []
  while (out.length < n) {
    let progressed = false
    for (const queue of queues) {
      const next = queue.shift()
      if (next === undefined) continue
      out.push(next)
      progressed = true
      if (out.length >= n) break
    }
    if (!progressed) break
  }
  return out
}
