import { GuideScreen } from '@/components/guida/GuideScreen'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Come funziona',
  description:
    'Regole di utilizzo, istruzioni schermata per schermata e domande frequenti di FungiCast. ' +
    'Cosa misura l’app, cosa non può dirti, e come sono trattati i tuoi dati.',
  path: '/guida',
})

export default function GuidePage() {
  return <GuideScreen />
}
