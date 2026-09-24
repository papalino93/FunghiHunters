/**
 * Accenti veri nei testi che arrivano dal modello.
 *
 * I sorgenti del modello (`config/algorithm.ts`, `model/*.ts`) scrivono gli accenti con
 * l'apostrofo ("e'", "piu'", "perche'") per restare in ASCII, e quei testi finiscono nello
 * snapshot e poi nella scheda "Perché": "il massimo atteso e' al giorno 12" letto da un utente è
 * un refuso, non una convenzione. Si corregge qui, al momento di mostrarli, così vale anche per
 * gli snapshot già pubblicati.
 *
 * Solo vocale + apostrofo seguiti da spazio, punteggiatura o fine testo: le elisioni
 * ("l'habitat", "dell'Amiata") hanno una lettera subito dopo e restano come sono.
 */
const TRUNCATED: ReadonlyArray<readonly [RegExp, string]> = [
  // "ché" con l'accento acuto: perché, poiché, affinché, finché, benché.
  [/(perch|poich|affinch|finch|bench|sicch)e'(?=[\s.,;:)!?]|$)/gi, '$1é'],
  [/([a-zA-Z])a'(?=[\s.,;:)!?]|$)/g, '$1à'],
  [/([a-zA-Z])e'(?=[\s.,;:)!?]|$)/g, '$1è'],
  [/(^|[\s(])e'(?=[\s.,;:)!?]|$)/g, '$1è'],
  [/(^|[\s(])E'(?=[\s.,;:)!?]|$)/g, '$1È'],
  [/([a-zA-Z])i'(?=[\s.,;:)!?]|$)/g, '$1ì'],
  // "un po'" è un troncamento con l'apostrofo anche in italiano corretto: resta com'è.
  [/(\b[a-zA-Z]*?)([a-zA-Z])o'(?=[\s.,;:)!?]|$)/g, '$1$2ò'],
  [/([a-zA-Z])u'(?=[\s.,;:)!?]|$)/g, '$1ù'],
]

export function withAccents(text: string): string {
  let out = text
  // "un po'" si protegge prima e si rimette dopo: è l'unico troncamento comune in -o'.
  out = out.replace(/\bpo'/g, '\u0000PO\u0000')
  for (const [pattern, replacement] of TRUNCATED) out = out.replace(pattern, replacement)
  out = out.replace(/\u0000PO\u0000/g, "po'")
  return out
}
