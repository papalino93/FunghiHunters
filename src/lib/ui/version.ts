/**
 * Versione della build, leggibile sia dal server sia dal browser.
 *
 * I valori arrivano da `next.config.ts`, che li inlina nel bundle al momento della compilazione:
 * non sono una lettura a runtime e non cambiano finché non si ricompila — che è esattamente la
 * proprietà che serve per capire *quale* build si ha davanti.
 */

export const APP_VERSION = process.env['NEXT_PUBLIC_APP_VERSION'] ?? 'sviluppo'
export const BUILD_TIME = process.env['NEXT_PUBLIC_BUILD_TIME'] ?? ''

/** "a1b2c3d · 18/09 16:42", oppure solo la versione se l'ora della build non c'è. */
export function versionLabel(): string {
  if (BUILD_TIME === '') return APP_VERSION
  const built = new Date(BUILD_TIME)
  if (Number.isNaN(built.getTime())) return APP_VERSION
  const quando = built.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${APP_VERSION} · ${quando}`
}

/*
 * Identità della build per il service worker, che la usa nel nome delle proprie cache.
 *
 * Commit *e* ora della build, non il solo commit: un "Redeploy" su Vercel (quello consigliato in
 * `docs/DEPLOY-VERCEL.md` dopo aver cambiato una variabile `NEXT_PUBLIC_`) rifà la build dello
 * stesso commit con chunk diversi, e con lo stesso nome di cache il worker non si sarebbe
 * aggiornato, mescolando HTML di una build con chunk dell'altra.
 */
export const BUILD_ID = [APP_VERSION, BUILD_TIME.replace(/[^0-9]/g, '')].filter((p) => p !== '').join('-')
