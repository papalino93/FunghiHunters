import { ImageResponse } from 'next/og'

/**
 * Icona per "Aggiungi a Home" su iOS/iPadOS.
 *
 * Safari non usa `icon.tsx` per la schermata Home: cerca specificamente `apple-touch-icon`,
 * altrimenti la aggiunge da solo prendendo uno screenshot della pagina — un rettangolo bianco
 * con dentro la mappa, non un'icona. Stessa illustrazione di `icon.tsx`, dimensione 180×180
 * come raccomandato da Apple, senza angoli arrotondati: iOS li applica già da solo e un doppio
 * arrotondamento lascia un bordo visibile.
 */
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
        }}
      >
        <svg width="120" height="120" viewBox="0 0 340 340">
          <path d="M144 190h52l10 108a26 26 0 0 1-26 28h-20a26 26 0 0 1-26-28z" fill="#efe3c8" />
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
      </div>
    ),
    { ...size },
  )
}
