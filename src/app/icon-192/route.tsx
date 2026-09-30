import { ImageResponse } from 'next/og'

import { BrandMark } from '@/components/brand/BrandMark'

/**
 * L'icona da 192 px del manifest.
 *
 * Chrome su Android, per proporre l'installazione, cerca nel manifest un'icona PNG da 192 e una
 * da 512 (`app/icon.tsx`). Con la sola 512 e le SVG l'app si installava lo stesso su molti
 * telefoni, ma non su tutti: questa toglie il dubbio. Generata una volta alla build.
 */
export const dynamic = 'force-static'

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        <BrandMark size={192} withBackground idPrefix="icon192" />
      </div>
    ),
    { width: 192, height: 192 },
  )
}
