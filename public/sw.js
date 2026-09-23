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
const SHELL = ['/', '/mappa', '/diario', OFFLINE_URL, '/manifest.webmanifest', '/icon.svg']
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
  const pages = await Promise.allSettled(
    SHELL.map(async (path) => {
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
}

/*
 * Navigazione: la rete corre contro un timer, ma solo se c'è una copia da mostrare.
 *
 * Senza copia non si interrompe niente: una rete lenta che alla fine risponde è meglio di una
 * pagina "sei offline" mostrata dopo tre secondi a chi offline non è. E non si serve mai l'HTML di
 * un'altra pagina: prima un indirizzo mai visitato apriva la home, e si leggeva "Dove vado oggi"
 * sotto `/meteo` senza nessun avviso. Ora si vede la pagina offline, che dice cosa sta succedendo.
 */
function handleNavigation(event) {
  const request = event.request
  const fromNetwork = fetch(request).then((response) => {
    // La copia si prende qui, prima che il browser inizi a leggere il corpo della risposta.
    const saved =
      isCacheable(response) && !response.redirected
        ? savePage(request, response.clone())
        : Promise.resolve()
    return { response, saved }
  })
  // Il salvataggio in background deve sopravvivere anche quando la risposta servita è la copia:
  // è proprio il caso della rete lenta, in cui l'HTML fresco arriva dopo il timeout.
  event.waitUntil(fromNetwork.then(({ saved }) => saved).catch(() => undefined))
  const network = fromNetwork.then(({ response }) => response)
  event.respondWith(navigationResponse(request, network))
}

async function navigationResponse(request, network) {
  const cache = await caches.open(VERSION)
  // `ignoreVary`: le pagine di Next variano per gli header RSC, che una navigazione non ha mai;
  // per un documento lo stesso indirizzo è la stessa pagina.
  const cached = await cache.match(request, { ignoreVary: true })
  if (cached === undefined) {
    try {
      return await network
    } catch {
      return offlinePage(cache)
    }
  }
  return Promise.race([
    network.catch(() => cached),
    new Promise((resolve) => setTimeout(() => resolve(cached), NAVIGATION_TIMEOUT_MS)),
  ])
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
    if (isCacheable(response)) event.waitUntil(savePage(request, response.clone()))
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
