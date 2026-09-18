'use client'

import { useState } from 'react'

import { useAuth } from '@/lib/auth/context'
import { createDiaryRepository, toExport } from '@/lib/diary/store'
import { getBrowserClient } from '@/lib/supabase/client'
import { useDiarySync } from '@/lib/sync/useDiarySync'
import { useIsHydrated } from '@/lib/ui/useIsHydrated'

const SYNC_LABEL: Readonly<Record<string, string>> = {
  local: 'Salvato solo su questo dispositivo',
  syncing: 'Sincronizzazione in corso…',
  synced: 'Sincronizzato',
  error: 'Errore di sincronizzazione',
}

/**
 * Schermata account: login, stato di sincronizzazione, dati personali.
 *
 * Nessuna funzione qui è obbligatoria per usare l'app. La consultazione — mappa, previsione,
 * "prima di partire" — resta piena senza account: il login serve solo a chi vuole salvare il
 * diario su più dispositivi.
 */
export function AccountScreen() {
  const hydrated = useIsHydrated()
  const auth = useAuth()
  const repo = hydrated ? createDiaryRepository().repo : null
  const diarySync = useDiarySync(repo)

  if (!hydrated || auth.status === 'loading') return <Loading />

  if (auth.status === 'unavailable') {
    return (
      <Shell>
        <p className="rounded-lg border border-edge bg-surface-1 px-3 py-2 text-sm leading-snug text-ink-dim">
          La sincronizzazione fra dispositivi non è configurata su questo deploy: mancano le
          variabili d&apos;ambiente di Supabase. Il diario resta pienamente utilizzabile su questo
          dispositivo — vedi la scheda Diario per esportarlo.
        </p>
      </Shell>
    )
  }

  if (auth.status === 'signed-out') {
    return (
      <Shell>
        <SignInPanel />
      </Shell>
    )
  }

  return (
    <Shell>
      <SignedInPanel email={auth.user.email} sync={diarySync} />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Account</h1>
        <p className="mt-1 text-sm leading-snug text-ink-dim">
          Accedi solo se vuoi ritrovare diario, aree salvate e preferenze su un altro telefono.
        </p>
      </header>
      {children}
    </div>
  )
}

function SignInPanel() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleGoogle = async (): Promise<void> => {
    const { error } = await auth.signInWithGoogle()
    if (error !== null) setMessage(error)
  }

  const handleMagicLink = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setSending(true)
    const { error } = await auth.signInWithMagicLink(email)
    setSending(false)
    setMessage(
      error ?? `Ti abbiamo mandato un link di accesso a ${email}. Aprilo da questo dispositivo.`,
    )
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => { void handleGoogle() }}
        className="min-h-12 w-full rounded-xl border border-edge bg-surface-1 text-sm font-semibold
                   text-ink transition-colors hover:bg-surface-2 focus:outline-none
                   focus-visible:ring-2 focus-visible:ring-accent"
      >
        Continua con Google
      </button>

      <div className="flex items-center gap-2 text-[11px] text-ink-faint">
        <span className="h-px flex-1 bg-edge" /> oppure <span className="h-px flex-1 bg-edge" />
      </div>

      <form onSubmit={(e) => { void handleMagicLink(e) }} className="space-y-2">
        <label htmlFor="account-email" className="text-xs font-medium text-ink-dim">
          Email, senza password
        </label>
        <input
          id="account-email"
          type="email"
          required
          value={email}
          onChange={(e) => { setEmail(e.target.value) }}
          placeholder="tu@esempio.it"
          className="min-h-12 w-full rounded-xl border border-edge bg-surface-1 px-3 text-sm
                     text-ink placeholder:text-ink-faint focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="submit"
          disabled={sending}
          className="min-h-12 w-full rounded-xl border border-accent/40 bg-accent/15 text-sm
                     font-semibold text-ink transition-colors hover:bg-accent/25
                     disabled:opacity-40 focus:outline-none focus-visible:ring-2
                     focus-visible:ring-accent"
        >
          {sending ? 'Invio…' : 'Inviami un link di accesso'}
        </button>
      </form>

      {message !== null && (
        <p role="status" className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-dim">
          {message}
        </p>
      )}
    </div>
  )
}

function SignedInPanel({
  email,
  sync,
}: {
  email: string | null
  sync: ReturnType<typeof useDiarySync>
}) {
  const auth = useAuth()
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmForceSync, setConfirmForceSync] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleExport = async (): Promise<void> => {
    const { repo } = createDiaryRepository()
    const entries = await repo.list()
    const blob = new Blob([JSON.stringify(toExport(entries), null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'diario-fungicast.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleDelete = async (): Promise<void> => {
    setDeleting(true)
    try {
      const client = getBrowserClient()
      const session = (await client?.auth.getSession())?.data.session
      if (session === undefined || session === null) throw new Error('Sessione scaduta.')
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Cancellazione fallita (${response.status}).`)
      }
      await auth.signOut()
      setMessage('Account e dati cancellati.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cancellazione fallita.')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-edge bg-surface-1 p-3">
        <p className="text-sm font-medium text-ink">{email ?? 'Account collegato'}</p>
        <div className="mt-2 flex items-center gap-2">
          <SyncDot status={sync.status} />
          <span className="text-xs text-ink-dim">{SYNC_LABEL[sync.status]}</span>
        </div>
        {sync.status === 'error' && sync.error !== null && (
          <p className="mt-1 text-xs text-danger">{sync.error}</p>
        )}
        {sync.lastSyncedAt !== null && sync.status !== 'syncing' && (
          <p className="mt-1 text-[11px] text-ink-faint">
            Ultima sincronizzazione: {new Date(sync.lastSyncedAt).toLocaleString('it-IT')}
          </p>
        )}

        {sync.accountMismatch && (
          <div className="mt-2 rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-2">
            <p className="text-[11px] leading-snug text-warn">
              Il diario su questo dispositivo risulta sincronizzato l&apos;ultima volta con un
              altro account. Non lo invio automaticamente: potrebbe contenere le uscite di
              qualcun altro. Guarda la scheda Diario prima di decidere — sincronizzarlo qui lo
              invierebbe a <strong>questo</strong> account.
            </p>
            {confirmForceSync ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => { void sync.sync({ force: true }); setConfirmForceSync(false) }}
                  className="min-h-10 flex-1 rounded-lg bg-warn/80 text-xs font-semibold text-ink
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-warn"
                >
                  Sincronizza comunque
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmForceSync(false) }}
                  className="min-h-10 rounded-lg border border-edge px-3 text-xs text-ink-dim
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  annulla
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setConfirmForceSync(true) }}
                className="mt-2 min-h-10 w-full rounded-lg border border-warn/40 text-xs
                           font-medium text-warn focus:outline-none focus-visible:ring-2
                           focus-visible:ring-warn"
              >
                Sincronizza comunque…
              </button>
            )}
          </div>
        )}

        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={() => { void sync.sync() }}
            disabled={sync.status === 'syncing' || sync.accountMismatch}
            className="min-h-11 flex-1 rounded-lg border border-edge bg-surface-2 text-xs
                       font-medium text-ink transition-colors hover:bg-surface-3 disabled:opacity-40
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Sincronizza ora
          </button>
          <button
            type="button"
            onClick={() => { void auth.signOut() }}
            className="min-h-11 flex-1 rounded-lg border border-edge bg-surface-2 text-xs
                       font-medium text-ink transition-colors hover:bg-surface-3
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Esci
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-edge bg-surface-1 p-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          I tuoi dati
        </h2>
        <p className="mt-1.5 text-xs leading-snug text-ink-dim">
          Le coordinate esatte delle tue uscite non lasciano mai questo dispositivo, a meno che tu
          non scelga esplicitamente &quot;coordinate esatte&quot; per una voce. Solo tu puoi leggere
          o modificare i tuoi dati: lo garantisce la Row Level Security del database.
        </p>
        <button
          type="button"
          onClick={() => { void handleExport() }}
          className="mt-2.5 min-h-11 w-full rounded-lg border border-edge bg-surface-2 text-sm
                     font-medium text-ink transition-colors hover:bg-surface-3 focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-accent"
        >
          Scarica una copia dei miei dati
        </button>
      </section>

      <section className="rounded-xl border border-danger/30 bg-danger/5 p-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-danger">
          Zona pericolosa
        </h2>
        <p className="mt-1.5 text-xs leading-snug text-ink-dim">
          Cancella l&apos;account, il diario sul server e ogni dato associato. Non è recuperabile.
          Il diario su questo dispositivo resta finché non lo cancelli tu dalla scheda Diario.
        </p>
        {confirmDelete ? (
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => { void handleDelete() }}
              disabled={deleting}
              className="min-h-11 flex-1 rounded-lg bg-danger text-sm font-semibold text-white
                         disabled:opacity-50 focus:outline-none focus-visible:ring-2
                         focus-visible:ring-danger"
            >
              {deleting ? 'Cancello…' : 'Conferma cancellazione'}
            </button>
            <button
              type="button"
              onClick={() => { setConfirmDelete(false) }}
              className="min-h-11 rounded-lg border border-edge px-3 text-sm text-ink-dim
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              annulla
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setConfirmDelete(true) }}
            className="mt-2.5 min-h-11 w-full rounded-lg border border-danger/40 text-sm
                       font-medium text-danger focus:outline-none focus-visible:ring-2
                       focus-visible:ring-danger"
          >
            Cancella account
          </button>
        )}
      </section>

      {message !== null && (
        <p role="status" className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-dim">
          {message}
        </p>
      )}
    </div>
  )
}

function SyncDot({ status }: { status: string }) {
  const color =
    status === 'synced' ? 'bg-accent' : status === 'error' ? 'bg-danger' : status === 'syncing' ? 'bg-warn' : 'bg-ink-faint'
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
}

function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4" aria-busy="true" aria-live="polite">
      <div className="h-7 w-32 animate-pulse rounded bg-surface-2" />
      <div className="mt-3 h-12 w-full animate-pulse rounded-xl bg-surface-2" />
      <span className="sr-only">Carico l&apos;account…</span>
    </div>
  )
}
