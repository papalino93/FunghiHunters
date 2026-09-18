'use client'

import { useEffect, useMemo, useState } from 'react'

import type { Snapshot } from '@/lib/snapshot/types'
import {
  ABUNDANCE_LABELS,
  ABUNDANCE_LEVELS,
  PRIVACY_LABELS,
  PRIVACY_LEVELS,
  TREE_SPECIES,
  type Abundance,
  type DiaryDraft,
  type DiaryEntry,
  type PrivacyLevel,
  type TreeSpecies,
} from '@/lib/diary/types'
import type { PhotoRepository } from '@/lib/diary/photos'

const TREE_LABELS: Readonly<Record<TreeSpecies, string>> = {
  faggio: 'faggio',
  abete: 'abete',
  castagno: 'castagno',
  cerro: 'cerro',
  leccio: 'leccio',
}

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
 */
export function EntryForm({
  snapshot,
  photoRepo,
  onSave,
  onCancel,
}: {
  snapshot: Snapshot
  photoRepo: PhotoRepository
  onSave: (draft: DiaryDraft) => Promise<DiaryEntry>
  onCancel: () => void
}) {
  const [date, setDate] = useState(snapshot.referenceDate)
  const [zoneCode, setZoneCode] = useState(snapshot.zones[0]?.code ?? '')
  const [abundance, setAbundance] = useState<Abundance | null>(null)
  const [elevation, setElevation] = useState('')
  const [notes, setNotes] = useState('')
  const [privacy, setPrivacy] = useState<PrivacyLevel>('area')
  const [trees, setTrees] = useState<TreeSpecies[]>([])
  const [photos, setPhotos] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const [gpsState, setGpsState] = useState<'idle' | 'asking' | 'denied' | 'unavailable'>('idle')
  const [capturedPosition, setCapturedPosition] = useState<{
    latitude: number
    longitude: number
  } | null>(null)

  // Le anteprime sono URL locali agli oggetti File: vanno revocati quando la foto viene tolta o il
  // form si smonta, altrimenti restano allocati finché la scheda non si ricarica.
  const previews = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos])
  useEffect(() => {
    return () => {
      for (const url of previews) URL.revokeObjectURL(url)
    }
  }, [previews])

  const zone = snapshot.zones.find((z) => z.code === zoneCode)
  // Il punteggio di quel giorno, se lo snapshot lo copre. Fuori finestra resta null, ed è
  // corretto: inventarlo renderebbe la calibrazione una finzione.
  const point = zone?.series.find((p) => p.date === date)

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
        setGpsState(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable')
      },
      { timeout: 10_000, maximumAge: 300_000 },
    )
  }

  const toggleTree = (species: TreeSpecies): void => {
    setTrees((current) =>
      current.includes(species) ? current.filter((t) => t !== species) : [...current, species],
    )
  }

  const addPhotos = (files: FileList | null): void => {
    if (files === null) return
    // `files` è un FileList vivo, legato all'input: va convertito in array subito, prima che il
    // chiamante svuoti `input.value` (necessario per poter riselezionare lo stesso file), altrimenti
    // l'aggiornamento di stato — differito dentro il updater — lo troverebbe già vuoto.
    const selected = Array.from(files)
    setPhotos((current) => [...current, ...selected])
  }

  const removePhoto = (index: number): void => {
    setPhotos((current) => current.filter((_, i) => i !== index))
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (abundance === null || zone === undefined) return
    setSaving(true)
    const entry = await onSave({
      date,
      zoneCode: zone.code,
      zoneName: zone.name,
      abundance,
      elevationM: elevation === '' ? null : Number(elevation),
      notes: notes.trim(),
      latitude: capturedPosition?.latitude ?? zone.latitude,
      longitude: capturedPosition?.longitude ?? zone.longitude,
      privacy,
      positionSource: capturedPosition !== null ? 'gps' : 'zone',
      trees,
      mpiAtEntry: point?.mpi ?? null,
      confidenceAtEntry: point?.confidence ?? null,
      algorithmVersionAtEntry: point === undefined ? null : snapshot.algorithmVersion,
    })
    for (const file of photos) await photoRepo.add(entry.id, file)
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-edge bg-surface-1 p-3">
      <div className="space-y-4">
        <Field label="Quando" htmlFor="entry-date">
          <input
            id="entry-date"
            type="date"
            value={date}
            max={snapshot.referenceDate}
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
            {snapshot.zones.map((z) => (
              <option key={z.code} value={z.code}>
                {z.name} — {z.reference}
              </option>
            ))}
          </select>
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
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
          <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
            Una scala grossolana basta: serve a ordinare gli esiti, non a pesare il raccolto.
          </p>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Posizione del punto trovato
          </legend>
          {capturedPosition !== null ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-2.5 py-2">
              <p className="text-xs leading-snug text-ink-dim">
                Posizione GPS salvata: {capturedPosition.latitude.toFixed(5)},{' '}
                {capturedPosition.longitude.toFixed(5)}
                <span className="mt-0.5 block text-[11px] text-ink-faint">
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
                <p className="mt-1.5 text-[11px] leading-snug text-warn">
                  Permesso negato. Senza, si salva il punto di riferimento della zona, non il posto
                  esatto in cui hai cercato.
                </p>
              )}
              {gpsState === 'unavailable' && (
                <p className="mt-1.5 text-[11px] leading-snug text-warn">
                  Posizione non disponibile qui. Si salva il punto di riferimento della zona invece
                  del posto esatto.
                </p>
              )}
              <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
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
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
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
          <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
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
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Foto a supporto <span className="normal-case tracking-normal">(facoltativo)</span>
          </legend>
          <label
            htmlFor="entry-photos"
            className="flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg
                       border border-dashed border-edge bg-surface-2 px-3 text-xs font-medium
                       text-ink-dim transition-colors hover:text-ink"
          >
            Aggiungi foto
          </label>
          <input
            id="entry-photos"
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }}
          />
          {photos.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {photos.map((file, index) => (
                <li key={`${file.name}-${index}`} className="relative">
                  {previews[index] !== undefined && (
                    // eslint-disable-next-line @next/next/no-img-element -- anteprima locale da object URL, non un asset ottimizzabile
                    <img
                      src={previews[index]}
                      alt=""
                      className="h-16 w-16 rounded-lg border border-edge object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => { removePhoto(index) }}
                    aria-label="Rimuovi foto"
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center
                               rounded-full border border-edge bg-surface-1 text-ink-faint
                               transition-colors hover:text-danger focus:outline-none
                               focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <svg width="9" height="9" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
            Restano solo su questo dispositivo: non vengono mai sincronizzate.
          </p>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Precisione della posizione salvata
          </legend>
          <div className="flex gap-1.5">
            {PRIVACY_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => { setPrivacy(level) }}
                aria-pressed={privacy === level}
                className={`min-h-11 flex-1 rounded-lg border px-2 text-[11px] font-medium
                            transition-colors focus:outline-none focus-visible:ring-2
                            focus-visible:ring-accent ${
                              privacy === level
                                ? 'border-accent bg-accent/15 text-ink'
                                : 'border-edge bg-surface-2 text-ink-dim hover:text-ink'
                            }`}
              >
                {PRIVACY_LABELS[level]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
            L&apos;arrotondamento è definitivo: una volta salvata l&apos;area, le coordinate
            precise non esistono più.
          </p>
        </fieldset>

        <p className="rounded-lg bg-surface-2 px-2.5 py-2 text-[11px] leading-snug text-ink-faint">
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
          disabled={abundance === null || saving}
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
        <p className="mt-2 text-center text-[11px] text-ink-faint">
          Scegli quanti ne hai trovati per salvare.
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
        className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint"
      >
        {label}
        {optional === true && <span className="ml-1 normal-case tracking-normal">(facoltativo)</span>}
      </label>
      {children}
    </div>
  )
}
