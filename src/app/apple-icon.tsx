import { ImageResponse } from 'next/og'

import { BrandMark } from '@/components/brand/BrandMark'

/**
 * Icona per "Aggiungi a Home" su iOS/iPadOS.
 *
 * Safari non usa `icon.tsx` per la schermata Home: cerca specificamente `apple-touch-icon`,
 * altrimenti la aggiunge da solo prendendo uno screenshot della pagina — un rettangolo bianco
 * con dentro la mappa, non un'icona. Stesso segno di `icon.tsx`, 180×180 come raccomandato da
 * Apple, **senza angoli arrotondati**: iOS li applica già da solo e un doppio arrotondamento
 * lascia un bordo visibile.
 */
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        <BrandMark size={180} withBackground rounded={false} idPrefix="apple" />
      </div>
    ),
    { ...size },
  )
}
