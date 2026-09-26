import { ImageResponse } from 'next/og'

import { BrandMark } from '@/components/brand/BrandMark'

/**
 * Icona dell'app: il porcino-segnaposto di `@/lib/brand/mark`.
 *
 * Un singolo simbolo pulito nell'icona — il punto in cui un'app *deve* farsi riconoscere in un
 * istante, fra decine di altre nella home del telefono — è identità, non decorazione: vale per
 * questo file quello che non vale per l'interno dell'app, dove un fungo disegnato ovunque
 * diventerebbe infantile.
 *
 * Generata con `next/og` (Satori, incluso in Next.js): niente strumenti esterni di rasterizzazione.
 */
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        <BrandMark size={512} withBackground idPrefix="icon" />
      </div>
    ),
    { ...size },
  )
}
