'use client'

import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

import { ANALYTICS_ENABLED, sanitizeAnalyticsUrl } from '@/lib/seo/services'

/** Statistiche di visita e velocità reale delle pagine (vedi `lib/seo/services.ts`). */
export function SiteAnalytics() {
  if (!ANALYTICS_ENABLED) return null
  return (
    <>
      <Analytics beforeSend={(event) => ({ ...event, url: sanitizeAnalyticsUrl(event.url) })} />
      <SpeedInsights beforeSend={(event) => ({ ...event, url: sanitizeAnalyticsUrl(event.url) })} />
    </>
  )
}
