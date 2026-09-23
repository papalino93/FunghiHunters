import type { NextConfig } from 'next'

/*
 * Versione della build, fissata qui e inlinata nel bundle.
 *
 * Serve a rispondere a una domanda che dal telefono non ha altra risposta: "sto guardando
 * l'ultimo aggiornamento o una copia vecchia?". Fra service worker, cache del browser e app
 * installata sulla home, un deploy può essere online da un'ora e il telefono mostrare ancora
 * quello di prima, senza che niente lo dica.
 *
 * Su Vercel `VERCEL_GIT_COMMIT_SHA` è il commit da cui la build è stata prodotta: sette caratteri
 * bastano per confrontarlo con quello annunciato. Fuori da Vercel non esiste, e allora si dichiara
 * "sviluppo" invece di inventare un numero che non corrisponde a niente.
 */
const commit = process.env['VERCEL_GIT_COMMIT_SHA']
const APP_VERSION = commit === undefined || commit === '' ? 'sviluppo' : commit.slice(0, 7)

/*
 * Intestazioni di sicurezza, uguali su ogni risposta.
 *
 * - `nosniff`: il browser non "indovina" il tipo di un file — un JSON servito come JSON resta tale.
 * - `Referrer-Policy`: verso altri siti parte solo il dominio, non l'indirizzo completo (che può
 *   contenere le coordinate di un luogo cercato in `/meteo`).
 * - `X-Frame-Options` e `frame-ancestors`: nessuno può incorniciare l'app in un iframe altrui,
 *   che è la premessa del clickjacking. Il secondo è la forma moderna, il primo per i browser
 *   vecchi; `frame-ancestors` da solo non limita nient'altro della pagina.
 * - `Permissions-Policy`: la posizione resta disponibile alla nostra origine (serve a "quanto
 *   dista"), tutto il resto che l'app non usa è spento anche per gli iframe di terzi. `payment`
 *   non è nella lista apposta: il widget di Buy Me a Coffee apre un iframe di pagamento.
 *
 * **Niente Content-Security-Policy completa, per ora.** L'app carica lo script di Buy Me a Coffee
 * (che a sua volta apre iframe e script suoi), le tessere CARTO, Supabase per l'accesso e i worker
 * di MapLibre da `blob:`: una CSP stretta sbagliata di una sola origine rompe in produzione la
 * mappa o l'accesso, senza nessun errore visibile a chi usa l'app. Va introdotta prima in
 * `Content-Security-Policy-Report-Only`, guardando cosa segnala, e solo dopo resa effettiva.
 *
 * HSTS non è qui perché lo mette già Vercel (`max-age=63072000; includeSubDomains; preload`):
 * ridichiararlo creerebbe due fonti per lo stesso valore.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  {
    key: 'Permissions-Policy',
    value: [
      'geolocation=(self)',
      'camera=()',
      'microphone=()',
      'usb=()',
      'serial=()',
      'hid=()',
      'midi=()',
      'accelerometer=()',
      'gyroscope=()',
      'magnetometer=()',
      'display-capture=()',
      'browsing-topics=()',
    ].join(', '),
  },
]

const nextConfig: NextConfig = {
  // `X-Powered-By: Next.js` non serve a nessuno che usi l'app, e dice a chiunque altro cosa provare.
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: SECURITY_HEADERS }])
  },
}

export default nextConfig
