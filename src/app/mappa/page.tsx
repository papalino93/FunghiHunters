import { Suspense } from 'react'

import { AppShell } from '@/components/AppShell'
import { loadSnapshot } from '@/lib/snapshot/load'

export const metadata = { title: 'Mappa · FungiCast' }
export const revalidate = 3600

export default async function MappaPage() {
  const snapshot = await loadSnapshot()
  // `useSearchParams` sospende durante il prerender: il confine lo rende esplicito invece di
  // far diventare dinamica l'intera pagina.
  return (
    <Suspense fallback={<div className="h-full w-full bg-surface-0" />}>
      <AppShell snapshot={snapshot} />
    </Suspense>
  )
}
