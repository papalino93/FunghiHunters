import { AboutScreen } from '@/components/legal/AboutScreen'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Chi siamo',
  description:
    'FungiCast è un progetto personale e non commerciale: stima ogni giorno le condizioni per il ' +
    'porcino in tutta Italia, con metodo e fonti pubbliche.',
  path: '/chi-siamo',
})

export default function ChiSiamoPage() {
  return <AboutScreen />
}
