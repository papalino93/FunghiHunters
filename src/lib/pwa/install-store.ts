'use client'

import { useSyncExternalStore } from 'react'

import { INSTALL_CHANGE_EVENT, INSTALL_EVENT_GLOBAL, INSTALLED_GLOBAL } from './boot'
import { detectPlatform, isInAppBrowser, type InstallPlatform } from './platform'

/**
 * L'evento che Chrome (Android e computer), Edge e Samsung Internet mandano quando l'app è
 * installabile. Non è negli standard DOM di TypeScript perché non è uno standard: è
 * un'estensione di Chromium, ed è il motivo per cui su iPhone non arriva mai e serve la via
 * manuale.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallWindow = Window & {
  [INSTALL_EVENT_GLOBAL]?: BeforeInstallPromptEvent | null
  [INSTALLED_GLOBAL]?: boolean
}

export interface InstallState {
  /** `false` sul server e durante l'idratazione: finché è così, niente va mostrato o nascosto. */
  readonly ready: boolean
  readonly platform: InstallPlatform
  /** Aperto dentro Facebook, Instagram e simili, dove non si può installare niente. */
  readonly inApp: boolean
  /** Già aperta come app, dall'icona: niente inviti. */
  readonly installed: boolean
  /** Il browser offre la sua finestra di installazione: basta un tocco. */
  readonly canPrompt: boolean
}

const SERVER_STATE: InstallState = {
  ready: false,
  platform: 'desktop',
  inApp: false,
  installed: false,
  canPrompt: false,
}

function win(): InstallWindow {
  return window as InstallWindow
}

/** Già installata e aperta dall'icona: l'app parte in `standalone`, senza la barra del browser. */
export function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  } catch {
    // `matchMedia` assente in qualche WebView vecchia: si passa alla proprietà di Safari.
  }
  // Safari su iOS non implementa `display-mode: standalone`: usa una proprietà sua.
  return (window.navigator as { standalone?: boolean }).standalone === true
}

let cached: InstallState | null = null

function getSnapshot(): InstallState {
  const w = win()
  const next: InstallState = {
    ready: true,
    platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    inApp: isInAppBrowser(navigator.userAgent),
    installed: isStandalone() || w[INSTALLED_GLOBAL] === true,
    canPrompt: w[INSTALL_EVENT_GLOBAL] != null,
  }
  // Stessa identità se niente è cambiato: `useSyncExternalStore` lo richiede.
  if (
    cached !== null &&
    cached.platform === next.platform &&
    cached.inApp === next.inApp &&
    cached.installed === next.installed &&
    cached.canPrompt === next.canPrompt
  ) {
    return cached
  }
  cached = next
  return next
}

function getServerSnapshot(): InstallState {
  return SERVER_STATE
}

function subscribe(onChange: () => void): () => void {
  const w = win()
  /*
   * Di norma l'evento lo cattura lo script del layout (`boot.ts`) e ci avvisa con
   * `INSTALL_CHANGE_EVENT`. Il gestore qui sotto è la rete di sicurezza per quando lo script in
   * linea non ha girato (una pagina servita dalla cache di una build precedente, per esempio).
   */
  const onPrompt = (event: Event): void => {
    event.preventDefault()
    w[INSTALL_EVENT_GLOBAL] = event as BeforeInstallPromptEvent
    onChange()
  }
  const onInstalled = (): void => {
    w[INSTALL_EVENT_GLOBAL] = null
    w[INSTALLED_GLOBAL] = true
    onChange()
  }
  let media: MediaQueryList | null = null
  try {
    media = window.matchMedia('(display-mode: standalone)')
  } catch {
    media = null
  }
  w.addEventListener(INSTALL_CHANGE_EVENT, onChange)
  w.addEventListener('beforeinstallprompt', onPrompt)
  w.addEventListener('appinstalled', onInstalled)
  media?.addEventListener?.('change', onChange)
  return () => {
    w.removeEventListener(INSTALL_CHANGE_EVENT, onChange)
    w.removeEventListener('beforeinstallprompt', onPrompt)
    w.removeEventListener('appinstalled', onInstalled)
    media?.removeEventListener?.('change', onChange)
  }
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Apre la finestra di installazione del browser, se c'è.
 *
 * L'evento vale una volta sola: dopo `prompt()` va buttato, qualunque cosa scelga l'utente. Se
 * rifiuta, Chrome ne manderà uno nuovo più avanti, e lo script del layout lo raccoglierà.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const w = win()
  const event = w[INSTALL_EVENT_GLOBAL]
  if (event == null) return 'unavailable'
  w[INSTALL_EVENT_GLOBAL] = null
  w.dispatchEvent(new Event(INSTALL_CHANGE_EVENT))
  try {
    await event.prompt()
    const choice = await event.userChoice
    return choice.outcome
  } catch {
    return 'unavailable'
  }
}
