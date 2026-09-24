/**
 * Le norme di raccolta di una regione (o provincia autonoma).
 *
 * Ogni valore viene da una fonte ufficiale (la legge, il bollettino o la pagina della Regione) e
 * porta la data in cui è stato controllato. Quello che non si è potuto confermare resta `null` e
 * la pagina lo dice: una cifra indovinata su un tesserino o su un limite in kg può costare una
 * multa a chi si fida.
 */
export interface PickingRules {
  /** Indirizzo della pagina: `/regole/<slug>`. */
  readonly slug: string
  /** La regione dell'app a cui appartiene (per il Trentino-Alto Adige, due province). */
  readonly regionSlug: string
  readonly name: string
  readonly law: string
  readonly lawUrl: string | null
  readonly permit: {
    readonly required: boolean | null
    readonly who: string | null
    readonly how: string | null
    readonly cost: string | null
    readonly sourceUrl: string | null
  }
  readonly dailyLimitKg: number | null
  readonly porciniSpecificLimit: string | null
  readonly days: string | null
  readonly hours: string | null
  readonly minSizePorcini: string | null
  readonly tools: string | null
  readonly protectedAreas: string | null
  readonly sanctions: string | null
  readonly mycologicalInspectorate: string | null
  readonly officialPageUrl: string | null
  /** Data del controllo sulle fonti, `YYYY-MM-DD`. */
  readonly verifiedOn: string
  readonly notes: string | null
}
