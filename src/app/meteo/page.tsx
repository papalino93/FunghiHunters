import { MeteoScreen } from '@/components/meteo/MeteoScreen'

export const metadata = {
  title: 'Meteo · FungiCast Toscana',
  description:
    'Cerca un luogo e consulta temperatura, pioggia, vento e umidità: dato meteo grezzo, ' +
    'indipendente dal punteggio delle zone di FungiCast Toscana.',
}

export default function MeteoPage() {
  return <MeteoScreen />
}
