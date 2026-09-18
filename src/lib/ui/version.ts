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
