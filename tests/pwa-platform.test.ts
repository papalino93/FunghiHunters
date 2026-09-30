import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { INSTALL_BOOT_SCRIPT } from '@/lib/pwa/boot'
import { detectPlatform, INSTALL_PLATFORMS, isInAppBrowser, PLATFORM_LABEL } from '@/lib/pwa/platform'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15',
  ipadAsMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
  androidEdge:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 EdgA/140.0.0.0',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_6; it_IT)',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
}

describe('detectPlatform', () => {
  it('riconosce i browser di iPhone e iPad', () => {
    expect(detectPlatform(UA.iphoneSafari, 5)).toBe('ios-safari')
    expect(detectPlatform(UA.iphoneChrome, 5)).toBe('ios-chrome')
    expect(detectPlatform(UA.iphoneFirefox, 5)).toBe('ios-other')
    // iPadOS si presenta come Mac: lo distingue lo schermo tattile.
    expect(detectPlatform(UA.ipadAsMac, 5)).toBe('ios-safari')
    expect(detectPlatform(UA.ipadAsMac, 0)).toBe('desktop')
  })

  it('riconosce i browser di Android, anche quelli che si dicono Chrome', () => {
    expect(detectPlatform(UA.androidChrome, 5)).toBe('android-chrome')
    expect(detectPlatform(UA.samsung, 5)).toBe('android-samsung')
    expect(detectPlatform(UA.androidFirefox, 5)).toBe('android-firefox')
    expect(detectPlatform(UA.androidEdge, 5)).toBe('android-other')
  })

  it('un computer resta un computer', () => {
    expect(detectPlatform(UA.macChrome, 0)).toBe('desktop')
    expect(detectPlatform(UA.windows, 0)).toBe('desktop')
  })

  it('ogni piattaforma elencata ha il suo nome', () => {
    for (const p of INSTALL_PLATFORMS) expect(PLATFORM_LABEL[p]).toBeTruthy()
    expect(new Set(INSTALL_PLATFORMS).size).toBe(INSTALL_PLATFORMS.length)
  })
})

describe('isInAppBrowser', () => {
  it('riconosce le finestre dentro altre app', () => {
    expect(isInAppBrowser(UA.instagram)).toBe(true)
    expect(isInAppBrowser(UA.facebookAndroid)).toBe(true)
  })

  it('non scambia i browser veri per finestre in prestito', () => {
    for (const ua of [UA.iphoneSafari, UA.iphoneChrome, UA.androidChrome, UA.samsung, UA.androidFirefox]) {
      expect(isInAppBrowser(ua)).toBe(false)
    }
  })
})

describe('installazione', () => {
  it('lo script di avvio è JavaScript valido e trattiene l’evento', () => {
    const listeners: Record<string, (e: unknown) => void> = {}
    const fakeWindow: Record<string, unknown> = {
      addEventListener: (name: string, fn: (e: unknown) => void) => {
        listeners[name] = fn
      },
      dispatchEvent: () => true,
    }
    new Function('window', 'Event', INSTALL_BOOT_SCRIPT)(fakeWindow, class {})
    let prevented = false
    const event = { preventDefault: () => (prevented = true) }
    listeners['beforeinstallprompt']?.(event)
    expect(prevented).toBe(true)
    expect(fakeWindow['__fcInstallEvent']).toBe(event)
    listeners['appinstalled']?.({})
    expect(fakeWindow['__fcInstallEvent']).toBeNull()
    expect(fakeWindow['__fcInstalled']).toBe(true)
  })

  it('il manifest ha ciò che Chrome chiede per proporre l’installazione', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
      display: string
      start_url: string
      id: string
      icons: Array<{ sizes: string; type: string }>
    }
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.id).toBe('/')
    const png = manifest.icons.filter((i) => i.type === 'image/png').map((i) => i.sizes)
    expect(png).toContain('192x192')
    expect(png).toContain('512x512')
  })
})
