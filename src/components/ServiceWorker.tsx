'use client'

import { useEffect } from 'react'

import { BUILD_ID } from '@/lib/ui/version'

/**
 * Registra il service worker, solo in produzione.
 *
 * In sviluppo una cache che intercetta le richieste rende il ricaricamento a caldo
 * imprevedibile, e si finisce a inseguire bug che non esistono.
 *
 * L'identità della build viaggia nell'URL (`/sw.js?v=…`): il worker la legge da
 * `self.location` e ne fa il nome delle cache. Così ogni deploy registra un worker nuovo, che
 * all'attivazione cancella le cache della build precedente, senza dover generare `sw.js`.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    const register = (): void => {
      void navigator.serviceWorker
        .register(`/sw.js?v=${encodeURIComponent(BUILD_ID)}`)
        .catch(() => {
          // Una registrazione fallita non è un errore da mostrare: l'app funziona lo stesso,
          // semplicemente senza comportamento offline.
        })
      requestPersistentStorage()
    }
    // Dopo il caricamento, per non contendere banda con il primo render.
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })

    // Quando si lascia la pagina (o l'app va in secondo piano) i chunk caricati nel frattempo —
    // la mappa arriva solo dopo l'idratazione — sono ormai tutti scaricati: è il momento giusto
    // per dirli al worker. Vedi il gestore `message` in `public/sw.js`.
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') reportLoadedAssets()
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => { document.removeEventListener('visibilitychange', onHidden) }
  }, [])

  return null
}

/*
 * Chiede al browser di non sfrattare i dati dell'origine quando lo spazio scarseggia.
 *
 * Senza, cache offline e diario (IndexedDB) sono "best effort": il browser può cancellarli per
 * fare posto, e lo fa proprio sui telefoni pieni, senza chiedere. Una sola richiesta, senza
 * aspettarne l'esito: se viene negata non cambia niente rispetto a prima. Si salta se il permesso
 * c'è già.
 *
 * **Mai su Firefox.** Chrome ed Edge decidono in silenzio, Safari non chiede nulla; Firefox invece
 * apre una finestra di permesso appena si carica la pagina, senza che l'utente abbia fatto niente.
 * Una richiesta non sollecitata è esattamente il tipo di interruzione che questa app esclude per
 * scelta, e vale meno del rischio che protegge.
 */
function requestPersistentStorage(): void {
  try {
    if (navigator.userAgent.includes('Firefox/')) return
    const storage = navigator.storage
    if (storage?.persist === undefined) return
    void (storage.persisted?.() ?? Promise.resolve(false))
      .then((already) => (already ? true : storage.persist()))
      .catch(() => undefined)
  } catch {
    // Browser senza Storage API o contesto che la vieta: nessuna conseguenza.
  }
}

/** Manda al worker gli asset nostri già caricati da questa pagina, perché li tenga per l'offline. */
function reportLoadedAssets(): void {
  try {
    const controller = navigator.serviceWorker?.controller
    if (controller === null || controller === undefined) return
    const paths = performance
      .getEntriesByType('resource')
      .map((entry) => {
        try {
          const url = new URL(entry.name)
          return url.origin === location.origin ? url.pathname : null
        } catch {
          return null
        }
      })
      .filter(
        (path): path is string =>
          path !== null && (path.startsWith('/_next/static/') || path.startsWith('/maplibre/')),
      )
    if (paths.length > 0) controller.postMessage({ type: 'cache-assets', paths: [...new Set(paths)] })
  } catch {
    // Senza Resource Timing o senza worker: nessuna conseguenza, solo meno cose offline.
  }
}
