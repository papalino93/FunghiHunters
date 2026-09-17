/**
 * Normalizzazione dei valori grezzi.
 *
 * Il SIR restituisce i valori come **stringhe**, con `null` possibile, e in alcuni casi con
 * stringhe vuote o segnaposto. Una conversione ingenua con `Number()` trasforma `""` in `0`,
 * che in una serie di pioggia e' un errore silenzioso e indistinguibile da un giorno secco.
 */

/** Stringhe che la fonte usa per dire "non ho il dato". */
const MISSING_TOKENS = new Set(['', '-', '--', 'n.d.', 'nd', 'null', 'NULL', 'NaN'])

/**
 * Converte un valore grezzo in numero, oppure `null` se il dato manca.
 * Non inventa mai uno zero.
 */
export function parseNumeric(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null

  const trimmed = raw.trim()
  if (MISSING_TOKENS.has(trimmed)) return null

  // La virgola come separatore decimale non compare negli endpoint verificati, ma costa poco
  // tollerarla e molto scoprirla in produzione.
  const parsed = Number(trimmed.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

/** Normalizza un campo testuale opzionale: stringa vuota e spazi diventano `null`. */
export function parseText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}
