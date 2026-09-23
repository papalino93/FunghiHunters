/**
 * Segnalazioni della pipeline che si vedono anche senza aprire i log.
 *
 * Una riga `console.warn` sepolta a meta' di un log da un'ora di lotti Open-Meteo e' una
 * segnalazione che nessuno legge: il giorno in cui il SIR non risponde lo snapshot esce lo stesso,
 * degradato, e la corsa resta verde. Su GitHub Actions una riga nel formato `::warning::` /
 * `::error::` diventa invece un'annotazione in cima alla pagina della corsa, e il riepilogo
 * (`GITHUB_STEP_SUMMARY`) resta leggibile dalla lista delle esecuzioni. Fuori da Actions (in locale)
 * resta una riga di log normale: nessuna dipendenza, nessun servizio esterno.
 */

import { appendFileSync } from 'node:fs'

export type CiLevel = 'warning' | 'error'

/**
 * I comandi di workflow di GitHub trattano `%`, `\r` e `\n` come delimitatori: vanno codificati,
 * o un messaggio su piu' righe verrebbe troncato alla prima. Nel titolo (una proprieta') contano
 * anche `:` e `,`.
 */
export function escapeData(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

export function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C')
}

/** La riga da stampare: annotazione su Actions, testo semplice altrove. Pura, per i test. */
export function formatAnnotation(
  level: CiLevel,
  title: string,
  message: string,
  onActions: boolean,
): string {
  return onActions
    ? `::${level} title=${escapeProperty(title)}::${escapeData(message)}`
    : `[${level === 'error' ? 'ERRORE' : 'ATTENZIONE'}] ${title}: ${message}`
}

function onGithubActions(): boolean {
  return process.env.GITHUB_ACTIONS === 'true'
}

/** Stampa l'annotazione e, su Actions, la aggiunge al riepilogo della corsa. */
export function annotate(level: CiLevel, title: string, message: string): void {
  const actions = onGithubActions()
  const line = formatAnnotation(level, title, message, actions)
  if (level === 'error') console.error(line)
  else console.warn(line)

  const summary = process.env.GITHUB_STEP_SUMMARY
  if (actions && summary !== undefined && summary !== '') {
    try {
      appendFileSync(summary, `- **${level === 'error' ? 'Errore' : 'Attenzione'} — ${title}**: ${message}\n`)
    } catch {
      // Il riepilogo e' un di piu': non riuscire a scriverlo non deve far fallire lo snapshot.
    }
  }
}
