'use client'

import type { CalibrationReport } from '@/lib/diary/calibration'
import { mpiColor } from '@/lib/ui/scale'

/**
 * Il modello ci prende?
 *
 * Sotto la soglia minima non mostra statistiche ma dice quante uscite mancano. Una regressione su
 * tre punti sembra scienza e non lo è, e in un'app che vende onestà sui dati sarebbe il posto
 * peggiore dove barare.
 */
export function CalibrationPanel({ report }: { report: CalibrationReport }) {
  const maxCount = Math.max(1, ...report.bands.map((b) => b.count))

  return (
    <section className="rounded-xl border border-edge bg-surface-1 p-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        Il punteggio ci prende?
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">{report.verdict}</p>

      {report.usable > 0 && (
        <>
          <ul className="mt-3 space-y-1.5">
            {report.bands.map((band) => (
              <li key={band.label} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: mpiColor((band.from + band.to) / 2) }}
                />
                <span className="w-28 shrink-0 truncate text-[11px] text-ink-dim">
                  {band.label}
                </span>
                <span className="relative h-4 flex-1 overflow-hidden rounded bg-surface-2">
                  {band.count > 0 && (
                    <span
                      className="absolute inset-y-0 left-0 rounded bg-accent/40"
                      style={{ width: `${(band.count / maxCount) * 100}%` }}
                    />
                  )}
                </span>
                <span className="tabular w-16 shrink-0 text-right text-[11px] text-ink-faint">
                  {band.count === 0
                    ? '—'
                    : `${band.count} · ${(band.successRate * 100).toFixed(0)}%`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-ink-faint">
            Per ogni fascia di punteggio previsto: quante uscite e in quante hai trovato almeno
            qualcosa. Se la percentuale non cresce scendendo verso il basso, il punteggio non sta
            ordinando nulla.
          </p>
        </>
      )}

      {report.hasSignal && report.rankCorrelation !== null && (
        <p className="mt-2 border-t border-edge pt-2 text-[11px] text-ink-faint">
          Correlazione di rango fra previsto e osservato:{' '}
          <span className="tabular text-ink-dim">{report.rankCorrelation.toFixed(2)}</span>. Di
          rango e non lineare, perché &laquo;molti&raquo; non è il doppio di &laquo;discreti&raquo;.
        </p>
      )}
    </section>
  )
}
