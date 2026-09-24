'use client'

import { formatAge, isSnapshotStale, snapshotAgeHours } from '@/lib/snapshot/freshness'
import { algorithmVersionMismatch, type Snapshot } from '@/lib/snapshot/types'
import { SourceStatusList } from '@/components/SourceStatusList'
import { formatDate } from '@/lib/ui/scale'
import { useIsHydrated } from '@/lib/ui/useIsHydrated'

/**
 * Stato delle fonti.
 *
 * Una fonte che smette di rispondere non deve degradare in silenzio: senza questo pannello, se il
 * SIR non risponde lo snapshot esce con meno stazioni, la confidence cala di qualche punto e
 * nessuno se ne accorge. Qui lo stato è dichiarato, con quanti dati sono arrivati davvero.
 */
export function SourceHealth({ snapshot }: { snapshot: Snapshot }) {
  // Soglia e motivo in `src/lib/snapshot/freshness.ts` (`STALE_AFTER_HOURS`).
  //
  // L'età si calcola solo nel browser, dopo l'idratazione. Sul server l'ora è quella del render
  // (per le pagine regione, fino a un'ora prima con l'ISR; per una pagina salvata offline, anche
  // un giorno prima): testo e colore diversi fra server e client rompevano l'idratazione. Il
  // server scrive sempre la riga neutra, il browser la sostituisce con l'avviso se serve.
  const hydrated = useIsHydrated()
  const ageHours = hydrated ? ageHoursNow(snapshot) : 0
  const stale = hydrated && isSnapshotStale(ageHours)
  const versionMismatch = algorithmVersionMismatch(snapshot)

  return (
    <section className="rounded-xl border border-edge bg-surface-1 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Dati e fonti
      </h2>

      <p className={`mt-1.5 text-xs ${stale ? 'text-warn' : 'text-ink-dim'}`}>
        {stale
          ? `Ultimo calcolo ${formatAge(ageHours)} (${formatDate(snapshot.referenceDate)}): i numeri potrebbero non riflettere il meteo recente.`
          : `Calcolato il ${formatDate(snapshot.referenceDate)} · modello ${snapshot.algorithmVersion}`}
      </p>

      {versionMismatch && (
        <p role="alert" className="mt-1.5 text-xs text-warn">
          Questo snapshot è stato calcolato con il modello {snapshot.algorithmVersion}, ma l&apos;app
          pubblicata ne descrive uno diverso: la spiegazione dei punteggi può non corrispondere
          esattamente a questi numeri finché non arriva il prossimo calcolo giornaliero.
        </p>
      )}

      <div className="mt-2">
        <SourceStatusList sources={snapshot.sources} />
      </div>

      <p className="mt-2 border-t border-edge pt-2 text-xs leading-snug text-ink-faint">
        {snapshot.uncalibratedParams.length} parametri del modello non hanno ancora una fonte in
        letteratura e sono dichiarati da calibrare. Compaiono marcati così anche nella spiegazione
        dei punteggi.
      </p>
    </section>
  )
}

/**
 * L'orologio sta qui, fuori dal corpo del componente, come stava il vecchio `daysSince`: la
 * logica e la soglia restano pure (e testate) in `freshness.ts`, che l'ora la riceve.
 */
function ageHoursNow(snapshot: Snapshot): number {
  return snapshotAgeHours(snapshot, Date.now())
}
