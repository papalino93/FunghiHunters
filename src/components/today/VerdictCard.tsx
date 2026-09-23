'use client'

import type { Verdict } from '@/lib/recommend/verdict'

/**
 * La risposta, prima di tutto il resto.
 *
 * È la correzione al difetto principale della versione precedente: si apriva l'app e la prima
 * cosa che si leggeva era «Garfagnana 24», che non risponde a nulla. Ventiquattro rispetto a
 * cosa? esco o no?
 *
 * Qui la prima riga è la decisione, la seconda il motivo con i numeri dentro la frase, la terza
 * cosa succede nei prossimi giorni. I punteggi vengono dopo, per chi li vuole verificare.
 */
export function VerdictCard({ verdict }: { verdict: Verdict }) {
  /*
   * Un sì detto dal solo modello non prende il verde pieno: il colore è la prima cosa che si
   * legge, prima ancora del titolo, e deve dire la stessa cosa delle parole.
   */
  const tone = verdict.modelOnly && verdict.tone === 'good' ? 'worth' : verdict.tone
  const accent =
    tone === 'good'
      ? 'border-accent/40 bg-accent/10'
      : tone === 'worth'
        ? 'border-accent/30 bg-accent/[0.06]'
        : tone === 'weak'
          ? 'border-warn/30 bg-warn/[0.06]'
          : 'border-edge bg-surface-1'

  return (
    <section className={`rounded-xl border p-4 ${accent}`} aria-labelledby="verdetto">
      {verdict.modelOnly && (
        <p className="mb-2 inline-flex items-center rounded-full border border-warn/40 bg-warn/10 px-2.5 py-0.5 text-xs font-medium text-ink">
          Anteprima · stima da modello, non verificata da stazioni
        </p>
      )}
      <h2 id="verdetto" className="text-2xl font-semibold leading-tight tracking-tight text-ink">
        {verdict.headline}
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-ink-dim">{verdict.reason}</p>

      {verdict.outlook !== null && (
        <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{verdict.outlook}</p>
      )}

      {verdict.advice !== null && (
        <p className="mt-3 border-t border-edge pt-3 text-sm leading-relaxed text-ink">
          {verdict.advice}
        </p>
      )}
    </section>
  )
}
