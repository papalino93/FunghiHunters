/**
 * Diario uscite.
 *
 * È il dato più prezioso del progetto, e non per sentimentalismo: tutti i parametri del modello
 * tranne due sono dichiaratamente da calibrare, e l'unico modo per calibrarli è confrontare cosa
 * il modello prevedeva con cosa hai trovato davvero. Ogni settimana senza diario è una settimana
 * di calibrazione persa per sempre, perché il meteo di quel giorno non torna.
 *
 * **Vincolo di sicurezza.** Il diario registra un esito di ricerca, non un'identificazione. Non
 * esiste nessun campo che dica "questo fungo è commestibile", l'app non riconosce specie da foto
 * e non lo farà in questa forma. Quello che scrivi qui serve al modello, non a decidere cosa
 * mettere in padella.
 */

/** Quanto hai trovato. Scala volutamente grossolana: nessuno pesa i funghi sul posto. */
export const ABUNDANCE_LEVELS = ['none', 'few', 'some', 'many', 'exceptional'] as const
export type Abundance = (typeof ABUNDANCE_LEVELS)[number]

export const ABUNDANCE_LABELS: Readonly<Record<Abundance, string>> = {
  none: 'nessuno',
  few: 'pochi',
  some: 'discreti',
  many: 'molti',
  exceptional: 'eccezionale',
}

/**
 * Valore numerico usato per la calibrazione.
 *
 * Non è una quantità in chilogrammi: è un ordinamento. Serve solo a correlare l'esito con il
 * punteggio previsto, e trattarlo come una misura sarebbe dargli una precisione che non ha.
 */
export const ABUNDANCE_RANK: Readonly<Record<Abundance, number>> = {
  none: 0,
  few: 1,
  some: 2,
  many: 3,
  exceptional: 4,
}

/** Quanto in profondità vuoi che la posizione sia conservata. */
export const PRIVACY_LEVELS = ['exact', 'area', 'zone'] as const
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number]

export const PRIVACY_LABELS: Readonly<Record<PrivacyLevel, string>> = {
  exact: 'coordinate esatte',
  area: 'area di circa 2 km',
  zone: 'solo la zona',
}

/**
 * Alberi ospiti riconosciuti, per orientare la ricerca futura — stessa lista di
 * `src/lib/model/habitat.ts` (i cinque tipi di bosco già usati per le indicazioni generali),
 * qui come specie osservate davvero sul posto invece che come descrizione della zona.
 */
export const TREE_SPECIES = ['faggio', 'abete', 'castagno', 'cerro', 'leccio'] as const
export type TreeSpecies = (typeof TREE_SPECIES)[number]

/**
 * Intervalli validi per i due campi di contesto facoltativi.
 *
 * Non sono limiti arbitrari: sotto i 5 minuti non è una ricerca, è un'occhiata; sopra le 12 ore
 * (720 minuti) è quasi certamente un errore di battitura, non un'uscita vera. Stesso discorso per
 * le persone: oltre venti non è più un gruppo che cerca funghi insieme, è un evento.
 */
export const DURATION_MINUTES_MIN = 5
export const DURATION_MINUTES_MAX = 720
export const SEARCHERS_MIN = 1
export const SEARCHERS_MAX = 20

/*
 * Riconoscitori dei valori chiusi, per chi legge dati che non ha scritto lui.
 *
 * Servono alla frontiera dell'importazione: `Partial<DiaryEntry>` è una promessa al compilatore,
 * non un controllo a runtime, e un file di esportazione può essere stato modificato a mano,
 * troncato a metà o prodotto da una versione futura. Un'abbondanza che non è fra quelle previste
 * non dà un errore: dà `ABUNDANCE_RANK[...] === undefined`, quindi `NaN`, e l'intero pannello di
 * calibrazione si riempie di "NaN" senza che niente si sia rotto in modo visibile.
 */
export function isAbundance(value: unknown): value is Abundance {
  return typeof value === 'string' && (ABUNDANCE_LEVELS as readonly string[]).includes(value)
}

export function isPrivacyLevel(value: unknown): value is PrivacyLevel {
  return typeof value === 'string' && (PRIVACY_LEVELS as readonly string[]).includes(value)
}

export function isPositionSource(value: unknown): value is 'gps' | 'zone' {
  return value === 'gps' || value === 'zone'
}

export function toTreeSpeciesList(value: unknown): TreeSpecies[] {
  if (!Array.isArray(value)) return []
  const known = new Set<string>(TREE_SPECIES)
  return value.filter((v): v is TreeSpecies => typeof v === 'string' && known.has(v))
}

/** Un numero vero, oppure "non detto". Una stringa in un campo numerico fa esplodere `toFixed`. */
export function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function isValidDurationMinutes(value: number): boolean {
  return Number.isInteger(value) && value >= DURATION_MINUTES_MIN && value <= DURATION_MINUTES_MAX
}

export function isValidSearchers(value: number): boolean {
  return Number.isInteger(value) && value >= SEARCHERS_MIN && value <= SEARCHERS_MAX
}

export interface DiaryEntry {
  readonly id: string
  /** Giorno dell'uscita, in data locale. */
  readonly date: string
  /** Codice della zona di riferimento fra quelle del modello. */
  readonly zoneCode: string
  readonly zoneName: string

  readonly abundance: Abundance
  /** Quota indicativa a cui hai cercato, in metri. */
  readonly elevationM: number | null
  /** Note libere: tipo di bosco, esposizione, ora, quello che ti pare. */
  readonly notes: string

  /**
   * Coordinate, conservate secondo `privacy`. `null` quando non le hai volute salvare.
   *
   * `positionSource` dice cosa sono davvero: `'gps'` è il punto dove hai effettivamente cercato,
   * catturato sul momento — quello che serve per ritrovare una fungaia. `'zone'` è solo il punto
   * di riferimento della zona del modello (un centro storico, non un posto), usato quando non hai
   * voluto o potuto dare il permesso di posizione: è lo stesso comportamento di prima, non
   * rimosso, ma ora distinguibile da un punto vero. `null` quando non c'è nessuna coordinata.
   */
  readonly latitude: number | null
  readonly longitude: number | null
  readonly privacy: PrivacyLevel
  readonly positionSource: 'gps' | 'zone' | null

  /**
   * Alberi osservati sul posto, fra quelli riconosciuti. Vuoto se non indicati.
   *
   * Il nome del campo evita apposta "species": lo stesso test che vieta ogni concetto di
   * commestibilità o identificazione (vedi `vincolo di sicurezza` in `tests/diary.test.ts`) cerca
   * anche quella parola nudo-e-crudo in ogni chiave di `DiaryEntry` — qui parliamo di alberi, non
   * di funghi, ma il nome del campo non deve nemmeno somigliarci.
   */
  readonly trees: readonly TreeSpecies[]

  /**
   * Quanto è durata la ricerca, in minuti. `null` se non indicato.
   *
   * Non è un dettaglio: uno "zero" dopo dieci minuti e uno zero dopo quattro ore di ricerca non
   * dicono la stessa cosa, ma senza questo campo il diario li registrava allo stesso modo — vedi
   * `shortSearchCaveat` in `lib/diary/calibration.ts`.
   */
  readonly durationMinutes: number | null
  /** Persone che hanno cercato insieme, `null` se non indicato. Più cercatori, più probabilità di trovare qualcosa a parità di condizioni — un fattore di sforzo, non ambientale. */
  readonly searchers: number | null

  /*
   * I tre campi congelati.
   *
   * Sono la ragione per cui il diario vale qualcosa. Vengono copiati al momento
   * dell'inserimento e non si aggiornano mai: il modello cambia, e senza sapere cosa prevedeva
   * *quel giorno* il confronto non si può più ricostruire. Aggiungerli ora costa tre campi,
   * recuperarli dopo è impossibile.
   */
  readonly mpiAtEntry: number | null
  readonly confidenceAtEntry: number | null
  readonly algorithmVersionAtEntry: string | null

  readonly createdAt: string
  readonly updatedAt: string
  /**
   * Tombstone di cancellazione. `null` per una voce viva.
   *
   * La cancellazione non toglie subito la riga: la marca. Un secondo dispositivo, offline al
   * momento della cancellazione, deve poter scoprire che la voce non c'è più invece di
   * risincronizzarla come se fosse nuova. `list()` filtra i tombstone; `listAll()` no, ed è quello
   * che usa il motore di sincronizzazione.
   */
  readonly deletedAt: string | null
}

/** Quanto serve per creare una voce: il resto lo mette il repository. */
export interface DiaryDraft {
  readonly date: string
  readonly zoneCode: string
  readonly zoneName: string
  readonly abundance: Abundance
  readonly elevationM?: number | null
  readonly notes?: string
  readonly latitude?: number | null
  readonly longitude?: number | null
  readonly privacy?: PrivacyLevel
  readonly positionSource?: 'gps' | 'zone' | null
  readonly trees?: readonly TreeSpecies[]
  readonly durationMinutes?: number | null
  readonly searchers?: number | null
  readonly mpiAtEntry?: number | null
  readonly confidenceAtEntry?: number | null
  readonly algorithmVersionAtEntry?: string | null
}

/**
 * Sfoca le coordinate secondo il livello di riservatezza.
 *
 * Non si tratta solo di pudore: i posti buoni si bruciano, e un diario che conserva coordinate al
 * metro è un file che non vuoi perdere. L'arrotondamento è deterministico e non recuperabile.
 */
export function applyPrivacy(
  latitude: number | null,
  longitude: number | null,
  privacy: PrivacyLevel,
): { latitude: number | null; longitude: number | null } {
  if (latitude === null || longitude === null) return { latitude: null, longitude: null }
  switch (privacy) {
    case 'exact':
      return { latitude, longitude }
    case 'area':
      // Due decimali sono circa 1.1 km di latitudine: un'area, non un punto.
      return { latitude: round(latitude, 2), longitude: round(longitude, 2) }
    case 'zone':
      // Un decimale è circa 11 km: identifica la zona e nient'altro.
      return { latitude: round(latitude, 1), longitude: round(longitude, 1) }
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Formato del file di esportazione, versionato per poterlo far evolvere. */
export interface DiaryExport {
  readonly format: 'fungicast-diary'
  readonly version: 1
  readonly exportedAt: string
  readonly entries: readonly DiaryEntry[]
}
