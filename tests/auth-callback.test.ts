/**
 * Lettura del ritorno da Supabase dopo un tentativo di accesso.
 *
 * Gli URL qui sotto non sono inventati: sono le forme che Supabase produce davvero al ritorno —
 * errori nel frammento con il flusso implicito (quello in uso, `detectSessionInUrl`), errori in
 * query quando il fallimento avviene prima che il flusso sia determinato. Il modulo deve leggerli
 * entrambi, perché quale dei due arrivi non dipende da noi.
 */

import { describe, expect, it } from 'vitest'

import { readAuthCallbackError, urlWithoutAuthParams } from '@/lib/auth/callback'

const APP = 'https://fungicast.vercel.app/account'

describe('readAuthCallbackError', () => {
  it('un URL senza parametri di accesso non è un errore', () => {
    expect(readAuthCallbackError(APP)).toBeNull()
    expect(readAuthCallbackError('https://fungicast.vercel.app/mappa?zona=ABETONE')).toBeNull()
  })

  it('un ritorno riuscito non è un errore: i token li gestisce l\'SDK', () => {
    const href = `${APP}#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer`
    expect(readAuthCallbackError(href)).toBeNull()
  })

  it('legge l\'errore dal frammento (flusso implicito)', () => {
    const href =
      `${APP}#error=access_denied&error_code=otp_expired` +
      '&error_description=Email+link+is+invalid+or+has+expired'
    const found = readAuthCallbackError(href)
    expect(found?.code).toBe('otp_expired')
    expect(found?.message).toMatch(/scaduto/)
    expect(found?.detail).toBe('Email link is invalid or has expired')
  })

  it('legge l\'errore dalla query', () => {
    const found = readAuthCallbackError(`${APP}?error=access_denied`)
    expect(found?.code).toBe('access_denied')
    expect(found?.message).toMatch(/annullato/)
  })

  it('`error_code` ha la precedenza su `error`, perché è più specifico', () => {
    const found = readAuthCallbackError(`${APP}#error=access_denied&error_code=otp_expired`)
    expect(found?.code).toBe('otp_expired')
  })

  it('ricade su `error` quando `error_code` non è fra quelli noti', () => {
    const found = readAuthCallbackError(`${APP}#error=access_denied&error_code=codice_mai_visto`)
    expect(found?.code).toBe('codice_mai_visto')
    expect(found?.message).toMatch(/annullato/)
  })

  it('distingue gli errori di configurazione da quelli di chi accede', () => {
    const configurazione = readAuthCallbackError(
      `${APP}#error=server_error&error_code=unexpected_failure` +
        '&error_description=Unable+to+exchange+external+code',
    )
    expect(configurazione?.configuration).toBe(true)
    expect(configurazione?.message).toMatch(/Client ID o Client Secret/)

    const utente = readAuthCallbackError(`${APP}#error=access_denied`)
    expect(utente?.configuration).toBe(false)
  })

  it('un codice sconosciuto mostra il testo di Supabase invece di inventare una spiegazione', () => {
    const found = readAuthCallbackError(`${APP}#error_code=qualcosa_di_nuovo&error_description=Boom`)
    expect(found?.code).toBe('qualcosa_di_nuovo')
    expect(found?.message).toContain('Boom')
    // Non sapendo classificarlo, il dettaglio tecnico va mostrato: è l'unica cosa che aiuta.
    expect(found?.configuration).toBe(true)
  })

  it('un errore senza descrizione resta leggibile', () => {
    const found = readAuthCallbackError(`${APP}#error_code=qualcosa_di_nuovo`)
    expect(found?.detail).toBeNull()
    expect(found?.message).toBe('Accesso non riuscito (qualcosa_di_nuovo).')
  })

  it('un URL malformato non fa saltare l\'app', () => {
    expect(readAuthCallbackError('non-un-url')).toBeNull()
  })
})

describe('urlWithoutAuthParams', () => {
  it('toglie i parametri di errore dal frammento e non lascia il cancelletto', () => {
    const href = `${APP}#error=access_denied&error_code=otp_expired&error_description=Boom`
    expect(urlWithoutAuthParams(href)).toBe(APP)
  })

  it('toglie i token di un ritorno riuscito', () => {
    const href = `${APP}#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer`
    expect(urlWithoutAuthParams(href)).toBe(APP)
  })

  it('toglie `code` e `token_hash` dalla query', () => {
    expect(urlWithoutAuthParams(`${APP}?code=abc&token_hash=xyz&type=magiclink`)).toBe(APP)
  })

  it('conserva i parametri dell\'app: il ritorno può atterrare su una pagina qualunque', () => {
    const href = 'https://fungicast.vercel.app/mappa?zona=ABETONE#error=access_denied'
    expect(urlWithoutAuthParams(href)).toBe('https://fungicast.vercel.app/mappa?zona=ABETONE')
  })

  it('non tocca un frammento che non è una query', () => {
    const href = 'https://fungicast.vercel.app/account#contenuto'
    expect(urlWithoutAuthParams(href)).toBe(href)
  })

  it('un URL malformato torna identico invece di lanciare', () => {
    expect(urlWithoutAuthParams('non-un-url')).toBe('non-un-url')
  })
})
