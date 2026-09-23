/**
 * Zone che seguo.
 *
 * Una preferenza personale, non un dato ambientale: qui non c'è nessun numero del modello, solo
 * l'identità di una zona già presente nel catalogo. Vincolo esplicito del progetto — mai punti
 * GPS, aree segrete o coordinate personali — quindi questo tipo non ha né `latitude` né
 * `longitude`: il potenziale, l'affidabilità e la posizione si leggono sempre dal vivo dallo
 * snapshot o dall'indice nazionale, mai da un valore congelato qui. Una zona seguita che sparisse
 * dal catalogo (non dovrebbe succedere, ma un giorno un codice potrebbe cambiare) semplicemente
 * non troverebbe più corrispondenza: l'interfaccia lo tratta come "dati non disponibili", non
 * mostra mai un numero vecchio spacciato per attuale.
 *
 * `id` è il codice della zona, non un uuid generato al momento: seguire la stessa zona da due
 * dispositivi deve convergere sulla stessa riga quando l'account si sincronizza, non crearne due.
 * Questo rende "segui"/"non seguire più" naturalmente idempotente, ed è anche perché il motore di
 * sincronizzazione (lo stesso del diario, vedi `src/lib/sync/engine.ts`) può risolvere il
 * conflitto con la stessa identica regola last-write-wins.
 */

export interface FollowedZone {
  readonly id: string
  readonly zoneCode: string
  /** Congelato al momento del "segui": serve solo a mostrare un nome se il catalogo non risponde. */
  readonly zoneName: string
  /**
   * Serve a costruire il link corretto verso la mappa: le sette zone di taratura toscane si
   * aprono senza parametro regione, le zone del catalogo nazionale con `?regione=<slug>`. Vedi
   * `zoneMapHref` più sotto.
   */
  readonly regionSlug: string
  readonly createdAt: string
  readonly updatedAt: string
  /** Tombstone di cancellazione, stesso significato di `DiaryEntry.deletedAt`. */
  readonly deletedAt: string | null
}

export interface FollowedZoneDraft {
  readonly zoneCode: string
  readonly zoneName: string
  readonly regionSlug: string
}

/**
 * Com'è fatta davvero una riga letta da IndexedDB o da Supabase: solo l'id è garantito.
 * Stessa cautela di `StoredEntry` in `lib/diary/store.ts` — un campo aggiunto dopo arriva
 * `undefined` su una riga scritta da una versione precedente dell'app.
 */
export type StoredFollowedZone = Partial<FollowedZone> & { readonly id: string }

/** Riporta una riga salvata alla forma corrente, riempiendo ciò che la sua versione non aveva. */
export function normaliseFollowedZone(raw: StoredFollowedZone): FollowedZone {
  return {
    id: raw.id,
    zoneCode: raw.zoneCode ?? raw.id,
    zoneName: raw.zoneName ?? raw.zoneCode ?? raw.id,
    regionSlug: raw.regionSlug ?? '',
    createdAt: raw.createdAt ?? raw.updatedAt ?? '',
    updatedAt: raw.updatedAt ?? raw.createdAt ?? '',
    deletedAt: raw.deletedAt ?? null,
  }
}

/**
 * Il codice identifica una zona di taratura toscana (`amiata`, `garfagnana`, …) o una del
 * catalogo nazionale (`it-<codice ISTAT>`). Le due famiglie non collidono mai — prefissi diversi
 * — quindi il codice da solo basta a scegliere l'indirizzo giusto: vedi `mapHref` in
 * `src/components/today/SuggestionCard.tsx`, stessa regola.
 */
export function isCatalogueZoneCode(zoneCode: string): boolean {
  return zoneCode.startsWith('it-')
}

/** L'indirizzo della mappa per una zona seguita, identico alla regola già usata per i suggerimenti. */
export function zoneMapHref(zone: Pick<FollowedZone, 'zoneCode' | 'regionSlug'>): string {
  const zona = `zona=${encodeURIComponent(zone.zoneCode)}`
  if (!isCatalogueZoneCode(zone.zoneCode)) return `/mappa?${zona}`
  return `/mappa?regione=${encodeURIComponent(zone.regionSlug)}&${zona}`
}
