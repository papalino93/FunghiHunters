'use client'

import { useState } from 'react'

import type { CalibrationReport, SplitStat } from '@/lib/diary/calibration'
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
  const [detail, setDetail] = useState(false)

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

      {report.usable > 0 && (
        <div className="mt-2 border-t border-edge pt-2">
          <button
            type="button"
            onClick={() => { setDetail((v) => !v) }}
            aria-expanded={detail}
            className="text-[11px] font-medium text-ink-dim underline decoration-dotted
                       underline-offset-2 hover:text-ink focus:outline-none focus-visible:ring-2
                       focus-visible:ring-accent"
          >
            {detail ? 'Nascondi le metriche complete' : 'Mostra le metriche complete'}
          </button>

          {detail && <CalibrationDetail report={report} />}
        </div>
      )}
    </section>
  )
}

/**
 * Le metriche più tecniche: Brier score contro un "senza modello", precisione/richiamo, e le
 * due validazioni separate — temporale e geografica — che una correlazione unica nasconderebbe.
 * Sotto la soglia minima ogni riquadro lo dice, invece di mostrare un numero senza contesto.
 */
function CalibrationDetail({ report }: { report: CalibrationReport }) {
  const { brier, classification: c } = report

  return (
    <div className="mt-2 space-y-3 text-[11px] leading-snug text-ink-dim">
      {brier.modelScore !== null && (
        <div>
          <p className="font-medium text-ink-faint">Brier score (più basso è meglio)</p>
          <p className="mt-0.5">
            Modello: <span className="tabular">{brier.modelScore.toFixed(3)}</span> · previsione
            costante al tasso osservato ({((brier.baseRate ?? 0) * 100).toFixed(0)}%):{' '}
            <span className="tabular">{brier.baselineScore?.toFixed(3)}</span>
          </p>
          <p className="mt-0.5">
            {brier.skillScore !== null && brier.skillScore > 0.05
              ? `Il modello batte il "tira a indovinare al tasso medio" (skill score ${brier.skillScore.toFixed(2)}).`
              : brier.skillScore !== null && brier.skillScore < -0.05
                ? `Il modello fa peggio del "tira a indovinare" (skill score ${brier.skillScore.toFixed(2)}): da rivedere.`
                : 'Il modello non fa meglio del tasso medio osservato, per ora.'}
          </p>
        </div>
      )}

      {c.precision !== null && (
        <div>
          <p className="font-medium text-ink-faint">
            Uscite consigliate (punteggio ≥ {c.threshold})
          </p>
          <p className="mt-0.5">
            Precisione <span className="tabular">{(c.precision * 100).toFixed(0)}%</span> ·
            richiamo{' '}
            <span className="tabular">{c.recall !== null ? `${(c.recall * 100).toFixed(0)}%` : '—'}</span>{' '}
            · falsi consigli{' '}
            <span className="tabular">
              {((c.falseRecommendationRate ?? 0) * 100).toFixed(0)}%
            </span>{' '}
            ({c.falsePositive} su {c.truePositive + c.falsePositive})
          </p>
        </div>
      )}

      <SplitSection
        title="Validazione temporale (prima metà vs seconda metà)"
        stats={report.temporalSplit === null ? null : [report.temporalSplit.earlier, report.temporalSplit.later]}
      />

      <div>
        <p className="font-medium text-ink-faint">Validazione geografica, per zona</p>
        <ul className="mt-0.5 space-y-0.5">
          {report.geographicSplit.map((s) => (
            <li key={s.label}>
              {s.label}: {s.count} {s.count === 1 ? 'uscita' : 'uscite'}
              {s.hasSignal && s.rankCorrelation !== null && (
                <> · correlazione {s.rankCorrelation.toFixed(2)}</>
              )}
            </li>
          ))}
        </ul>
        {report.geographicWarning !== null && (
          <p className="mt-1 text-warn">{report.geographicWarning}</p>
        )}
      </div>

      <div>
        <p className="font-medium text-ink-faint">Per versione del modello</p>
        <ul className="mt-0.5 space-y-0.5">
          {report.byAlgorithmVersion.map((s) => (
            <li key={s.label}>
              {s.label}: {s.count} {s.count === 1 ? 'uscita' : 'uscite'}
              {s.hasSignal && s.rankCorrelation !== null && (
                <> · correlazione {s.rankCorrelation.toFixed(2)}</>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function SplitSection({ title, stats }: { title: string; stats: readonly [SplitStat, SplitStat] | null }) {
  return (
    <div>
      <p className="font-medium text-ink-faint">{title}</p>
      {stats === null ? (
        <p className="mt-0.5">Non ancora abbastanza uscite per dividere il campione in due.</p>
      ) : (
        <p className="mt-0.5">
          {stats.map((s, i) => (
            <span key={s.label}>
              {i > 0 && ' · '}
              {s.label}: {s.count}
              {s.hasSignal && s.rankCorrelation !== null ? ` (${s.rankCorrelation.toFixed(2)})` : ' (campione piccolo)'}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
