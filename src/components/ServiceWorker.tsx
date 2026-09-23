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
  }, [])

  return null
}

/*
 * Chiede al browser di non sfrattare i dati dell'origine quando lo spazio scarseggia.
 *
 * Senza, cache offline e diario (IndexedDB) sono "best effort": il browser può cancellarli per
 * fare posto, e lo fa proprio sui telefoni pieni, senza chiedere. Una sola richiesta, senza
 * aspettarne l'esito: se viene negata non cambia niente rispetto a prima. Si salta se il permesso
 * c'è già, per non ripetere la domanda dove il browser la pone all'utente.
 */
function requestPersistentStorage(): void {
  try {
    const storage = navigator.storage
    if (storage?.persist === undefined) return
    void (storage.persisted?.() ?? Promise.resolve(false))
      .then((already) => (already ? true : storage.persist()))
      .catch(() => undefined)
  } catch {
    // Browser senza Storage API o contesto che la vieta: nessuna conseguenza.
  }
}
