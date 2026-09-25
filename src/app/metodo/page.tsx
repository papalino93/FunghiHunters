import { MethodScreen } from '@/components/metodo/MethodScreen'
import { JsonLd } from '@/components/JsonLd'
import { ALGORITHM_V1 } from '@/lib/config/algorithm'
import { SITE_URL, pageMetadata } from '@/lib/seo/metadata'
import { loadItaliaIndex, loadRegion } from '@/lib/snapshot/load-italia'

export const metadata = pageMetadata({
  title: 'Come calcoliamo l’indice',
  description:
    'Il modello di FungiCast spiegato: pioggia, acqua nel terreno, temperatura, stagione e bosco, ' +
    'le fonti scientifiche, quanto ci si può fidare e cosa è cambiato di versione in versione.',
  path: '/metodo',
})

export default async function MetodoPage() {
  const [index, tuscany] = await Promise.all([loadItaliaIndex(), loadRegion('toscana')])
  return (
    <>
      {/*
        * Il punteggio descritto come insieme di dati (schema.org/Dataset): cosa misura, dove,
        * con quale metodo e da quali fonti. È la pagina giusta per dichiararlo, perché è quella che
        * lo spiega.
        */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: 'Indice di compatibilità ambientale per il porcino (MPI)',
          description:
            'Punteggio giornaliero da 0 a 100, per zona, di quanto pioggia, acqua nel terreno, ' +
            'temperatura, stagione, quota e bosco somigliano alle condizioni di fruttificazione di ' +
            'Boletus edulis s.l. Non indica la presenza di funghi.',
          url: `${SITE_URL}/metodo`,
          inLanguage: 'it-IT',
          version: ALGORITHM_V1.version,
          spatialCoverage: { '@type': 'Place', name: 'Italia' },
          measurementTechnique:
            'Modello a fattori moltiplicativi su dati meteo osservati (SIR Toscana) e modellati ' +
            '(Open-Meteo), con validazione caso-controllo su presenze GBIF.',
          isBasedOn: ['https://open-meteo.com', 'https://www.sir.toscana.it', 'https://www.gbif.org'],
        }}
      />
      <MethodScreen
        nationalZones={index.zones.filter((z) => z.regionSlug !== 'toscana').length}
        tuscanyStationZones={Math.max(7, tuscany?.zones.filter((z) => z.stations.length > 0).length ?? 7)}
      />
    </>
  )
}
