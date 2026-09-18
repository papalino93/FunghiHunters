import { GuideScreen } from '@/components/guida/GuideScreen'

export const metadata = {
  title: 'Come funziona · FungiCast Toscana',
  description:
    'Regole di utilizzo, istruzioni schermata per schermata e domande frequenti di FungiCast ' +
    'Toscana. Cosa misura l’app, cosa non può dirti, e come sono trattati i tuoi dati.',
}

export default function GuidePage() {
  return <GuideScreen />
}
