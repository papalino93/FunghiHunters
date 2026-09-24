/*
 * Service worker: rete prima, cache come rete di sicurezza.
 *
 * Il caso d'uso non è ipotetico. Si apre l'app proprio dove la rete non c'è — in salita, in
 * faggeta, in fondovalle — e quello è il momento in cui serve sapere dove si stava andando.
 *
 * "Rete prima" e non "cache prima" perché un punteggio vecchio mostrato al posto di uno fresco
 * sarebbe un danno silenzioso: qui la freschezza del dato è parte del prodotto. La cache serve
 * solo quando la rete fallisce, e l'app dichiara sempre la data del calcolo.
 *
 * "Fallisce" però non vuol dire solo "risponde con un errore". In bosco la rete più comune non è
 * assente ma appesa: una tacca che va e viene, la richiesta parte e non torna mai. Senza un limite
 * il browser aspetta il proprio timeout (circa un minuto di schermo bianco) prima di arrendersi, e
 * solo allora arriverebbe la copia salvata. Per le navigazioni quindi la rete ha un vantaggio
 * limitato (`NAVIGATION_TIMEOUT_MS`); scaduto quello si mostra la copia, e la risposta della rete,
 * se poi arriva, aggiorna comunque la cache per la volta dopo.
 */

/*
 * Il nome delle cache contiene l'identità della build, passata dalla pagina come `?v=` nell'URL
 * di registrazione (vedi `src/components/ServiceWorker.tsx`).
 *
 * Due ragioni, tutte e due pratiche. Un nome fisso ("fungicast-v1") non cambiava mai, e così
 * l'`activate` che cancella le cache vecchie non trovava mai niente da cancellare: HTML e chunk
 * di build ormai rimosse restavano sul telefono per sempre. E un `sw.js` identico byte per byte
 * non viene reinstallato: cambiando l'URL di registrazione il browser vede un worker nuovo a ogni
 * deploy, senza bisogno di generare il file in fase di build.
 */
const BUILD = new URL(self.location.href).searchParams.get('v') || 'senza-versione'
const VERSION = `fungicast-${BUILD}`
// Gli asset di `/_next/static/` stanno a parte: sono tanti, e un tetto unico con le pagine li
// farebbe espellere proprio mentre si naviga, cioè quando servono per idratare la pagina offline.
const STATIC_CACHE = `${VERSION}-static`
const CURRENT_CACHES = [VERSION, STATIC_CACHE]

const OFFLINE_URL = '/offline.html'
// I due moduli di MapLibre non hanno hash nel nome e non compaiono nell'HTML (li carica il
// componente della mappa dopo l'idratazione): senza nominarli qui, offline la mappa non partiva
// nemmeno quando la sua pagina era in cache.
const SHELL = [
  '/',
  '/mappa',
  '/diario',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon.svg',
  '/maplibre/maplibre-gl-worker.mjs',
  '/maplibre/maplibre-gl-shared.mjs',
]
/*
 * Senza queste due l'installazione fallisce apposta, e resta attivo il worker precedente con le
 * sue cache. Prima l'installazione non falliva mai: con la rete a singhiozzo il worker nuovo si
 * attivava lo stesso e cancellava la cache funzionante della build prima, lasciando in bosco solo
 * la pagina minima "sei offline". Il browser ritenta da solo alla navigazione successiva.
 */
const ESSENTIAL = ['/', OFFLINE_URL]
/** Quante pagine già salvate dalla build precedente si riportano nella nuova, al massimo. */
const MAX_CARRIED_OVER = 30
const SHELL_PATHS = new Set(SHELL)

/** Quanto si concede alla rete su una navigazione, se c'è una copia da mostrare al suo posto. */
const NAVIGATION_TIMEOUT_MS = 3500
/*
 * Tetti sulle voci salvate a runtime. Non servono a risparmiare spazio fine a sé stesso: servono a
 * non far crescere la cache senza limite, perché più la cache pesa più è probabile che il browser
 * la sfratti tutta insieme — diario compreso, che vive nella stessa origine.
 */
const MAX_PAGE_ENTRIES = 60
const MAX_STATIC_ENTRIES = 200

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !CURRENT_CACHES.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  // Solo GET e solo la nostra origine: le tile della mappa le gestisce MapLibre per conto suo,
  // e intercettare richieste di terzi qui creerebbe più problemi di quanti ne risolva.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Le richieste RSC della navigazione client (`?_rsc=`, header `RSC: 1`, prefetch) vanno solo in
  // rete. Salvarle riempiva la cache di decine di copie della stessa pagina, una per ogni stato
  // del router, e offline non servono: se falliscono il router di Next ripiega su una navigazione
  // completa, che passa da qui come documento e trova la copia HTML o la pagina offline.
  if (isRscRequest(request, url)) return
  // Statistiche di Vercel (`/_vercel/insights`, `/_vercel/speed-insights`): solo rete, mai in
  // cache. Offline non servono, e salvate occupavano posti destinati alle pagine.
  if (url.pathname.startsWith('/_vercel/')) return

  if (request.mode === 'navigate') {
    handleNavigation(event)
    return
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staticAsset(event))
    return
  }
  event.respondWith(networkFirst(event))
})

function isRscRequest(request, url) {
  if (url.searchParams.has('_rsc')) return true
  if (request.headers.get('RSC') === '1') return true
  for (const name of request.headers.keys()) {
    if (name.startsWith('next-router-')) return true
  }
  return false
}

/*
 * Precache della shell, voce per voce.
 *
 * Con `addAll` una sola risorsa irraggiungibile annullava tutto: bastava un 404 sull'icona perché
 * nemmeno la home finisse in cache. Ogni voce ora vive o fallisce da sola.
 */
async function precacheShell() {
  const cache = await caches.open(VERSION)
  /*
   * Oltre alla shell, le pagine che l'utente aveva già salvato con la build precedente (una
   * regione, il meteo, la guida): ogni deploy cambia il nome della cache, e senza riportarle qui
   * sparivano tutte due volte al giorno — con ogni commit dei dati giornalieri. Si riscaricano,
   * non si copiano: l'HTML vecchio punta a chunk che nella build nuova non esistono più.
   */
  const carried = (await previousPaths()).filter((path) => !SHELL_PATHS.has(path))
  const paths = [...SHELL, ...carried.slice(0, MAX_CARRIED_OVER)]
  const pages = await Promise.allSettled(
    paths.map(async (path) => {
      // `reload` per non salvare come copia offline un HTML vecchio rimasto nella cache HTTP.
      const response = await fetch(new Request(path, { cache: 'reload' }))
      // Una risposta rediretta non può essere servita a una navigazione (il browser la rifiuta),
      // e comunque sarebbe il contenuto di un'altra pagina sotto questo indirizzo.
      if (!isCacheable(response) || response.redirected) throw new Error(`${path}: non salvabile`)
      await cache.put(path, response.clone())
      return response
    }),
  )
  /*
   * I chunk JavaScript e CSS che le pagine della shell citano. Il worker si installa dopo il primo
   * caricamento, quindi quei chunk sono già passati senza di lui: senza questo passaggio la home
   * salvata offline si vedrebbe ma non si idraterebbe (niente pulsanti, niente diario). Sono gli
   * stessi file appena scaricati dalla pagina, e con ogni probabilità arrivano dalla cache HTTP.
   */
  const assets = new Set()
  for (const result of pages) {
    if (result.status !== 'fulfilled') continue
    const type = result.value.headers.get('content-type') || ''
    if (!type.includes('text/html')) continue
    const html = await result.value.text().catch(() => '')
    for (const match of html.matchAll(/\/_next\/static\/[^"'\s\\)<>]+/g)) assets.add(match[0])
  }
  const staticCache = await caches.open(STATIC_CACHE)
  await Promise.allSettled([...assets].map((path) => staticCache.add(path)))

  const failed = ESSENTIAL.filter((_, i) => pages[paths.indexOf(ESSENTIAL[i])]?.status !== 'fulfilled')
  if (failed.length > 0) {
    // La cache appena riempita a metà non serve a nessuno: si toglie, e resta quella di prima.
    await caches.delete(VERSION)
    await caches.delete(STATIC_CACHE)
    throw new Error(`Installazione rimandata, non salvate: ${failed.join(', ')}`)
  }
}

/** Gli indirizzi salvati nelle cache di pagine delle build precedenti (non negli asset). */
async function previousPaths() {
  const out = []
  for (const name of await caches.keys()) {
    if (CURRENT_CACHES.includes(name) || !name.startsWith('fungicast-') || name.endsWith('-static')) {
      continue
    }
    const cache = await caches.open(name)
    for (const request of await cache.keys()) {
      const url = new URL(request.url)
      if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) continue
      out.push(url.pathname + url.search)
    }
  }
  return [...new Set(out)]
}

/*
 * I chunk caricati dopo l'idratazione (la mappa, con `ssr: false`, non compare nell'HTML): la
 * pagina li elenca da `performance` e li manda qui, così una mappa aperta online una volta in
 * questa build si riapre anche offline. Solo asset nostri, solo percorsi che non cambiano mai
 * contenuto a parità di indirizzo.
 */
self.addEventListener('message', (event) => {
  const data = event.data
  if (data === null || typeof data !== 'object' || data.type !== 'cache-assets') return
  if (!Array.isArray(data.paths)) return
  const paths = data.paths.filter(
    (p) => typeof p === 'string' && (p.startsWith('/_next/static/') || p.startsWith('/maplibre/')),
  )
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      for (const path of paths.slice(0, 100)) {
        if ((await cache.match(path)) === undefined) await cache.add(path).catch(() => undefined)
      }
    }),
  )
})

/*
 * Navigazione: la rete corre contro un timer, ma solo se c'è una copia da mostrare.
 *
 * Senza copia non si interrompe niente: una rete lenta che alla fine risponde è meglio di una
 * pagina "sei offline" mostrata dopo tre secondi a chi offline non è. E non si serve mai l'HTML di
 * un'altra pagina: prima un indirizzo mai visitato apriva la home, e si leggeva "Dove vado oggi"
 * sotto `/meteo` senza nessun avviso. Ora si vede la pagina offline, che dice cosa sta succedendo.
 */
function handleNavigation(event) {
  /*
   * Il salvataggio dipende da quale risposta è stata servita, quindi si decide dentro
   * `navigationResponse`; `waitUntil` va però chiamato adesso, durante l'evento, con una promessa
   * che si risolve quando i salvataggi avviati (se ce ne sono) sono finiti.
   */
  const pending = []
  let done = () => undefined
  event.waitUntil(new Promise((resolve) => { done = resolve }))
  event.respondWith(
    navigationResponse(event.request, (promise) => { pending.push(promise) }).finally(() => {
      void Promise.allSettled(pending).then(() => done())
    }),
  )
}

async function navigationResponse(request, keepAlive) {
  const cache = await caches.open(VERSION)
  const network = fetch(request)
  // `ignoreVary`: le pagine di Next variano per gli header RSC, che una navigazione non ha mai;
  // per un documento lo stesso indirizzo è la stessa pagina.
  const cached = await cache.match(request, { ignoreVary: true })

  /*
   * Si salva solo la risposta di rete *servita*. Una risposta arrivata dopo il timeout poteva
   * essere di una build nuova: salvata al posto della copia, alla riapertura offline successiva si
   * serviva un HTML i cui chunk non erano mai stati scaricati, e la pagina restava inerte.
   */
  const serveFromNetwork = (response) => {
    if (isCacheable(response) && !response.redirected) {
      keepAlive(savePage(request, response.clone()))
    }
    return response
  }

  if (cached === undefined) {
    try {
      return serveFromNetwork(await network)
    } catch {
      // Stessa pagina con parametri diversi (`/mappa?zona=…&giorno=…` da una scheda della home):
      // l'app legge i parametri nel browser, quindi la copia di `/mappa` vale anche per quelli.
      const sibling = await cache.match(request, { ignoreVary: true, ignoreSearch: true })
      return sibling ?? offlinePage(cache)
    }
  }

  const TIMEOUT = Symbol('timeout')
  const winner = await Promise.race([
    network.catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(TIMEOUT), NAVIGATION_TIMEOUT_MS)),
  ])
  if (winner === TIMEOUT || winner === null) return cached
  // Un errore del server (funzione fredda, timeout di Vercel) non è meglio della copia salvata.
  if (winner.status >= 500) return cached
  return serveFromNetwork(winner)
}

async function offlinePage(cache) {
  const page = await cache.match(OFFLINE_URL)
  if (page !== undefined) return page
  // Nemmeno la pagina offline in cache (installazione interrotta): un minimo di HTML, non la
  // pagina d'errore del browser, che in inglese e senza contesto sembra un guasto dell'app.
  return new Response(
    '<!doctype html><html lang="it"><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Offline · FungiCast</title>' +
      '<body style="font-family:system-ui,sans-serif;background:#0b0e16;color:#eef1f8;padding:24px">' +
      '<h1>Sei offline</h1><p>Questa pagina non è ancora stata salvata su questo dispositivo.</p>' +
      '<p><a style="color:#4dd4ac" href="/">Torna alla home</a></p></body></html>',
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

/*
 * Asset con hash nel nome: il contenuto a un dato indirizzo non cambia mai, quindi la cache viene
 * prima della rete. È ciò che permette a una pagina visitata online di idratarsi anche offline.
 */
async function staticAsset(event) {
  const request = event.request
  const cache = await caches.open(STATIC_CACHE)
  const hit = await cache.match(request)
  if (hit !== undefined) return hit
  const response = await fetch(request)
  if (isCacheable(response)) {
    event.waitUntil(
      cache.put(request, response.clone()).then(() => trim(STATIC_CACHE, MAX_STATIC_ENTRIES)),
    )
  }
  return response
}

/** Tutto il resto della nostra origine (dati in `/data/`, API): rete prima, come sempre. */
async function networkFirst(event) {
  const request = event.request
  try {
    const response = await fetch(request)
    // Le API no: risposte a una ricerca (il meteo di un luogo, a un'ora precisa) che offline
    // sarebbero vecchie senza dirlo, e che espellevano dal tetto delle voci pagine utili.
    const isApi = new URL(request.url).pathname.startsWith('/api/')
    if (!isApi && isCacheable(response)) event.waitUntil(savePage(request, response.clone()))
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached !== undefined) return cached
    return new Response('Non disponibile offline', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
}

function isCacheable(response) {
  // 200 e non "ok": una 206 (risposta parziale) `cache.put` la rifiuta.
  return response.status === 200 && response.type === 'basic'
}

async function savePage(request, response) {
  const cache = await caches.open(VERSION)
  await cache.put(request, response)
  await trim(VERSION, MAX_PAGE_ENTRIES)
}

/*
 * Tetto semplice: oltre il limite si tolgono le voci più vecchie. `keys()` restituisce le voci in
 * ordine di inserimento e `put` su una voce esistente la rimette in fondo, quindi "più vecchia"
 * vuol dire "scritta meno di recente" — un LRU approssimato, che per questo uso basta. La shell
 * non si tocca: è ciò che rende l'app apribile offline anche dopo una lunga navigazione.
 */
async function trim(name, max) {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  const removable = keys.filter((request) => {
    const url = new URL(request.url)
    return !SHELL_PATHS.has(url.pathname + url.search)
  })
  const excess = keys.length - max
  if (excess <= 0) return
  await Promise.all(removable.slice(0, excess).map((request) => cache.delete(request)))
}
