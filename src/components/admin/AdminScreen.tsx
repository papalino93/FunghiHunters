'use client'

import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '@/lib/auth/context'
import { getBrowserClient } from '@/lib/supabase/client'
import { mpiBandColor } from '@/lib/ui/scale'
import { formatPeriod, toCsv, type AdminStats } from '@/lib/admin/stats'
import { ABUNDANCE_LABELS, ABUNDANCE_RANK, isAbundance } from '@/lib/diary/types'

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

/**
 * Quota di ogni zona, dall'indice nazionale (tutte le 1.404, comprese le aree storiche). Le uscite
 * salvano codice e nome, non la quota: qui serve per leggere «Mugello · 900 m» accanto a «Vicchio
 * · 376 m». Un file pubblico, letto una volta; se non arriva, la tabella resta con i soli nomi.
 */
function useZoneElevations(): ReadonlyMap<string, number> {
  const [map, setMap] = useState<ReadonlyMap<string, number>>(() => new Map())
  useEffect(() => {
    let cancelled = false
    void fetch('/data/italia-index.json')
      .then(async (response) => (response.ok ? ((await response.json()) as { zones?: unknown }) : null))
      .then((body) => {
        if (cancelled || body === null || !Array.isArray(body.zones)) return
        const next = new Map<string, number>()
        for (const z of body.zones as Array<{ code?: unknown; elevationM?: unknown }>) {
          if (typeof z.code === 'string' && typeof z.elevationM === 'number') next.set(z.code, z.elevationM)
        }
        setMap(next)
      })
      .catch(() => {
        // Solo un dettaglio in più: senza, i nomi bastano.
      })
    return () => { cancelled = true }
  }, [])
  return map
}

function zoneCell(
  code: string | null,
  name: string | null,
  elevations: ReadonlyMap<string, number>,
): string {
  const base = name ?? code ?? '—'
  const elevation = code === null ? undefined : elevations.get(code)
  return elevation === undefined ? base : `${base} · ${String(Math.round(elevation))} m`
}

/** Accorcia l'uuid per la tabella: le prime otto cifre bastano a distinguere gli utenti a occhio. */
function shortId(id: string): string {
  return id.slice(0, 8)
}

/**
 * L'esito come lo legge una persona: «pochi», non `few`. Il codice interno resta nel database e
 * nella colonna `esito_rango` del CSV; in una tabella da leggere a occhio non ha niente da fare.
 */
function abundanceLabel(value: string | null): string {
  return isAbundance(value) ? ABUNDANCE_LABELS[value] : '—'
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
  const elevations = useZoneElevations()
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

  // Codice → nome, per non mostrare «amiata» sopra una tabella che dice «Monte Amiata».
  const zoneNames = new Map<string, string>()
  for (const o of observations) {
    if (o.zoneCode !== null && o.zoneName !== null && o.zoneName !== '') zoneNames.set(o.zoneCode, o.zoneName)
  }

  const exportCsv = (): void => {
    /*
     * `esito_rango` accanto all'etichetta: «pochi» si legge, 1 si calcola. Con il rango da 0
     * (nessuno) a 4 (eccezionale) in una colonna numerica, una correlazione fra punteggio
     * previsto ed esito in Excel è una formula, non una tabella di conversione da costruire.
     */
    const csv = toCsv(
      ['utente', 'id', 'data', 'zona', 'nome_zona', 'quota_zona_m', 'esito', 'esito_rango', 'quota_m',
       'durata_min', 'persone', 'punteggio_previsto', 'affidabilita', 'versione_modello', 'note'],
      observations.map((o) => [
        o.userId, o.id, o.date, o.zoneCode, o.zoneName,
        o.zoneCode === null ? null : (elevations.get(o.zoneCode) ?? null), abundanceLabel(o.abundance),
        isAbundance(o.abundance) ? ABUNDANCE_RANK[o.abundance] : null, o.elevationM,
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
          value={formatPeriod(stats.firstDate, stats.lastDate)}
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
            rows={stats.topZones.map((z) => [
              zoneCell(z.zoneCode, zoneNames.get(z.zoneCode) ?? null, elevations),
              String(z.outings),
              String(z.withFinds),
            ])}
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
        {/* Ricarica senza passare da «Carico…»: il messaggio dell'eliminazione resta a schermo. */}
        <ObservationsTable
          observations={observations}
          elevations={elevations}
          onDeleted={() => { setAttempt((n) => n + 1) }}
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

/** Chiave di una riga: lo stesso id di uscita può esistere, in teoria, per due utenti diversi. */
function rowKey(o: Pick<Observation, 'userId' | 'id'>): string {
  return `${o.userId}/${o.id}`
}

async function deleteObservations(items: readonly { userId: string; id: string }[]): Promise<number> {
  const session = (await getBrowserClient()?.auth.getSession())?.data.session
  if (session === undefined || session === null) throw new Error('Sessione scaduta: rifai l’accesso.')
  const response = await fetch('/api/admin/observations', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  const body = (await response.json().catch(() => null)) as { deleted?: number; error?: string } | null
  if (!response.ok) throw new Error(body?.error ?? `Eliminazione non riuscita (${response.status}).`)
  return body?.deleted ?? 0
}

/**
 * L'elenco di tutte le uscite, con la possibilità di eliminarle.
 *
 * Pensato per le raffiche di prova («20 registrazioni di test» falserebbero la verifica del
 * punteggio): si filtra per utente, si seleziona tutto quello che si vede, e si conferma. La
 * conferma è un secondo pulsante, non un `confirm()` del browser, che su iPhone nell'app
 * installata a volte non compare.
 */
function ObservationsTable({
  observations,
  elevations,
  onDeleted,
}: {
  observations: readonly Observation[]
  elevations: ReadonlyMap<string, number>
  onDeleted: () => void
}) {
  const [userFilter, setUserFilter] = useState<string>('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const users = useMemo(() => {
    const counts = new Map<string, number>()
    for (const o of observations) counts.set(o.userId, (counts.get(o.userId) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [observations])

  const visible = userFilter === '' ? observations : observations.filter((o) => o.userId === userFilter)
  const visibleKeys = visible.map(rowKey)
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k))
  const chosen = observations.filter((o) => selected.has(rowKey(o)))

  const toggle = (key: string): void => {
    setConfirming(false)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAllVisible = (): void => {
    setConfirming(false)
    setSelected((current) => {
      const next = new Set(current)
      for (const key of visibleKeys) {
        if (allVisibleSelected) next.delete(key)
        else next.add(key)
      }
      return next
    })
  }

  const remove = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      let deleted = 0
      // A blocchi di 200, il massimo che la rotta accetta per richiesta.
      for (let i = 0; i < chosen.length; i += 200) {
        deleted += await deleteObservations(chosen.slice(i, i + 200).map((o) => ({ userId: o.userId, id: o.id })))
      }
      setSelected(new Set())
      setConfirming(false)
      setMessage(`${String(deleted)} ${deleted === 1 ? 'uscita eliminata' : 'uscite eliminate'}.`)
      onDeleted()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Eliminazione non riuscita.')
      // Un blocco può essere passato prima dell'errore: la tabella si rilegge comunque.
      setSelected(new Set())
      setConfirming(false)
      onDeleted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="text-xs text-ink-dim" htmlFor="admin-user-filter">
          Utente
        </label>
        <select
          id="admin-user-filter"
          value={userFilter}
          onChange={(e) => {
            setUserFilter(e.target.value)
            // Si elimina solo quello che si vede: una selezione nascosta dal filtro no.
            setSelected(new Set())
            setConfirming(false)
          }}
          className="min-h-11 rounded-lg border border-edge bg-surface-2 px-2 text-sm text-ink
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="">tutti ({observations.length})</option>
          {users.map(([id, count]) => (
            <option key={id} value={id}>
              {shortId(id)} ({count})
            </option>
          ))}
        </select>

        {chosen.length > 0 &&
          (confirming ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-danger">
                Eliminare {chosen.length} {chosen.length === 1 ? 'uscita' : 'uscite'}? Sparisce
                anche dal diario di chi l’ha scritta.
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className="min-h-11 rounded-lg border border-danger/50 bg-danger/15 px-3 text-sm font-semibold
                           text-danger disabled:opacity-50 focus:outline-none focus-visible:ring-2
                           focus-visible:ring-danger"
              >
                {busy ? 'Elimino…' : 'Sì, elimina'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setConfirming(false) }}
                className="min-h-11 rounded-lg px-3 text-sm text-ink-dim hover:text-ink focus:outline-none
                           focus-visible:ring-2 focus-visible:ring-accent"
              >
                Annulla
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => { setConfirming(true) }}
              className="min-h-11 rounded-lg border border-danger/40 bg-danger/10 px-3 text-sm font-medium
                         text-danger transition-colors hover:bg-danger/20 focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-danger"
            >
              Elimina selezionate ({chosen.length})
            </button>
          ))}
      </div>
      {message !== null && (
        <p role="status" className="mb-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-dim">
          {message}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-xs">
          <thead>
            <tr className="border-b border-edge text-left text-ink-faint">
              <th scope="col" className="w-10 px-2 py-1.5">
                <input
                  type="checkbox"
                  aria-label="Seleziona tutte le uscite mostrate"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  className="h-5 w-5 accent-[var(--accent)]"
                />
              </th>
              {['utente', 'data', 'zona', 'esito', 'punteggio', 'min', 'pers.', 'note'].map((h) => (
                <th key={h} scope="col" className="px-2 py-1.5 font-medium uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => {
              const key = rowKey(o)
              const isSelected = selected.has(key)
              return (
                <tr
                  key={key}
                  className={`border-b border-edge/50 text-ink-dim ${isSelected ? 'bg-danger/5' : ''}`}
                >
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      aria-label={`Seleziona l'uscita del ${o.date} a ${o.zoneName ?? o.zoneCode ?? '—'}`}
                      checked={isSelected}
                      onChange={() => { toggle(key) }}
                      className="h-5 w-5 accent-[var(--accent)]"
                    />
                  </td>
                  <td className="px-2 py-1.5 font-mono">{shortId(o.userId)}</td>
                  <td className="px-2 py-1.5">{o.date}</td>
                  <td className="px-2 py-1.5">{zoneCell(o.zoneCode, o.zoneName, elevations)}</td>
                  <td className="px-2 py-1.5">{abundanceLabel(o.abundance)}</td>
                  <td className="px-2 py-1.5 tabular">{o.mpiAtEntry === null ? '—' : o.mpiAtEntry.toFixed(0)}</td>
                  <td className="px-2 py-1.5 tabular">{o.durationMinutes === null ? '—' : String(o.durationMinutes)}</td>
                  <td className="px-2 py-1.5 tabular">{o.searchers === null ? '—' : String(o.searchers)}</td>
                  <td className="px-2 py-1.5">{o.notes ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
