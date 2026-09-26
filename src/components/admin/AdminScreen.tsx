'use client'

import { useEffect, useState } from 'react'

import { useAuth } from '@/lib/auth/context'
import { getBrowserClient } from '@/lib/supabase/client'
import { mpiBandColor } from '@/lib/ui/scale'
import { toCsv, type AdminStats } from '@/lib/admin/stats'

interface Observation {
  readonly userId: string
  readonly id: string
  readonly date: string
  readonly zoneCode: string | null
  readonly zoneName: string | null
  readonly abundance: string | null
  readonly elevationM: number | null
  readonly notes: string | null
  readonly durationMinutes: number | null
  readonly searchers: number | null
  readonly mpiAtEntry: number | null
  readonly confidenceAtEntry: number | null
  readonly algorithmVersion: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

interface Payload {
  readonly stats: AdminStats
  readonly observations: readonly Observation[]
  readonly truncated: boolean
}

type Load =
  | { readonly state: 'loading' }
  /** Include il 404: per chi non è l'amministratore la pagina non esiste, e lo dice così. */
  | { readonly state: 'denied' }
  | { readonly state: 'error'; readonly message: string }
  | { readonly state: 'ready'; readonly data: Payload }

/** Accorcia l'uuid per la tabella: le prime otto cifre bastano a distinguere gli utenti a occhio. */
function shortId(id: string): string {
  return id.slice(0, 8)
}

function download(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Pannello amministratore: tutte le uscite sincronizzate, di tutti gli utenti.
 *
 * La pagina non compare in nessun menu e `robots.ts` la esclude. Non è però *protetta* da questo:
 * chi conosce l'indirizzo la apre, e trova una schermata che dice di non avere accesso. La difesa
 * vera sta sul server — `requireAdmin` in `/api/admin/observations` — perché una difesa che vive
 * nel browser è una difesa che si toglie con il tasto destro.
 */
/**
 * Legge i dati dal server e li traduce in uno stato della pagina.
 *
 * Fuori dal componente e senza `setState`: restituisce il risultato, e chi la chiama decide
 * quando applicarlo. È ciò che permette all'effetto qui sotto di aggiornare lo stato solo dopo
 * un `await`, invece che in modo sincrono durante il render.
 */
async function readAdminData(): Promise<Load> {
  try {
    const client = getBrowserClient()
    const session = (await client?.auth.getSession())?.data.session
    if (session === undefined || session === null) return { state: 'denied' }
    const response = await fetch('/api/admin/observations', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (response.status === 404) return { state: 'denied' }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      return { state: 'error', message: body?.error ?? `Lettura fallita (${response.status}).` }
    }
    return { state: 'ready', data: (await response.json()) as Payload }
  } catch (error) {
    return { state: 'error', message: error instanceof Error ? error.message : 'Lettura fallita.' }
  }
}

/**
 * Pannello amministratore: tutte le uscite sincronizzate, di tutti gli utenti.
 *
 * La pagina non compare in nessun menu e `robots.ts` la esclude. Non è però *protetta* da questo:
 * chi conosce l'indirizzo la apre, e trova una schermata che dice di non avere accesso. La difesa
 * vera sta sul server — `requireAdmin` in `/api/admin/observations` — perché una difesa che vive
 * nel browser è una difesa che si toglie con il tasto destro.
 */
export function AdminScreen() {
  const auth = useAuth()
  const [fetched, setFetched] = useState<Load>({ state: 'loading' })
  /** Cambia a ogni «Riprova»: è ciò che fa ripartire l'effetto di lettura. */
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (auth.status !== 'signed-in') return
    let cancelled = false
    // `.then()` e non un aggiornamento diretto: lo stato cambia solo quando la risposta arriva.
    void readAdminData().then((result) => {
      if (!cancelled) setFetched(result)
    })
    return () => { cancelled = true }
  }, [auth.status, attempt])

  /*
   * Lo stato «non hai accesso» per chi non ha fatto l'accesso si ricava, non si memorizza: dipende
   * solo da `auth.status`, e metterlo in uno stato a parte vorrebbe dire tenerli allineati a mano.
   */
  const load: Load =
    auth.status === 'loading'
      ? { state: 'loading' }
      : auth.status !== 'signed-in'
        ? { state: 'denied' }
        : fetched

  const retry = (): void => {
    setFetched({ state: 'loading' })
    setAttempt((n) => n + 1)
  }

  if (load.state === 'loading') {
    return (
      <Shell>
        <p className="text-sm text-ink-dim" aria-busy="true">Carico…</p>
      </Shell>
    )
  }

  if (load.state === 'denied') {
    return (
      <Shell>
        <p className="text-sm leading-relaxed text-ink-dim">
          Questa pagina non è disponibile per il tuo account.
        </p>
      </Shell>
    )
  }

  if (load.state === 'error') {
    return (
      <Shell>
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {load.message}
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-3 min-h-11 rounded-lg border border-edge bg-surface-2 px-3 text-sm text-ink
                     transition-colors hover:bg-surface-3 focus:outline-none focus-visible:ring-2
                     focus-visible:ring-accent"
        >
          Riprova
        </button>
      </Shell>
    )
  }

  const { stats, observations, truncated } = load.data

  const exportCsv = (): void => {
    const csv = toCsv(
      ['utente', 'id', 'data', 'zona', 'nome_zona', 'esito', 'quota_m', 'durata_min',
       'persone', 'punteggio_previsto', 'affidabilita', 'versione_modello', 'note'],
      observations.map((o) => [
        o.userId, o.id, o.date, o.zoneCode, o.zoneName, o.abundance, o.elevationM,
        o.durationMinutes, o.searchers, o.mpiAtEntry, o.confidenceAtEntry, o.algorithmVersion,
        o.notes,
      ]),
    )
    download(`fungicast-uscite-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  return (
    <Shell>
      <p className="mb-4 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
        Stai leggendo il diario di tutti gli utenti, note comprese. Ogni apertura di questa pagina
        è registrata in <code>admin_access_log</code> con data, ora e numero di righe lette.
      </p>

      {/* Le cifre d'insieme non sono un grafico: cinque numeri si leggono meglio come numeri. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="uscite" value={String(stats.totalOutings)} />
        <Tile label="utenti" value={String(stats.distinctUsers)} />
        <Tile label="zone battute" value={String(stats.distinctZones)} />
        <Tile
          label="periodo"
          value={stats.firstDate === null ? '—' : `${stats.firstDate.slice(2, 7)} → ${(stats.lastDate ?? '').slice(2, 7)}`}
        />
      </div>

      <Section title="Il punteggio ci prende?">
        <ul className="space-y-1.5">
          {stats.bands.map((band) => (
            <li key={band.label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: mpiBandColor((band.from + band.to) / 2) }}
              />
              <span className="w-28 shrink-0 truncate text-xs text-ink-dim">{band.label}</span>
              <span className="relative h-4 flex-1 overflow-hidden rounded bg-surface-2">
                {band.hitRate !== null && (
                  <span
                    className="absolute inset-y-0 left-0 rounded bg-accent/40"
                    style={{ width: `${band.hitRate * 100}%` }}
                  />
                )}
              </span>
              <span className="tabular w-24 shrink-0 text-right text-xs text-ink-faint">
                {band.hitRate === null
                  ? '—'
                  : `${(band.hitRate * 100).toFixed(0)}% · ${band.outings}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs leading-snug text-ink-faint">
          Per ogni fascia di punteggio previsto: in quante uscite si è trovato almeno qualcosa, e
          su quante uscite in tutto. Se la percentuale non cala scendendo verso il basso, il
          punteggio non sta ordinando niente. Una fascia senza uscite dice «—», non «0%».
        </p>
      </Section>

      {stats.topZones.length > 0 && (
        <Section title="Zone più battute">
          <Table
            headers={['zona', 'uscite', 'con ritrovamento']}
            rows={stats.topZones.map((z) => [z.zoneCode, String(z.outings), String(z.withFinds)])}
          />
        </Section>
      )}

      {stats.byMonth.length > 0 && (
        <Section title="Uscite per mese">
          <Table
            headers={['mese', 'uscite']}
            rows={stats.byMonth.map((m) => [m.month, String(m.outings)])}
          />
        </Section>
      )}

      <Section title={`Tutte le uscite (${observations.length})`}>
        {truncated && (
          <p className="mb-2 text-xs text-warn">
            Elenco troncato al massimo per richiesta: ci sono altre uscite oltre a queste.
          </p>
        )}
        <button
          type="button"
          onClick={exportCsv}
          className="mb-2 min-h-11 rounded-lg border border-accent/40 bg-accent/15 px-3 text-sm
                     font-medium text-ink transition-colors hover:bg-accent/25
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Scarica CSV
        </button>
        <Table
          headers={['utente', 'data', 'zona', 'esito', 'prev.', 'min', 'pers.', 'note']}
          rows={observations.map((o) => [
            shortId(o.userId),
            o.date,
            o.zoneName ?? o.zoneCode ?? '—',
            o.abundance ?? '—',
            o.mpiAtEntry === null ? '—' : o.mpiAtEntry.toFixed(0),
            o.durationMinutes === null ? '—' : String(o.durationMinutes),
            o.searchers === null ? '—' : String(o.searchers),
            o.notes ?? '',
          ])}
        />
      </Section>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-4">
      <h1 className="text-lg font-semibold tracking-tight text-ink">Pannello amministratore</h1>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-xl border border-edge bg-surface-1 p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{title}</h2>
      {children}
    </section>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-edge bg-surface-1 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="tabular mt-0.5 text-lg font-semibold text-ink">{value}</p>
    </div>
  )
}

function Table({ headers, rows }: { headers: readonly string[]; rows: ReadonlyArray<readonly string[]> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-xs">
        <thead>
          <tr className="border-b border-edge text-left text-ink-faint">
            {headers.map((h) => (
              <th key={h} scope="col" className="px-2 py-1.5 font-medium uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row[0] ?? ''}-${String(i)}`} className="border-b border-edge/50 text-ink-dim">
              {row.map((cell, j) => (
                <td key={`${String(j)}-${cell}`} className="px-2 py-1.5 align-top">
                  {cell === '' ? <span className="text-ink-faint">—</span> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
