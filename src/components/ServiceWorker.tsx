'use client'

import { useEffect } from 'react'

/**
 * Registra il service worker, solo in produzione.
 *
 * In sviluppo una cache che intercetta le richieste rende il ricaricamento a caldo
 * imprevedibile, e si finisce a inseguire bug che non esistono.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    const register = (): void => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // Una registrazione fallita non è un errore da mostrare: l'app funziona lo stesso,
        // semplicemente senza comportamento offline.
      })
    }
    // Dopo il caricamento, per non contendere banda con il primo render.
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
