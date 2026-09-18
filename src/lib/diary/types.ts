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

  /** Coordinate, conservate secondo `privacy`. `null` quando non le hai volute salvare. */
  readonly latitude: number | null
  readonly longitude: number | null
  readonly privacy: PrivacyLevel

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
