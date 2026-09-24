import Link from 'next/link'

/**
 * Pagina inesistente, in italiano e con le strade utili: prima si vedeva «This page could not be
 * found.», in inglese e senza nessun collegamento, che per chi arriva da un link vecchio sembra un
 * sito rotto. La barra in basso resta, perché il layout sta sopra.
 */
export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-8">
      <h1 className="text-lg font-semibold text-ink">Questa pagina non c&apos;è</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        Il link potrebbe essere vecchio o scritto male. Da qui puoi ripartire:
      </p>
      <ul className="mt-3 space-y-1 text-sm">
        {[
          ['/', 'Dove vado oggi'],
          ['/italia', 'Tutte le regioni'],
          ['/mappa', 'La mappa delle zone'],
          ['/meteo', 'Il meteo di un luogo'],
          ['/metodo', 'Come calcoliamo l’indice'],
        ].map(([href, label]) => (
          <li key={href}>
            <Link
              href={href as string}
              className="inline-flex min-h-11 items-center text-accent underline underline-offset-2"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
