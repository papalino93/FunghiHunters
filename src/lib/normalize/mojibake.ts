/**
 * Riparazione della codifica dei testi SIR.
 *
 * L'anagrafica `dati.php?D=json_stations` e' dichiarata `application/json` (quindi UTF-8) ma
 * contiene testo Latin-1 ri-codificato: "Monte di Fo'" con la o accentata arriva come
 * `Monte di FÃ²`. Non e' un dettaglio estetico, perche' i nomi delle stazioni finiscono nella UI
 * e nelle ricerche.
 *
 * La riparazione e' volutamente conservativa: se non e' chiaramente mojibake, o se il risultato
 * non e' migliore dell'originale, si restituisce l'originale. Meglio un accento sbagliato che un
 * nome corrotto in modo nuovo.
 */

/** Sequenze che compaiono quando UTF-8 viene letto come Latin-1. */
const MOJIBAKE_MARKERS = /[ÃÂ]["'-¿–—€ -ÿ]/u

/** Caratteri che non dovrebbero mai comparire in un nome di stazione riparato. */
const REPLACEMENT_CHAR = '�'

/**
 * `true` se la stringa mostra i segni tipici di UTF-8 interpretato come Latin-1.
 * Non garantisce che la riparazione riesca: e' solo il filtro che evita di toccare testo sano.
 */
export function looksLikeMojibake(text: string): boolean {
  return MOJIBAKE_MARKERS.test(text)
}

/**
 * Ripara una stringa mojibake, oppure restituisce l'originale se la riparazione non e' sicura.
 *
 * @example
 * repairMojibake('Monte di FÃ²') // 'Monte di Fò'
 * repairMojibake('Abbadia S. Salvatore') // invariata
 */
export function repairMojibake(text: string): string {
  if (text === '' || !looksLikeMojibake(text)) return text

  let repaired: string
  try {
    repaired = Buffer.from(text, 'latin1').toString('utf8')
  } catch {
    return text
  }

  // Una riparazione riuscita non introduce caratteri di sostituzione e non lascia marcatori.
  if (repaired.includes(REPLACEMENT_CHAR)) return text
  if (looksLikeMojibake(repaired)) return text
  // Se l'andata e ritorno non torna all'originale, non stiamo invertendo la codifica giusta.
  if (Buffer.from(repaired, 'utf8').toString('latin1') !== text) return text

  return repaired
}
