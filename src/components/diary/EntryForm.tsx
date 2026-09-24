'use client'

import { useMemo, useState } from 'react'

import { today as localToday } from '@/lib/domain/time'
import { lastZoneOr } from '@/lib/zones/lastViewed'

import type { Snapshot } from '@/lib/snapshot/types'
import {
  ABUNDANCE_LABELS,
  ABUNDANCE_LEVELS,
  DURATION_MINUTES_MAX,
  DURATION_MINUTES_MIN,
  PRIVACY_LABELS,
  PRIVACY_LEVELS,
  SEARCHERS_MAX,
  SEARCHERS_MIN,
  TREE_SPECIES,
  isValidDurationMinutes,
  isValidSearchers,
  type Abundance,
  type DiaryDraft,
  type PrivacyLevel,
  type TreeSpecies,
} from '@/lib/diary/types'
import { useAuth } from '@/lib/auth/context'

const TREE_LABELS: Readonly<Record<TreeSpecies, string>> = {
  faggio: 'faggio',
  abete: 'abete',
  castagno: 'castagno',
  cerro: 'cerro',
  leccio: 'leccio',
}

type GpsState = 'idle' | 'asking' | 'denied' | 'unavailable' | 'timeout'

/**
 * Registrazione di un'uscita.
 *
 * Deve chiudersi in pochi tocchi, perché si compila in macchina al ritorno, non a tavolino. Il
 * campo che conta davvero è uno solo — quanto hai trovato — e infatti è l'unico obbligatorio.
 *
 * Il punteggio previsto non si chiede all'utente: si legge dallo snapshot per quella zona e quel
 * giorno, e si congela. Chiederlo sarebbe assurdo e lasciarlo fuori renderebbe la voce inutile
 * alla calibrazione.
 *
 * La posizione GPS reale (se l'utente la concede) è quella che permette di ritrovare una fungaia:
 * il punto di riferimento della zona resta il ripiego di sempre quando non la si vuole o non si
 * può darla, ma non è più spacciato per lo stesso tipo di dato — `positionSource` li distingue.
 *
 * **Niente foto**: erano una funzione reale (vedi `docs/AUDIT.md`), rimossa perché non serviva al
 * modello e complicava spazio, privacy, export e sincronizzazione — vedi il diario delle
 * decisioni. Un vecchio export con `photoIds` si importa comunque, senza errori: vedi
 * `importInto` in `lib/diary/store.ts`.
 */
export function EntryForm({
  snapshot,
  onCancel,
  onSave,
}: {
  snapshot: Snapshot
  onCancel: () => void
  onSave: (draft: DiaryDraft) => Promise<void>
}) {
  const auth = useAuth()
  // Oggi vero, non la data dello snapshot (un'uscita di oggi con lo snapshot di ieri non deve
  // risultare nel futuro); e la zona guardata per ultima,
  // non la prima del file. Il modulo si monta solo dopo un tocco, quindi leggere lo storage qui
  // non crea differenze fra server e browser.
  const [date, setDate] = useState(() => localToday())
  const [zoneCode, setZoneCode] = useState(() =>
    lastZoneOr(snapshot.zones.map((z) => z.code), snapshot.zones[0]?.code ?? ''),
  )
  const [abundance, setAbundance] = useState<Abundance | null>(null)
  const [elevation, setElevation] = useState('')
  const [duration, setDuration] = useState('')
  const [searchers, setSearchers] = useState('')
  const [notes, setNotes] = useState('')
  const [privacy, setPrivacy] = useState<PrivacyLevel>('area')
  const [trees, setTrees] = useState<TreeSpecies[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [gpsState, setGpsState] = useState<GpsState>('idle')
  const [capturedPosition, setCapturedPosition] = useState<{
    latitude: number
    longitude: number
  } | null>(null)

  const zone = snapshot.zones.find((z) => z.code === zoneCode)

  /*
   * Alfabetico per nome, non l'ordine di arrivo dello snapshot (per punteggio del giorno). Scelto
   * qui, non nel motore di raccomandazione: si sceglie dove si è stati, non dove conviene andare
   * oggi. Con le 190 zone del Piemonte o le 183 della Lombardia, un ordine che cambia ogni giorno
   * renderebbe la propria zona impossibile da trovare a colpo d'occhio nel menu.
   */
  const zonesAlphabetical = useMemo(
    () => [...snapshot.zones].sort((a, b) => a.name.localeCompare(b.name, 'it')),
    [snapshot.zones],
  )
  // Il punteggio di quel giorno, se lo snapshot lo copre. Fuori finestra resta null, ed è
  // corretto: inventarlo renderebbe la calibrazione una finzione.
  const point = zone?.series.find((p) => p.date === date)

  const durationValid = duration === '' || isValidDurationMinutes(Number(duration))
  const searchersValid = searchers === '' || isValidSearchers(Number(searchers))

  const requestLocation = (): void => {
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
      setGpsState('unavailable')
      return
    }
    setGpsState('asking')
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setCapturedPosition({ latitude: result.coords.latitude, longitude: result.coords.longitude })
        setGpsState('idle')
      },
      (error) => {
        setGpsState(
          error.code === error.PERMISSION_DENIED
            ? 'denied'
            : error.code === error.TIMEOUT
              ? 'timeout'
              : 'unavailable',
        )
      },
      { timeout: 10_000, maximumAge: 300_000 },
    )
  }

  const toggleTree = (species: TreeSpecies): void => {
    setTrees((current) =>
      current.includes(species) ? current.filter((t) => t !== species) : [...current, species],
    )
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (abundance === null || zone === undefined || !durationValid || !searchersValid) return
    setSaving(true)
    setSaveError(null)
    try {
      await onSave({
        date,
        zoneCode: zone.code,
        zoneName: zone.name,
        abundance,
        elevationM: elevation === '' ? null : Number(elevation),
        notes: notes.trim(),
        latitude: capturedPosition?.latitude ?? zone.latitude,
        longitude: capturedPosition?.longitude ?? zone.longitude,
        // Senza una posizione vera, "esatte"/"area" arrotonderebbero comunque solo il punto
        // della zona: promettere una precisione che non c'è. "Solo la zona" è l'unico livello
        // onesto qui.
        privacy: capturedPosition === null ? 'zone' : privacy,
        positionSource: capturedPosition !== null ? 'gps' : 'zone',
        trees,
        durationMinutes: duration === '' ? null : Number(duration),
        searchers: searchers === '' ? null : Number(searchers),
        mpiAtEntry: point?.mpi ?? null,
        confidenceAtEntry: point?.confidence ?? null,
        algorithmVersionAtEntry: point === undefined ? null : snapshot.algorithmVersion,
      })
    } catch (error) {
      // Prima restava tutto muto: il form tornava selezionabile e l'utente non sapeva se la voce
      // fosse stata salvata o no. Con lo storage pieno o bloccato succede davvero.
      setSaveError(error instanceof Error ? error.message : 'Salvataggio non riuscito.')
    } finally {
      // Anche quando il salvataggio fallisce: senza, il pulsante resterebbe su "Salvo…" per
      // sempre e non ci sarebbe modo di riprovare.
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-edge bg-surface-1 p-3">
      <div className="space-y-4">
        <Field label="Quando" htmlFor="entry-date">
          <input
            id="entry-date"
            type="date"
            value={date}
            max={localToday()}
            onChange={(e) => { setDate(e.target.value) }}
            className="min-h-11 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm
                       text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </Field>

        <Field label="Dove" htmlFor="entry-zone">
          <select
            id="entry-zone"
            value={zoneCode}
            onChange={(e) => { setZoneCode(e.target.value) }}
            className="min-h-11 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm
                       text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {zonesAlphabetical.map((z) => (
              <option key={z.code} value={z.code}>
                {z.name} — {z.reference}
              </option>
            ))}
          </select>
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Quanti ne hai trovati
          </legend>
          <div className="grid grid-cols-3 gap-1.5">
            {ABUNDANCE_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => { setAbundance(level) }}
                aria-pressed={abundance === level}
                className={`min-h-11 rounded-lg border px-2 text-xs font-medium
                            transition-colors focus:outline-none focus-visible:ring-2
                            focus-visible:ring-accent ${
                              abundance === level
                                ? 'border-accent bg-accent/15 text-ink'
                                : 'border-edge bg-surface-2 text-ink-dim hover:text-ink'
                            }`}
              >
                {ABUNDANCE_LABELS[level]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs leading-snug text-ink-faint">
            Una scala grossolana basta: serve a ordinare gli esiti, non a pesare il raccolto.
          </p>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Durata ricerca" htmlFor="entry-duration" optional>
            <input
              id="entry-duration"
              type="number"
              inputMode="numeric"
              placeholder="minuti"
              value={duration}
              onChange={(e) => { setDuration(e.target.value) }}
              aria-invalid={!durationValid}
              className={`min-h-11 w-full rounded-lg border bg-surface-2 px-3 text-sm text-ink
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            durationValid ? 'border-edge' : 'border-danger'
                          }`}
            />
          </Field>
          <Field label="Persone" htmlFor="entry-searchers" optional>
            <input
              id="entry-searchers"
              type="number"
              inputMode="numeric"
              placeholder="quante"
              value={searchers}
              onChange={(e) => { setSearchers(e.target.value) }}
              aria-invalid={!searchersValid}
              className={`min-h-11 w-full rounded-lg border bg-surface-2 px-3 text-sm text-ink
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            searchersValid ? 'border-edge' : 'border-danger'
                          }`}
            />
          </Field>
        </div>
        {!durationValid && (
          <p className="-mt-2 text-xs text-danger">
            Fra {DURATION_MINUTES_MIN} e {DURATION_MINUTES_MAX} minuti.
          </p>
        )}
        {!searchersValid && (
          <p className="-mt-2 text-xs text-danger">
            Fra {SEARCHERS_MIN} e {SEARCHERS_MAX} persone.
          </p>
        )}
        <p className="-mt-2 text-xs leading-snug text-ink-faint">
          Servono a leggere meglio uno &quot;zero&quot;: dopo dieci minuti non dice molto, dopo
          quattro ore sì. Facoltativi entrambi.
        </p>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Posizione del punto trovato
          </legend>
          {capturedPosition !== null ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-2.5 py-2">
              <p className="text-xs leading-snug text-ink-dim">
                Posizione GPS salvata: {capturedPosition.latitude.toFixed(5)},{' '}
                {capturedPosition.longitude.toFixed(5)}
                <span className="mt-0.5 block text-xs text-ink-faint">
                  Basterà questa per ritrovare il punto in futuro.
                </span>
              </p>
              <button
                type="button"
                onClick={() => { setCapturedPosition(null) }}
                className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-medium text-ink-dim
                           transition-colors hover:text-ink focus:outline-none
                           focus-visible:ring-2 focus-visible:ring-accent"
              >
                Rimuovi
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={requestLocation}
                disabled={gpsState === 'asking'}
                className="min-h-11 w-full rounded-lg border border-accent/40 bg-accent/15 px-3
                           text-sm font-medium text-ink transition-colors hover:bg-accent/25
                           disabled:opacity-60 focus:outline-none focus-visible:ring-2
                           focus-visible:ring-accent"
              >
                {gpsState === 'asking' ? 'Attendo la posizione…' : 'Usa la mia posizione'}
              </button>
              {gpsState === 'denied' && (
                <p className="mt-1.5 text-xs leading-snug text-warn">
                  Permesso negato. Senza, si salva il punto di riferimento della zona, non il posto
                  esatto in cui hai cercato.
                </p>
              )}
              {gpsState === 'unavailable' && (
                <p className="mt-1.5 text-xs leading-snug text-warn">
                  Posizione non disponibile qui. Si salva il punto di riferimento della zona invece
                  del posto esatto.
                </p>
              )}
              {gpsState === 'timeout' && (
                <p className="mt-1.5 text-xs leading-snug text-warn">
                  Il GPS non ha risposto in tempo. Puoi riprovare, o proseguire con il punto di
                  riferimento della zona.
                </p>
              )}
              <p className="mt-1.5 text-xs leading-snug text-ink-faint">
                Senza posizione GPS si salva solo il riferimento generico della zona: utile per la
                calibrazione, ma non per ritrovare il punto esatto.
              </p>
            </>
          )}
        </fieldset>

        <Field label="Quota indicativa" htmlFor="entry-elevation" optional>
          <input
            id="entry-elevation"
            type="number"
            inputMode="numeric"
            placeholder={zone === undefined ? '' : String(zone.elevationM)}
            value={elevation}
            onChange={(e) => { setElevation(e.target.value) }}
            className="min-h-11 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm
                       text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Alberi presenti <span className="normal-case tracking-normal">(facoltativo)</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {TREE_SPECIES.map((species) => (
              <button
                key={species}
                type="button"
                onClick={() => { toggleTree(species) }}
                aria-pressed={trees.includes(species)}
                className={`min-h-11 rounded-lg border px-3 text-xs font-medium
                            transition-colors focus:outline-none focus-visible:ring-2
                            focus-visible:ring-accent ${
                              trees.includes(species)
                                ? 'border-accent bg-accent/15 text-ink'
                                : 'border-edge bg-surface-2 text-ink-dim hover:text-ink'
                            }`}
              >
                {TREE_LABELS[species]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs leading-snug text-ink-faint">
            Aiuta a riconoscere l&apos;habitat in futuro, qui e nelle altre uscite.
          </p>
        </fieldset>

        <Field label="Note" htmlFor="entry-notes" optional>
          <textarea
            id="entry-notes"
            rows={2}
            value={notes}
            onChange={(e) => { setNotes(e.target.value) }}
            placeholder="tipo di bosco, esposizione, ora, quello che ti serve ricordare"
            className="w-full rounded-lg border border-edge bg-surface-2 px-3 py-2 text-sm
                       text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Precisione della posizione salvata
          </legend>
          <div className="flex gap-1.5">
            {PRIVACY_LEVELS.map((level) => {
              // Senza posizione GPS reale, "esatte" e "area" arrotonderebbero comunque solo il
              // punto della zona: offrirli sarebbe promettere una precisione che non c'è.
              const disabled = capturedPosition === null && level !== 'zone'
              const active = privacy === level && !disabled
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => { setPrivacy(level) }}
                  disabled={disabled}
                  aria-pressed={active}
                  className={`min-h-11 flex-1 rounded-lg border px-2 text-xs font-medium
                              transition-colors focus:outline-none focus-visible:ring-2
                              focus-visible:ring-accent disabled:cursor-not-allowed
                              disabled:opacity-40 ${
                                active
                                  ? 'border-accent bg-accent/15 text-ink'
                                  : 'border-edge bg-surface-2 text-ink-dim hover:text-ink'
                              }`}
                >
                  {PRIVACY_LABELS[level]}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-xs leading-snug text-ink-faint">
            {capturedPosition === null
              ? 'Acquisisci la posizione qui sopra per poter salvare più di "solo la zona".'
              : 'L’arrotondamento è definitivo: una volta salvata l’area, le coordinate precise non esistono più.'}
          </p>
          {/*
            * Disclosure esplicita richiesta: chi è connesso e sceglie "coordinate esatte" deve
            * saperlo prima di salvare, non scoprirlo dopo controllando Account.
            */}
          {auth.status === 'signed-in' && privacy === 'exact' && capturedPosition !== null && (
            <p className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-2 text-xs leading-snug text-ink-dim">
              Sei connesso: queste coordinate esatte verranno sincronizzate nel tuo account cloud,
              non solo su questo dispositivo.
            </p>
          )}
        </fieldset>

        <p className="rounded-lg bg-surface-2 px-2.5 py-2 text-xs leading-snug text-ink-faint">
          {point === undefined ? (
            <>
              Per questo giorno lo snapshot non ha un punteggio: la voce si salva comunque, ma non
              potrà servire alla calibrazione.
            </>
          ) : (
            <>
              Verrà congelato il punteggio previsto per quel giorno:{' '}
              <strong className="text-ink">{point.mpi.toFixed(0)}</strong> con affidabilità{' '}
              {point.confidence.toFixed(0)}, modello {snapshot.algorithmVersion}.
            </>
          )}
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={abundance === null || saving || !durationValid || !searchersValid}
          className="min-h-12 flex-1 rounded-lg border border-accent/40 bg-accent/15 text-sm
                     font-semibold text-ink transition-colors hover:bg-accent/25
                     disabled:opacity-40 focus:outline-none focus-visible:ring-2
                     focus-visible:ring-accent"
        >
          {saving ? 'Salvo…' : 'Salva'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-12 rounded-lg border border-edge bg-surface-2 px-4 text-sm
                     font-medium text-ink-dim transition-colors hover:text-ink
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Annulla
        </button>
      </div>
      {abundance === null && (
        <p className="mt-2 text-center text-xs text-ink-faint">
          Scegli quanti ne hai trovati per salvare.
        </p>
      )}
      {saveError !== null && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-2 text-xs
                     leading-snug text-danger"
        >
          {saveError} La voce non è stata registrata: puoi riprovare.
        </p>
      )}
    </form>
  )
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string
  htmlFor: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-faint"
      >
        {label}
        {optional === true && <span className="ml-1 normal-case tracking-normal">(facoltativo)</span>}
      </label>
      {children}
    </div>
  )
}
