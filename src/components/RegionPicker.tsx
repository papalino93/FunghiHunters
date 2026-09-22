'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  regionCookieAssignment,
  type RegionChoice,
} from '@/lib/region/preference'

export interface RegionPickerProps {
  readonly current: string
  readonly choices: readonly RegionChoice[]
  /**
   * Dove andare dopo il cambio. Senza, si resta dove si è e si ricarica: è il caso della home,
   * che è la stessa pagina per ogni regione. La mappa invece ha la regione nell'indirizzo e deve
   * spostarsi, altrimenti resterebbe a mostrare le zone di prima.
   */
  readonly hrefFor?: (slug: string) => string
  readonly label?: string
  /**
   * Se la scelta va ricordata come regione di riferimento. Vero in home e in Account, dove la si
   * sceglie apposta; falso sulla mappa, dove si guarda altrove per curiosità e cambiare la
   * regione di casa come effetto collaterale sarebbe una sorpresa sgradita.
   */
  readonly remember?: boolean
}

/**
 * Il selettore della regione di riferimento.
 *
 * Un `<select>` nativo e non un menu costruito a mano: su un telefono apre la ruota di sistema,
 * che con venti voci si scorre con il pollice e funziona con qualunque tecnologia assistiva,
 * mentre un elenco disegnato da noi sarebbe più bello e peggiore.
 *
 * La scelta si scrive nel cookie **prima** di ricaricare, perché è il server a doverla leggere
 * per costruire la pagina nuova: vedi `lib/region/preference.ts`.
 */
export function RegionPicker({ current, choices, hrefFor, label, remember = true }: RegionPickerProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState(current)

  if (choices.length === 0) return null

  const change = (slug: string): void => {
    setValue(slug)
    if (remember) {
      try {
        document.cookie = regionCookieAssignment(slug)
      } catch {
        // Cookie bloccati: la scelta vale per questa navigazione e basta, meglio di un errore.
      }
    }
    startTransition(() => {
      if (hrefFor === undefined) router.refresh()
      else router.push(hrefFor(slug))
    })
  }

  return (
    <label className="flex items-center gap-2 text-xs text-ink-dim">
      <span className="shrink-0">{label ?? 'La tua regione'}</span>
      <select
        value={value}
        onChange={(event) => { change(event.target.value) }}
        disabled={pending}
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-edge bg-surface-2 px-2
                   text-sm text-ink transition-colors hover:bg-surface-3 disabled:opacity-60
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {choices.map((choice) => (
          <option key={choice.slug} value={choice.slug}>
            {choice.name}
          </option>
        ))}
      </select>
    </label>
  )
}
