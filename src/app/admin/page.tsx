import type { Metadata } from 'next'

import { AdminScreen } from '@/components/admin/AdminScreen'

/**
 * `noindex, nofollow` oltre all'esclusione in `robots.ts`: il file robots è una richiesta gentile
 * che un crawler può ignorare, il meta è un'istruzione che i motori seri rispettano. Nessuna delle
 * due è una protezione — quella sta su `/api/admin/observations` — ma una pagina che dice
 * «amministratore» nei risultati di ricerca è un invito che si può evitare gratis.
 */
export const metadata: Metadata = {
  title: 'Pannello amministratore',
  robots: { index: false, follow: false },
}

export default function AdminPage() {
  return <AdminScreen />
}
