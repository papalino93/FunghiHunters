import type { SnapshotSource } from '@/lib/snapshot/types'

/**
 * Stato delle fonti, condiviso fra la home ("Dati e fonti") e la scheda di dettaglio zona.
 *
 * Una fonte che smette di rispondere non deve degradare in silenzio — vedi `SourceHealth.tsx`.
 * Estratto qui perché lo stesso elenco serve anche nel dettaglio di una zona: chi guarda i numeri
 * di un posto specifico deve poter vedere da dove vengono senza tornare alla home.
 */
export function SourceStatusList({ sources }: { sources: readonly SnapshotSource[] }) {
  return (
    <ul className="space-y-1.5">
      {sources.map((source) => (
        <li key={source.name} className="flex items-start gap-2 text-xs leading-snug">
          <span
            aria-hidden="true"
            className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
              source.status === 'ok'
                ? 'bg-accent'
                : source.status === 'degraded'
                  ? 'bg-warn'
                  : 'bg-danger'
            }`}
          />
          <span className="min-w-0">
            <span className="text-ink-dim">{source.name}</span>
            <span className="block text-ink-faint">
              {statusLabel(source.status)} · {source.coverage} · licenza {source.license}
              {source.lastUpdate !== null && <> · dato al {source.lastUpdate}</>}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'ok':
      return 'risponde'
    case 'degraded':
      return 'risponde solo in parte'
    default:
      return 'non raggiungibile'
  }
}
