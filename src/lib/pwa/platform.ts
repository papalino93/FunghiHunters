/**
 * Su quale telefono e con quale browser si sta guardando il sito: serve solo a dire **dove
 * toccare** per installare l'app, perché ogni browser nasconde la voce in un posto diverso.
 *
 * Funzioni pure, senza `window`: così si provano con le stringhe vere dei browser e si possono
 * chiamare anche dal server (che però non ne ha bisogno: lì la piattaforma non si conosce).
 */

export type InstallPlatform =
  | 'ios-safari'
  | 'ios-chrome'
  | 'ios-other'
  | 'android-chrome'
  | 'android-samsung'
  | 'android-firefox'
  | 'android-other'
  | 'desktop'

/** L'ordine in cui la pagina `/installa` elenca le istruzioni, dalla più comune. */
export const INSTALL_PLATFORMS: readonly InstallPlatform[] = [
  'ios-safari',
  'android-chrome',
  'android-samsung',
  'ios-chrome',
  'android-firefox',
  'ios-other',
  'android-other',
]

export const PLATFORM_LABEL: Readonly<Record<InstallPlatform, string>> = {
  'ios-safari': 'iPhone e iPad, con Safari',
  'ios-chrome': 'iPhone e iPad, con Chrome',
  'ios-other': 'iPhone e iPad, con Firefox, Edge o un altro browser',
  'android-chrome': 'Android, con Chrome',
  'android-samsung': 'Samsung, con Samsung Internet',
  'android-firefox': 'Android, con Firefox',
  'android-other': 'Android, con un altro browser',
  desktop: 'Computer',
}

export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true
  // iPadOS si presenta come un Mac: lo tradisce solo lo schermo che si tocca.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}

export function detectPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  if (isIos(userAgent, maxTouchPoints)) {
    if (/CriOS/.test(userAgent)) return 'ios-chrome'
    // Firefox, Edge, Opera, DuckDuckGo e Google app hanno ognuno la propria sigla; senza, è Safari.
    if (/FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\/|YaBrowser/.test(userAgent)) return 'ios-other'
    return 'ios-safari'
  }
  if (/Android/.test(userAgent)) {
    if (/SamsungBrowser/.test(userAgent)) return 'android-samsung'
    if (/Firefox/.test(userAgent)) return 'android-firefox'
    // Edge, Opera, Mi Browser, Vivaldi e simili contengono anche "Chrome/": vanno esclusi prima.
    if (/EdgA|OPR\/|MiuiBrowser|HuaweiBrowser|YaBrowser|UCBrowser|Vivaldi/.test(userAgent)) {
      return 'android-other'
    }
    if (/Chrome\//.test(userAgent)) return 'android-chrome'
    return 'android-other'
  }
  return 'desktop'
}

/**
 * Aperto dentro un'altra app (Facebook, Instagram, TikTok, una WebView Android): lì la voce
 * "aggiungi alla schermata Home" non esiste, e l'unica cosa utile è dire di aprire il browser.
 *
 * WhatsApp e Telegram su iPhone aprono una finestra di Safari "in prestito" che non si riconosce
 * dalla stringa: per quei casi c'è la frase fissa nelle istruzioni.
 */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|MicroMessenger|TikTok|musical_ly|BytedanceWebview|Snapchat|Pinterest|; wv\)/.test(
    userAgent,
  )
}

export function isMobilePlatform(platform: InstallPlatform): boolean {
  return platform !== 'desktop'
}

export function isIosPlatform(platform: InstallPlatform): boolean {
  return platform.startsWith('ios-')
}
