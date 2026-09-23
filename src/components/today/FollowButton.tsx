'use client'

/**
 * "Segui zona" / "Non seguire più" — un solo componente per i tre punti in cui compare (scheda
 * home, dettaglio mappa, sezione "Le tue zone"), così look, dimensione del bersaglio touch e testo
 * non divergono in un posto e non nell'altro.
 *
 * Icona più testo, mai solo colore: un utente che non distingue i colori deve poter capire lo
 * stato dal simbolo (pieno/vuoto) e dalla parola, non da un tono di verde diverso.
 */
export function FollowButton({
  following,
  onToggle,
  compact = false,
}: {
  readonly following: boolean
  readonly onToggle: () => void
  /** Versione ridotta, senza testo, per contesti stretti come l'intestazione del dettaglio mappa. */
  readonly compact?: boolean
}) {
  const label = following ? 'Non seguire più questa zona' : 'Segui questa zona'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={following}
      aria-label={label}
      title={label}
      className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border text-xs font-medium
                  transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    compact ? 'w-11 justify-center px-0' : 'px-3'
                  } ${
                    following
                      ? 'border-accent/40 bg-accent/15 text-ink'
                      : 'border-edge bg-surface-2 text-ink-dim hover:text-ink'
                  }`}
    >
      <StarIcon filled={following} />
      {!compact && <span>{following ? 'Seguita' : 'Segui'}</span>}
    </button>
  )
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <path
        d="M8 1.6l1.9 4.1 4.4.5-3.3 3 .9 4.4L8 11.4l-3.9 2.2.9-4.4-3.3-3 4.4-.5L8 1.6Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}
