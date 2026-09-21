import Link from 'next/link'

import { loadItaliaIndex } from '@/lib/snapshot/load-italia'

/**
 * Il menu delle regioni.
 *
 * Primo dei due livelli chiesti: prima la regione, poi la zona dentro la regione. E' una pagina
 * server senza stato: un elenco di link, che funziona anche prima che il JavaScript arrivi.
 */
export const revalidate = 3600

export const metadata = {
  title: 'Italia — scegli la regione',
  description:
    'Compatibilità delle condizioni con la fruttificazione del porcino, regione per regione. ' +
    'Non indica la presenza di funghi.',
}

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
                <Link
                  href={`/italia/${region.slug}`}
                  className="flex min-h-14 flex-col justify-center rounded-xl border border-edge
                             bg-surface-1 px-3 py-2 transition-colors hover:border-accent
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="text-sm font-medium text-ink">{region.name}</span>
                  <span className="text-[11px] text-ink-faint">
                    {region.zoneCount} {region.zoneCount === 1 ? 'zona' : 'zone'}
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
