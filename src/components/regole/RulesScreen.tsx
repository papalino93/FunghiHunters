import Link from 'next/link'

import { coverage, formatLongDate, permitLabel } from '@/lib/rules/format'
import type { PickingRules } from '@/lib/rules/types'

const UNKNOWN = 'Non confermato da una fonte ufficiale: verifica presso la Regione o il Comune.'

/**
 * Le norme di raccolta di una regione, da leggere prima di partire.
 *
 * Senza JavaScript, come la guida e il metodo. Ogni voce mancante lo dice invece di sparire: una
 * scheda che tace sui giorni di divieto sembrerebbe dire che non ce ne sono.
 */
export function RulesScreen({ rules }: { rules: PickingRules }) {
  const level = coverage(rules)
  const limit =
    rules.dailyLimitKg === null
      ? null
      : `${String(rules.dailyLimitKg).replace('.', ',')} kg al giorno a persona`

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
      <Link
        href="/regole"
        className="inline-flex min-h-11 items-center text-sm text-ink-dim transition-colors
                   hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        ← Tutte le regioni
      </Link>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">
        Raccolta funghi: {rules.name}
      </h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-dim">
        {rules.law}. Verificato il {formatLongDate(rules.verifiedOn)} sulle fonti ufficiali.
      </p>

      {level !== 'completa' && (
        <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm leading-snug text-warn">
          {level === 'scarsa'
            ? 'Scheda incompleta: al momento della verifica le fonti ufficiali non riportavano (o non rendevano consultabili) la maggior parte delle regole. Non partire basandoti solo su questa pagina.'
            : 'Scheda parziale: alcune regole non sono confermate da una fonte ufficiale e sono segnate come tali.'}
        </p>
      )}

      <dl className="mt-5 divide-y divide-edge rounded-xl border border-edge bg-surface-1">
        <Row title="Serve un permesso?">
          <p className="font-medium text-ink">{permitLabel(rules.permit.required)}</p>
          {rules.permit.who !== null && <p className="mt-1">{rules.permit.who}</p>}
        </Row>
        <Row title="Come si ottiene">
          <Value text={rules.permit.how} />
        </Row>
        <Row title="Quanto costa">
          <Value text={rules.permit.cost} />
        </Row>
        <Row title="Quanti funghi">
          <Value text={limit} strong />
          {rules.porciniSpecificLimit !== null && (
            <p className="mt-1">Porcini: {rules.porciniSpecificLimit}</p>
          )}
        </Row>
        <Row title="Giorni">
          <Value text={rules.days} />
        </Row>
        <Row title="Orari">
          <Value text={rules.hours} />
        </Row>
        <Row title="Misura minima dei porcini">
          <Value text={rules.minSizePorcini} />
        </Row>
        <Row title="Contenitori e attrezzi">
          <Value text={rules.tools} />
        </Row>
        <Row title="Dove non si può">
          <Value text={rules.protectedAreas} />
        </Row>
        <Row title="Sanzioni">
          <Value text={rules.sanctions} />
        </Row>
        <Row title="Controllo dei funghi raccolti">
          <Value
            text={
              rules.mycologicalInspectorate ??
              'Gli ispettorati micologici delle ASL controllano i funghi raccolti dai privati: chiedi alla tua ASL orari e sedi.'
            }
          />
        </Row>
      </dl>

      {rules.notes !== null && (
        <section className="mt-5">
          <h2 className="text-base font-semibold text-ink">Da sapere</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{rules.notes}</p>
        </section>
      )}

      <section className="mt-5">
        <h2 className="text-base font-semibold text-ink">Fonti</h2>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <Source href={rules.lawUrl} label={`Testo della legge (${rules.law})`} />
          <Source href={rules.officialPageUrl} label="Pagina ufficiale sulla raccolta" />
          {rules.permit.sourceUrl !== rules.officialPageUrl && (
            <Source href={rules.permit.sourceUrl} label="Permessi e pagamenti" />
          )}
        </ul>
      </section>

      <p className="mt-6 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-snug text-ink-dim">
        Questa pagina è un riassunto, non una consulenza legale. Comuni, Unioni montane e parchi
        possono avere regole proprie e più restrittive, e le tariffe cambiano per delibera: prima di
        partire verifica la versione vigente sul sito della Regione o dell&apos;ente del posto.
        L&apos;app non riconosce le specie e non dice mai se un fungo è commestibile.
      </p>

      <p className="mt-6 text-sm">
        <Link
          href={`/italia/${rules.regionSlug}`}
          className="text-accent underline underline-offset-2"
        >
          Le condizioni per il porcino di oggi, zona per zona
        </Link>
      </p>
    </div>
  )
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{title}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-ink-dim">{children}</dd>
    </div>
  )
}

function Value({ text, strong = false }: { text: string | null; strong?: boolean }) {
  if (text === null) return <p className="italic text-ink-faint">{UNKNOWN}</p>
  return <p className={strong ? 'font-medium text-ink' : undefined}>{text}</p>
}

function Source({ href, label }: { href: string | null; label: string }) {
  if (href === null) return null
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="break-words underline decoration-dotted underline-offset-2 hover:text-ink"
      >
        {label}
      </a>
    </li>
  )
}
