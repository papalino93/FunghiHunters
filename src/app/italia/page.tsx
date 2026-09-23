import Link from 'next/link'

import { pageMetadata } from '@/lib/seo/metadata'
import { loadItaliaIndex } from '@/lib/snapshot/load-italia'

/**
 * Il menu delle regioni.
 *
 * Primo dei due livelli chiesti: prima la regione, poi la zona dentro la regione. E' una pagina
 * server senza stato: un elenco di link, che funziona anche prima che il JavaScript arrivi.
 */
export const revalidate = 3600

// Il " · FungiCast" che qui mancava lo aggiunge ora il template del layout.
export const metadata = pageMetadata({
  title: 'Italia — scegli la regione',
  description:
    'Compatibilità delle condizioni con la fruttificazione del porcino, regione per regione. ' +
    'Non indica la presenza di funghi.',
  path: '/italia',
})

export default async function Page() {
  const index = await loadItaliaIndex()

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-4">
      <h1 className="text-lg font-semibold text-ink">Scegli la regione</h1>

      {index.regions.length === 0 ? (
        <p className="mt-3 rounded-xl border border-edge bg-surface-1 p-3 text-sm text-ink-dim">
          Le zone fuori dalla Toscana non sono ancora state calcolate. La Toscana resta disponibile
          dalla schermata principale.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-dim">
            Fuori dalla Toscana il punteggio viene dal solo modello meteo: non ci sono stazioni di
            misura collegate, e l&apos;affidabilità indicata su ogni zona ne tiene conto.
          </p>

          <ul className="mt-4 grid grid-cols-2 gap-2">
            {index.regions.map((region) => (
              <li key={region.slug}>
                {/*
                  * `prefetch={false}`: venti link tutti visibili insieme facevano scaricare al
                  * browser le venti regioni intere (~900 kB di payload RSC) appena aperta la
                  * pagina, per aprirne poi una sola. Ogni regione è comunque statica e in cache:
                  * caricata al tocco arriva in fretta lo stesso.
                  */}
                <Link
                  href={`/italia/${region.slug}`}
                  prefetch={false}
                  className="flex min-h-14 flex-col justify-center rounded-xl border border-edge
                             bg-surface-1 px-3 py-2 transition-colors hover:border-accent
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="text-sm font-medium text-ink">{region.name}</span>
                  <span className="text-xs text-ink-faint">
                    {region.zoneCount} {region.zoneCount === 1 ? 'zona' : 'zone'}
                    {/*
                      * Detto qui, prima di entrare: la Toscana ha anche le sette aree tarate
                      * sulle stazioni (quelle di "Dove vado"), le altre sono tutte anteprima.
                      * Senza, "Toscana 24 zone" contraddiceva le "7 aree" del benvenuto.
                      */}
                    {region.slug === 'toscana' ? ' · più 7 aree tarate su stazioni' : ' · anteprima'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
