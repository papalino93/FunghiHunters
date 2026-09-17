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
  const accent =
    verdict.tone === 'good'
      ? 'border-accent/40 bg-accent/10'
      : verdict.tone === 'worth'
        ? 'border-accent/30 bg-accent/[0.06]'
        : verdict.tone === 'weak'
          ? 'border-warn/30 bg-warn/[0.06]'
          : 'border-edge bg-surface-1'

  return (
    <section className={`rounded-xl border p-4 ${accent}`} aria-labelledby="verdetto">
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
