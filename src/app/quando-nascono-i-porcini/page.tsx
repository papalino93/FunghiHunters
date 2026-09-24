import { JsonLd } from '@/components/JsonLd'
import { PorciniGuide } from '@/components/sapere/PorciniGuide'
import { pageMetadata, SITE_URL } from '@/lib/seo/metadata'

const TITLE = 'Quando nascono i porcini: dopo quanti giorni dalla pioggia, temperatura e quota'
const DESCRIPTION =
  'Dopo quanti giorni dalla pioggia escono i porcini, quanta acqua serve, che temperatura ' +
  'vogliono, in che mese e a che quota: le risposte della ricerca scientifica, con le fonti.'

export const metadata = pageMetadata({
  title: 'Quando nascono i porcini',
  description: DESCRIPTION,
  path: '/quando-nascono-i-porcini',
})

export default function Page() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: TITLE,
          description: DESCRIPTION,
          inLanguage: 'it',
          datePublished: '2026-09-24',
          dateModified: '2026-09-24',
          mainEntityOfPage: `${SITE_URL}/quando-nascono-i-porcini`,
          author: { '@type': 'Person', name: 'Andrea' },
          publisher: { '@type': 'Organization', name: 'FungiCast', url: SITE_URL },
        }}
      />
      <PorciniGuide />
    </>
  )
}
