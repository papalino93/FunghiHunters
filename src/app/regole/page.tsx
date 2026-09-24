import { RulesIndex } from '@/components/regole/RulesIndex'
import { PICKING_RULES } from '@/lib/rules'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Regole per la raccolta dei funghi, regione per regione',
  description:
    'Tesserino, limiti in kg, giorni, orari, misure minime e divieti per la raccolta dei funghi ' +
    'in ogni regione italiana, dalle leggi regionali e dalle pagine ufficiali, con la data di verifica.',
  path: '/regole',
})

export default function RegolePage() {
  return <RulesIndex rules={PICKING_RULES} />
}
