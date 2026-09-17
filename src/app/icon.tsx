import { ImageResponse } from 'next/og'

/**
 * Icona dell'app: un porcino stilizzato, non una mappa astratta.
 *
 * Richiesta esplicita dell'utente, in tensione apparente con la direzione di design generale
 * ("mai... pieno di illustrazioni di funghi"): quella frase vale per l'interno dell'app, dove un
 * fungo disegnato ovunque diventerebbe decorazione infantile. Un singolo simbolo pulito
 * nell'icona — il punto in cui un'app *deve* farsi riconoscere in un istante, fra decine di altre
 * nella home del telefono — è l'uso esattamente opposto: identità, non decorazione.
 *
 * Generata con `next/og` (Satori, incluso in Next.js): niente strumenti esterni di rasterizzazione
 * necessari in questo ambiente.
 */
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0e16',
          borderRadius: 112,
        }}
      >
        <svg width="340" height="340" viewBox="0 0 340 340">
          {/* Gambo */}
          <path
            d="M144 190h52l10 108a26 26 0 0 1-26 28h-20a26 26 0 0 1-26-28z"
            fill="#efe3c8"
          />
          {/* Cappello: sagoma di porcino, non un fungo da cartone animato */}
          <path
            d="M170 42c-84 0-134 56-134 104 0 20 16 34 36 34h196c20 0 36-14 36-34 0-48-50-104-134-104z"
            fill="#b5793a"
          />
          <path
            d="M170 42c-84 0-134 56-134 104 0 10 4 18 10 24 18-58 68-98 124-98s106 40 124 98c6-6 10-14 10-24 0-48-50-104-134-104z"
            fill="#c98f4c"
          />
          {/* Pori sotto il cappello, appena accennati */}
          <rect x="60" y="176" width="220" height="10" rx="5" fill="#0b0e16" opacity="0.25" />
        </svg>
      </div>
    ),
    { ...size },
  )
}
