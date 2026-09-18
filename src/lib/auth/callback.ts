/**
 * Lettura dell’esito del ritorno da Supabase dopo un tentativo di accesso.
 *
 * **Perché serve un modulo apposta.** Quando il redirect torna con un errore, l’SDK lo riconosce
 * (`GoTrueClient._getSessionFromURL`) ma lo restituisce da `initialize()`, che nessuno attende:
 * il risultato pratico è che la sessione non nasce e *non succede nient’altro*. L’utente torna
 * sulla schermata di accesso identica a prima, senza una riga che dica cosa è andato storto —
 * ed è il momento in cui serve di più, perché quasi tutti gli errori che arrivano fin qui
 * nascono da una configurazione incompleta del deploy (provider Google non abilitato, URL di
 * ritorno non autorizzato, Client Secret sbagliato) e non da uno sbaglio di chi sta accedendo.
 *
 * L’SDK, in caso di errore, non ripulisce nemmeno l’URL: i parametri restano nella barra degli
 * indirizzi e ricompaiono a ogni ricaricamento. `urlWithoutAuthParams()` serve a toglierli una
 * volta letti.
 *
 * Entrambe le funzioni sono pure e prendono l’URL come stringa: si testano senza DOM, senza rete
 * e senza un progetto Supabase vero.
 */

/** Parametri che Supabase aggiunge al ritorno, sia in query sia nel frammento. */
const AUTH_PARAMS = [
  'error',
  'error_code',
  'error_description',
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'expires_in',
  'expires_at',
  'token_type',
  'code',
  'token_hash',
  'type',
] as const

export interface AuthCallbackError {
  /** `error_code` quando c’è, altrimenti `error`: la chiave con cui si diagnostica il problema. */
  readonly code: string
  /** Messaggio in italiano, già pronto da mostrare. */
  readonly message: string
  /**
   * `true` quando la causa più probabile è la configurazione del deploy (Supabase, Google Cloud,
   * variabili d’ambiente) e non un gesto di chi sta accedendo. Serve a decidere se mostrare anche
   * il dettaglio tecnico: a chi ha solo annullato su Google non interessa, a chi sta collegando
   * il progetto è esattamente ciò che gli manca.
   */
  readonly configuration: boolean
  /** Testo grezzo di Supabase (`error_description`), `null` se non c’è. */
  readonly detail: string | null
}

interface KnownError {
  readonly message: string
  readonly configuration: boolean
}

/**
 * Codici osservabili al ritorno. Il valore in `error_code` è più specifico di quello in `error`
 * (es. `error=access_denied` + `error_code=otp_expired`), quindi viene cercato per primo.
 *
 * `redirect_uri_mismatch` non compare qui apposta: quello Google lo mostra sulla propria pagina
 * e non redirige mai indietro, quindi l’app non lo vede. È spiegato in `docs/DEPLOY-VERCEL.md`.
 */
const KNOWN: Readonly<Record<string, KnownError>> = {
  otp_expired: {
    message:
      'Il link di accesso è scaduto o era già stato usato. Ogni link vale una volta sola: ' +
      'chiedine un altro.',
    configuration: false,
  },
  access_denied: {
    message: 'Accesso annullato: l’autorizzazione su Google non è stata concessa.',
    configuration: false,
  },
  bad_oauth_state: {
    message:
      'L’accesso è stato iniziato in un browser e concluso in un altro. Riprova aprendo il link ' +
      'sullo stesso dispositivo da cui hai premuto "Continua con Google".',
    configuration: false,
  },
  flow_state_not_found: {
    message: 'La richiesta di accesso è scaduta. Riprova dall’inizio, sullo stesso browser.',
    configuration: false,
  },
  flow_state_expired: {
    message: 'La richiesta di accesso è scaduta. Riprova dall’inizio, sullo stesso browser.',
    configuration: false,
  },
  user_banned: {
    message: 'Questo account è sospeso sul progetto Supabase.',
    configuration: false,
  },
  over_email_send_rate_limit: {
    message:
      'Troppe email di accesso richieste di seguito. Aspetta qualche minuto prima di chiederne ' +
      'un’altra.',
    configuration: false,
  },
  over_request_rate_limit: {
    message: 'Troppi tentativi di accesso ravvicinati. Aspetta qualche minuto e riprova.',
    configuration: false,
  },
  provider_disabled: {
    message: 'Il provider Google non è abilitato sul progetto Supabase di questo deploy.',
    configuration: true,
  },
  signup_disabled: {
    message:
      'La registrazione di nuovi utenti è disattivata sul progetto Supabase: questo account non ' +
      'può essere creato.',
    configuration: true,
  },
  validation_failed: {
    message:
      'Supabase ha rifiutato la richiesta di accesso: di norma succede quando il provider Google ' +
      'non è abilitato sul progetto.',
    configuration: true,
  },
  bad_oauth_callback: {
    message:
      'Il ritorno da Google è arrivato senza i parametri attesi: l’URL di callback configurato su ' +
      'Google Cloud non corrisponde a quello del progetto Supabase.',
    configuration: true,
  },
  unexpected_failure: {
    message:
      'Google ha risposto, ma Supabase non è riuscito a completare l’accesso. Di solito sono ' +
      'Client ID o Client Secret sbagliati o scaduti.',
    configuration: true,
  },
  server_error: {
    message:
      'Google ha risposto, ma Supabase non è riuscito a completare l’accesso. Di solito sono ' +
      'Client ID o Client Secret sbagliati o scaduti.',
    configuration: true,
  },
}

/** Query e frammento insieme: la query ha la precedenza, come fa l’SDK di Supabase. */
function parseParams(href: string): Readonly<Record<string, string>> {
  const out: Record<string, string> = {}
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return out
  }
  if (url.hash.startsWith('#')) {
    for (const [key, value] of new URLSearchParams(url.hash.slice(1))) out[key] = value
  }
  for (const [key, value] of url.searchParams) out[key] = value
  return out
}

/**
 * `null` quando l’URL non porta nessun errore di accesso — cioè quasi sempre: un ritorno riuscito
 * non passa da qui, lo gestisce l’SDK.
 */
export function readAuthCallbackError(href: string): AuthCallbackError | null {
  const params = parseParams(href)
  const error = params['error']
  const errorCode = params['error_code']
  const description = params['error_description']
  if (error === undefined && errorCode === undefined && description === undefined) return null

  const code = errorCode ?? error ?? 'errore_non_specificato'
  const known = KNOWN[code] ?? (error === undefined ? undefined : KNOWN[error])
  const detail = description === undefined || description === '' ? null : description

  if (known !== undefined) {
    return { code, message: known.message, configuration: known.configuration, detail }
  }
  return {
    // Codice sconosciuto: si mostra il testo di Supabase invece di inventare una spiegazione.
    // `configuration: true` perché un errore che non sappiamo classificare è, per chi legge,
    // comunque più utile con il dettaglio tecnico sotto che senza.
    code,
    message: detail === null ? `Accesso non riuscito (${code}).` : `Accesso non riuscito: ${detail}`,
    configuration: true,
    detail,
  }
}

/**
 * L’URL senza i parametri dell’accesso, in query e nel frammento. Gli altri parametri restano:
 * il ritorno può atterrare su una pagina che ne usa di propri (per esempio `?zona=` sulla mappa).
 */
export function urlWithoutAuthParams(href: string): string {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return href
  }
  for (const key of AUTH_PARAMS) url.searchParams.delete(key)

  if (url.hash.startsWith('#')) {
    const hash = new URLSearchParams(url.hash.slice(1))
    // Un frammento che non è una query (`#sezione`) non va toccato: `URLSearchParams` lo
    // leggerebbe come una chiave senza valore e lo riscriverebbe come `#sezione=`.
    if (url.hash.includes('=')) {
      for (const key of AUTH_PARAMS) hash.delete(key)
      const rest = hash.toString()
      url.hash = rest === '' ? '' : `#${rest}`
    }
  }
  return url.toString()
}
