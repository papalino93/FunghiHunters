import { PrivacyScreen } from '@/components/legal/PrivacyScreen'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Privacy',
  description:
    'Quali dati tratta FungiCast, perché e per quanto: senza account nulla esce dal dispositivo, ' +
    'statistiche anonime senza cookie, diario sincronizzato protetto dagli altri utenti.',
  path: '/privacy',
})

export default function PrivacyPage() {
  return <PrivacyScreen />
}
