import { ImageResponse } from 'next/og'

import { BrandMark } from '@/components/brand/BrandMark'

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
        {/* Il segno col suo quadrato verde: sul fondo scuro dell'app è la cosa che si nota. */}
        <div style={{ display: 'flex', flexShrink: 0 }}>
          <BrandMark size={260} withBackground idPrefix="og" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 64 }}>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, color: '#eef1f8' }}>
            FungiCast
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
            Dove conviene andare a cercare porcini in Italia, con dati reali e incertezza
            dichiarata — non una promessa.
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
