import { MeteoScreen } from '@/components/meteo/MeteoScreen'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Meteo',
  description:
    'Cerca un luogo e consulta temperatura, pioggia, vento e umidità: dato meteo grezzo, ' +
    'indipendente dal punteggio delle zone di FungiCast.',
  path: '/meteo',
})

export default function MeteoPage() {
  return <MeteoScreen />
}
