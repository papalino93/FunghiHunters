/*
 * Service worker: rete prima, cache come rete di sicurezza.
 *
 * Il caso d'uso non è ipotetico. Si apre l'app proprio dove la rete non c'è — in salita, in
 * faggeta, in fondovalle — e quello è il momento in cui serve sapere dove si stava andando.
 *
 * "Rete prima" e non "cache prima" perché un punteggio vecchio mostrato al posto di uno fresco
 * sarebbe un danno silenzioso: qui la freschezza del dato è parte del prodotto. La cache serve
 * solo quando la rete fallisce, e l'app dichiara sempre la data del calcolo.
 */

const VERSION = 'fungicast-v1'
const SHELL = ['/', '/mappa', '/diario', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // `catch` perché una risorsa non raggiungibile in fase di installazione non deve
      // impedire al worker di attivarsi.
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  // Solo GET e solo la nostra origine: le tile della mappa le gestisce MapLibre per conto suo,
  // e intercettare richieste di terzi qui creerebbe più problemi di quanti ne risolva.
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          void caches.open(VERSION).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached !== undefined) return cached
        // Una navigazione senza rete e senza copia in cache: si serve la home, che almeno
        // mostra l'ultimo snapshot memorizzato invece della pagina di errore del browser.
        if (request.mode === 'navigate') {
          const home = await caches.match('/')
          if (home !== undefined) return home
        }
        return new Response('Non disponibile offline', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }),
  )
})
