/**
 * Cerca una zona per nome, per il pulsante «Cerca» della mappa.
 *
 * Con la Toscana a 226 zone e l'Italia a 1.404, trovare il proprio comune scorrendo la
 * classifica o strizzando gli occhi sulla mappa non è realistico. La ricerca gira tutta nel
 * browser, sui nomi che la pagina ha già: niente rete, risposta a ogni lettera.
 *
 * Il confronto ignora maiuscole, accenti e apostrofi — «sant anna», «Sant'Anna» e «SANT ANNA»
 * sono la stessa ricerca — e mette prima chi comincia con il testo scritto, poi chi ha una parola
 * che comincia così («stazzema» dà Stazzema prima di Sant'Anna di Stazzema), poi chi lo contiene
 * a metà parola. A parità, il punteggio più alto.
 */

export interface SearchableZone {
  readonly code: string
  readonly name: string
  /** Quota, mostrata accanto al nome nei risultati. */
  readonly elevationM?: number | null
  /** Punteggio del giorno mostrato, per ordinare i pari merito. */
  readonly score: number
}

/** Il nome in forma confrontabile: minuscolo, senza accenti, con apostrofi e trattini come spazi. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`\-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function rank(name: string, query: string): number | null {
  if (name.startsWith(query)) return 0
  const words = name.split(' ')
  if (words.some((_, i) => i > 0 && words.slice(i).join(' ').startsWith(query))) return 1
  if (name.includes(query)) return 2
  return null
}

/** Le zone che corrispondono a `query`, le migliori prima; al massimo `limit`. */
export function searchZones<T extends SearchableZone>(zones: readonly T[], query: string, limit = 8): T[] {
  const q = normalizeName(query)
  if (q.length === 0) return []
  const hits: Array<{ zone: T; rank: number }> = []
  for (const zone of zones) {
    const r = rank(normalizeName(zone.name), q)
    if (r !== null) hits.push({ zone, rank: r })
  }
  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.zone.score - a.zone.score ||
      a.zone.name.localeCompare(b.zone.name, 'it'),
  )
  return hits.slice(0, limit).map((hit) => hit.zone)
}
