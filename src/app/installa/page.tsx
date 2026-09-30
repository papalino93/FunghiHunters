import { InstallScreen } from '@/components/install/InstallScreen'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Installa l’app',
  description:
    'Come mettere FungiCast nella schermata Home di iPhone e Android, passo per passo: si apre ' +
    'come un’app, a tutto schermo e anche senza rete in bosco.',
  path: '/installa',
})

export default function InstallaPage() {
  return <InstallScreen />
}
