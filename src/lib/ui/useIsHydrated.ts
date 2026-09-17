'use client'

import { useSyncExternalStore } from 'react'

/** Nessuna sottoscrizione: il valore cambia una volta sola, all'idratazione. */
const subscribe = (): (() => void) => () => {}

/**
 * `false` sul server e durante l'idratazione, `true` subito dopo.
 *
 * Serve per tutto ciò che vive solo nel browser — `localStorage`, `IndexedDB`, la geolocalizzazione
 * — senza scrivere stato dentro un effetto. Leggere lo storage in un `useEffect` e chiamare
 * `setState` provoca un render a cascata, ed è proprio ciò che la regola
 * `react-hooks/set-state-in-effect` segnala.
 *
 * `useSyncExternalStore` è il meccanismo previsto da React per leggere uno stato esterno al
 * render: il server riceve `false`, il client passa a `true` con un solo re-render controllato, e
 * l'HTML generato sui due lati resta identico.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
