import { ImageResponse } from 'next/og'

/**
 * L'anteprima che compare condividendo il link su WhatsApp, Telegram, iMessage o social.
 * Next la collega da solo ai meta tag `og:image` di ogni pagina grazie al nome del file — non
 * serve dichiararla a mano in `metadata`.
 */
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          background: '#0b0e16',
          padding: '0 88px',
        }}
      >
        <svg width="260" height="260" viewBox="0 0 340 340" style={{ flexShrink: 0 }}>
          <path
            d="M144 190h52l10 108a26 26 0 0 1-26 28h-20a26 26 0 0 1-26-28z"
            fill="#efe3c8"
          />
          <path
            d="M170 42c-84 0-134 56-134 104 0 20 16 34 36 34h196c20 0 36-14 36-34 0-48-50-104-134-104z"
            fill="#b5793a"
          />
          <path
            d="M170 42c-84 0-134 56-134 104 0 10 4 18 10 24 18-58 68-98 124-98s106 40 124 98c6-6 10-14 10-24 0-48-50-104-134-104z"
            fill="#c98f4c"
          />
          <rect x="60" y="176" width="220" height="10" rx="5" fill="#0b0e16" opacity="0.25" />
        </svg>

        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 64 }}>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, color: '#eef1f8' }}>
            FungiCast Toscana
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 20,
              fontSize: 32,
              lineHeight: 1.4,
              color: '#a3adc4',
              maxWidth: 760,
            }}
          >
            Dove conviene andare a cercare porcini in Toscana, con dati reali e incertezza
            dichiarata — non una promessa.
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
