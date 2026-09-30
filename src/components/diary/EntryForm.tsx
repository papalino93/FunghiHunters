'use client'

import { useEffect, useMemo, useState } from 'react'

import { today as localToday } from '@/lib/domain/time'
import { lastZoneOr } from '@/lib/zones/lastViewed'
import { FAR_ZONE_KM, zonesByDistance } from '@/lib/zones/nearest'

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
  type DiaryEntry,
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
  initial,
  onCancel,
  onSave,
}: {
  snapshot: Snapshot
  /**
   * La voce da modificare. Senza, il modulo registra un'uscita nuova.
   *
   * In modifica la posizione salvata non si tocca da sola (niente GPS all'apertura: si corregge
   * a casa, non sul posto) e il punteggio congelato resta quello del giorno, a meno che non si
   * corregga proprio il giorno o la zona — vedi `mergePatch` in `lib/diary/store.ts`.
   */
  initial?: DiaryEntry
  onCancel: () => void
  onSave: (draft: DiaryDraft) => Promise<void>
}) {
  const auth = useAuth()
  const editing = initial !== undefined
  // Oggi vero, non la data dello snapshot (un'uscita di oggi con lo snapshot di ieri non deve
  // risultare nel futuro); e la zona guardata per ultima,
  // non la prima del file. Il modulo si monta solo dopo un tocco, quindi leggere lo storage qui
  // non crea differenze fra server e browser.
  const [date, setDate] = useState(() => initial?.date ?? localToday())
  const [zoneCode, setZoneCode] = useState(() =>
    initial?.zoneCode ??
    lastZoneOr(snapshot.zones.map((z) => z.code), snapshot.zones[0]?.code ?? ''),
  )
  const [abundance, setAbundance] = useState<Abundance | null>(initial?.abundance ?? null)
  const [elevation, setElevation] = useState(initial?.elevationM == null ? '' : String(initial.elevationM))
  const [duration, setDuration] = useState(
    initial?.durationMinutes == null ? '' : String(initial.durationMinutes),
  )
  const [searchers, setSearchers] = useState(initial?.searchers == null ? '' : String(initial.searchers))
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [privacy, setPrivacy] = useState<PrivacyLevel>(initial?.privacy ?? 'area')
  const [trees, setTrees] = useState<TreeSpecies[]>(() => [...(initial?.trees ?? [])])
  /**
   * In modifica: la posizione GPS già salvata si tiene finché non la togli o non la sostituisci.
   * Chi corregge le note a casa non deve ritrovarsi l'uscita spostata sul divano.
   */
  const [keptGps, setKeptGps] = useState(initial?.positionSource === 'gps' && initial.latitude !== null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [gpsState, setGpsState] = useState<GpsState>('idle')
  const [capturedPosition, setCapturedPosition] = useState<{
    latitude: number
    longitude: number
  } | null>(null)
  /** La zona scelta dal GPS e la sua distanza, finché l'utente non ne sceglie un'altra a mano. */
  const [autoZone, setAutoZone] = useState<{ code: string; km: number } | null>(null)

  /*
   * La zona della voce può non esserci nello snapshot di oggi (un'uscita registrata con un'altra
   * regione di riferimento): in modifica resta quella, con il suo nome, invece di diventare in
   * silenzio la prima dell'elenco.
   */
  const initialZone =
    initial !== undefined && !snapshot.zones.some((z) => z.code === initial.zoneCode)
      ? { code: initial.zoneCode, name: initial.zoneName, latitude: initial.latitude, longitude: initial.longitude }
      : null
  const zone: { code: string; name: string; latitude: number | null; longitude: number | null; elevationM?: number } | undefined =
    snapshot.zones.find((z) => z.code === zoneCode) ?? (initialZone?.code === zoneCode ? initialZone : undefined)
  const pairChanged = editing && (date !== initial.date || zoneCode !== initial.zoneCode)

  // Con la posizione, le zone in ordine di distanza: la più vicina in cima, le altre a seguire.
  const zonesNearby = useMemo(
    () =>
      capturedPosition === null
        ? null
        : zonesByDistance(snapshot.zones, capturedPosition.latitude, capturedPosition.longitude),
    [snapshot.zones, capturedPosition],
  )

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
  const point = snapshot.zones.find((z) => z.code === zoneCode)?.series.find((p) => p.date === date)

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
        const position = { latitude: result.coords.latitude, longitude: result.coords.longitude }
        setCapturedPosition(position)
        setGpsState('idle')
        /*
         * Il «Dove» si compila da solo con la zona conosciuta più vicina: chi registra un'uscita
         * col GPS a San Casciano non deve cercare la sua zona in un elenco che comprende anche il
         * Monte Amiata. Resta modificabile, e le altre sono in ordine di distanza.
         */
        const [nearest] = zonesByDistance(snapshot.zones, position.latitude, position.longitude)
        // In modifica la zona non si cambia da sola: cambierebbe anche il punteggio congelato.
        if (nearest !== undefined && !editing) {
          setZoneCode(nearest.zone.code)
          setAutoZone({ code: nearest.zone.code, km: nearest.km })
        }
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

  /*
   * Se il permesso di posizione è già stato dato (in un'uscita precedente, o per i punti fissi),
   * la si prende da sola all'apertura del modulo: si registra sul posto, e un tocco in meno conta.
   * Senza permesso non si chiede niente finché l'utente non tocca il pulsante: una richiesta di
   * sistema all'apertura, senza aver capito a cosa serve, verrebbe rifiutata per riflesso.
   */
  useEffect(() => {
    // In modifica mai: la posizione dell'uscita è quella di quel giorno, non quella di adesso.
    if (editing) return
    if (typeof navigator === 'undefined' || navigator.permissions === undefined) return
    let cancelled = false
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (!cancelled && status.state === 'granted') requestLocation()
      })
      .catch(() => {
        // Safari vecchi non conoscono la voce «geolocation»: resta il pulsante.
      })
    return () => { cancelled = true }
    // Solo all'apertura: `requestLocation` cambia a ogni render ma fa sempre la stessa cosa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const useKept = capturedPosition === null && keptGps && initial !== undefined
    const frozen =
      editing && !pairChanged
        ? {}
        : {
            mpiAtEntry: point?.mpi ?? null,
            confidenceAtEntry: point?.confidence ?? null,
            algorithmVersionAtEntry: point === undefined ? null : snapshot.algorithmVersion,
          }
    try {
      await onSave({
        date,
        zoneCode: zone.code,
        zoneName: zone.name,
        abundance,
        elevationM: elevation === '' ? null : Number(elevation),
        notes: notes.trim(),
        latitude: capturedPosition?.latitude ?? (useKept ? initial.latitude : zone.latitude),
        longitude: capturedPosition?.longitude ?? (useKept ? initial.longitude : zone.longitude),
        // Senza una posizione vera, "esatte"/"area" arrotonderebbero comunque solo il punto
        // della zona: promettere una precisione che non c'è. "Solo la zona" è l'unico livello
        // onesto qui.
        privacy: capturedPosition !== null || useKept ? privacy : 'zone',
        positionSource: capturedPosition !== null || useKept ? 'gps' : 'zone',
        trees,
        durationMinutes: duration === '' ? null : Number(duration),
        searchers: searchers === '' ? null : Number(searchers),
        ...frozen,
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

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Posizione del punto trovato
          </legend>
          {capturedPosition === null && keptGps && initial !== undefined ? (
            <div className="space-y-2 rounded-lg bg-surface-2 px-2.5 py-2">
              <p className="text-xs leading-snug text-ink-dim">
                Resta la posizione GPS salvata quel giorno
                {initial.latitude !== null && initial.longitude !== null && (
                  <>
                    : {initial.latitude.toFixed(initial.privacy === 'exact' ? 5 : 2)},{' '}
                    {initial.longitude.toFixed(initial.privacy === 'exact' ? 5 : 2)}
                  </>
                )}
                .
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={requestLocation}
                  disabled={gpsState === 'asking'}
                  className="min-h-11 flex-1 rounded-lg border border-edge bg-surface-1 px-2 text-xs
                             font-medium text-ink transition-colors hover:bg-surface-3
                             disabled:opacity-60 focus:outline-none focus-visible:ring-2
                             focus-visible:ring-accent"
                >
                  {gpsState === 'asking' ? 'Attendo…' : 'Sostituisci con la posizione di adesso'}
                </button>
                <button
                  type="button"
                  onClick={() => { setKeptGps(false) }}
                  className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-medium text-ink-dim
                             transition-colors hover:text-ink focus:outline-none
                             focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Rimuovi
                </button>
              </div>
            </div>
          ) : capturedPosition !== null ? (
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
                onClick={() => {
                  setCapturedPosition(null)
                  setAutoZone(null)
                }}
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

        <Field label="Dove" htmlFor="entry-zone">
          <select
            id="entry-zone"
            value={zoneCode}
            onChange={(e) => {
              setZoneCode(e.target.value)
              setAutoZone(null)
            }}
            className="min-h-11 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm
                       text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {initialZone !== null && (
              <option value={initialZone.code}>{initialZone.name}</option>
            )}
            {zonesNearby === null
              ? zonesAlphabetical.map((z) => (
                  <option key={z.code} value={z.code}>
                    {z.name} — {z.reference}
                  </option>
                ))
              : zonesNearby.map(({ zone: z, km }) => (
                  <option key={z.code} value={z.code}>
                    {z.name} — {formatKm(km)}
                  </option>
                ))}
          </select>
          {autoZone !== null && autoZone.code === zoneCode && (
            <p className={`mt-1.5 text-xs leading-snug ${autoZone.km > FAR_ZONE_KM ? 'text-warn' : 'text-ink-faint'}`}>
              {autoZone.km > FAR_ZONE_KM
                ? `La zona più vicina che conosciamo è a ${formatKm(autoZone.km)}: se sei fuori dalla tua regione di riferimento, cambiala in Account per avere le zone di lì.`
                : `Scelta dalla tua posizione: è la zona più vicina, a ${formatKm(autoZone.km)}. Puoi cambiarla.`}
            </p>
          )}
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


        <Field label="Quota indicativa" htmlFor="entry-elevation" optional>
          <input
            id="entry-elevation"
            type="number"
            inputMode="numeric"
            placeholder={zone?.elevationM === undefined ? '' : String(zone.elevationM)}
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
              // Una posizione già arrotondata non torna precisa: in modifica si può solo
              // arrotondare di più, non di meno.
              const keptFloor = PRIVACY_LEVELS.indexOf(initial?.privacy ?? 'exact')
              const disabled =
                capturedPosition === null &&
                (keptGps ? PRIVACY_LEVELS.indexOf(level) < keptFloor : level !== 'zone')
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
            {capturedPosition === null && keptGps
              ? 'Puoi solo arrotondarla di più: le coordinate tolte non si recuperano.'
              : capturedPosition === null
              ? 'Acquisisci la posizione qui sopra per poter salvare più di "solo la zona".'
              : 'L’arrotondamento è definitivo: una volta salvata l’area, le coordinate precise non esistono più.'}
          </p>
          {/*
            * Disclosure esplicita richiesta: chi è connesso e sceglie "coordinate esatte" deve
            * saperlo prima di salvare, non scoprirlo dopo controllando Account.
            */}
          {auth.status === 'signed-in' && privacy === 'exact' && (capturedPosition !== null || keptGps) && (
            <p className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-2 text-xs leading-snug text-ink-dim">
              Sei connesso: queste coordinate esatte verranno sincronizzate nel tuo account cloud,
              non solo su questo dispositivo.
            </p>
          )}
        </fieldset>

        <p className="rounded-lg bg-surface-2 px-2.5 py-2 text-xs leading-snug text-ink-faint">
          {editing && !pairChanged ? (
            initial.mpiAtEntry !== null ? (
              <>
                Resta il punteggio previsto quel giorno:{' '}
                <strong className="text-ink">{initial.mpiAtEntry.toFixed(0)}</strong>
                {initial.algorithmVersionAtEntry !== null && <>, modello {initial.algorithmVersionAtEntry}</>}.
                Cambia solo se correggi il giorno o la zona.
              </>
            ) : (
              <>Questa uscita non ha un punteggio salvato: cambia solo se correggi il giorno o la zona.</>
            )
          ) : point === undefined ? (
            <>
              {editing
                ? 'Hai cambiato giorno o zona, e per questa coppia i dati di oggi non hanno un punteggio: la voce resterà senza, e non servirà alla calibrazione.'
                : 'Per questo giorno lo snapshot non ha un punteggio: la voce si salva comunque, ma non potrà servire alla calibrazione.'}
            </>
          ) : editing ? (
            <>
              Hai cambiato giorno o zona: il punteggio salvato diventa quello di questa coppia,{' '}
              <strong className="text-ink">{point.mpi.toFixed(0)}</strong>, modello{' '}
              {snapshot.algorithmVersion}.
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
          {saving ? 'Salvo…' : editing ? 'Salva le modifiche' : 'Salva'}
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
          {saveError} {editing ? 'Le modifiche non sono state salvate' : 'La voce non è stata registrata'}: puoi riprovare.
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

/** «800 m», «3 km», «42 km»: sotto il chilometro i metri, sopra niente decimali inutili. */
function formatKm(km: number): string {
  if (km < 1) return `${String(Math.round(km * 10) * 100)} m`
  return `${String(Math.round(km))} km`
}
