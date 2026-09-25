/**
 * Caricare la regione che l'utente ha scelto come riferimento.
 *
 * Fino a oggi la home e la mappa leggevano sempre e solo `snapshot.json`, cioè le sette zone
 * toscane: chi apriva l'app dal Trentino vedeva la Toscana, e il pulsante "Dettaglio e mappa" di
 * una zona trentina apriva una mappa che quella zona non conteneva.
 *
 * La Toscana resta un caso a parte, e va detto perché: esiste in due versioni. Le **sette zone di
 * taratura** (`snapshot.json`) sono scelte a mano, legate alle stazioni SIR, e sono le uniche
 * alimentate da misure reali invece che dal solo modello. I **ventiquattro comuni toscani**
 * (`regioni/toscana.json`) vengono dal catalogo nazionale come quelli di ogni altra regione.
 * Chi sceglie "Toscana" come riferimento riceve le sette: sono i dati migliori che l'app abbia, e
 * sono ciò che la Toscana ha sempre mostrato. I ventiquattro comuni restano dove sono sempre
 * stati, sotto Italia → Toscana.
 */

import { ZONES } from '@/lib/config/zones'
import { loadSnapshot } from '@/lib/snapshot/load'
import { loadItaliaIndex, loadRegion } from '@/lib/snapshot/load-italia'
import type { Snapshot } from '@/lib/snapshot/types'
import {
  DEFAULT_REGION_SLUG,
  isRegionSlug,
  resolveRegionSlug,
  type RegionChoice,
} from '@/lib/region/preference'

export interface ReferenceRegion {
  readonly slug: string
  readonly name: string
  readonly snapshot: Snapshot
  /** Le regioni fra cui si può scegliere, per il selettore. */
  readonly choices: readonly RegionChoice[]
  /**
   * `true` quando queste sono le sette zone di taratura toscane e non i comuni del catalogo:
   * l'interfaccia lo usa per offrire il collegamento ai comuni, che altrimenti chi cerca il
   * proprio paese non troverebbe.
   */
  readonly isTuscanyCalibration: boolean
}

/**
 * L'elenco delle regioni disponibili, nell'ordine dell'indice (alfabetico).
 *
 * Tenuto in memoria dopo la prima lettura, e non per velocità fine a sé stessa: serve a venti
 * nomi, ma vive dentro `italia-index.json`, che pesa 378 KB per via delle 1.202 zone che gli
 * stanno accanto. Senza questa riga ogni apertura della home ne pagherebbe la lettura e
 * l'analisi per intero.
 *
 * Il file cambia solo quando il catalogo viene rigenerato, e quello arriva sempre con un deploy
 * nuovo — cioè con un processo nuovo, che riparte da zero. Un risultato vuoto non si tiene: in
 * quel caso il file mancava, ed è un guasto da non congelare fino al prossimo rilascio.
 */
let cachedChoices: RegionChoice[] | null = null

export async function regionChoices(): Promise<RegionChoice[]> {
  if (cachedChoices !== null) return cachedChoices
  const index = await loadItaliaIndex()
  const choices = index.regions.map((r) => ({ slug: r.slug, name: r.name }))
  if (choices.length > 0) cachedChoices = choices
  return choices
}

/**
 * La regione di riferimento, pronta da mostrare.
 *
 * `candidate` è il valore del cookie, cioè non fidato: `resolveRegionSlug` lo riduce a una regione
 * che esiste davvero, e se il file di quella regione manca o è vuoto si ricade sulla Toscana. Una
 * pagina vuota non è mai una risposta accettabile a una preferenza salvata male.
 */
export async function loadReferenceRegion(
  candidate: string | null | undefined,
): Promise<ReferenceRegion> {
  const choices = await regionChoices()
  const slug = resolveRegionSlug(candidate, choices)
  const name = choices.find((r) => r.slug === slug)?.name ?? 'Toscana'

  if (slug !== DEFAULT_REGION_SLUG) {
    const snapshot = await loadRegion(slug)
    if (snapshot !== null && snapshot.zones.length > 0) {
      return { slug, name, snapshot, choices, isTuscanyCalibration: false }
    }
  }

  /*
   * Dal 25/09/2026 la Toscana ha un file completo, con le sette zone di taratura e tutti i comuni
   * boscati calcolati con le stazioni SIR (`scripts/build-snapshot-toscana.ts`): quando c'e', e'
   * lui la Toscana della home. Si riconosce dalle zone di taratura dentro; il vecchio file del
   * catalogo nazionale (24 comuni di montagna, senza stazioni) non le ha, e allora si resta alle
   * sette di sempre.
   */
  const full = await loadRegion(DEFAULT_REGION_SLUG)
  const calibrationCodes = new Set(ZONES.map((z) => z.code))
  if (full !== null && full.zones.some((z) => calibrationCodes.has(z.code))) {
    return {
      slug: DEFAULT_REGION_SLUG,
      name: choices.find((r) => r.slug === DEFAULT_REGION_SLUG)?.name ?? 'Toscana',
      snapshot: full,
      choices,
      isTuscanyCalibration: false,
    }
  }

  return {
    slug: DEFAULT_REGION_SLUG,
    name: choices.find((r) => r.slug === DEFAULT_REGION_SLUG)?.name ?? 'Toscana',
    snapshot: await loadSnapshot(),
    choices,
    isTuscanyCalibration: true,
  }
}

/**
 * La regione da mostrare sulla mappa.
 *
 * Due strade, e la differenza conta. Un `regione` **esplicito** nell'indirizzo arriva da chi sta
 * navigando il catalogo (Italia -> una regione -> una zona): vuole proprio quelle zone lì, comuni
 * toscani compresi. Nessun parametro significa invece "la mia mappa", e allora vale la regione di
 * riferimento — che per la Toscana sono le sette zone di taratura, non i ventiquattro comuni.
 *
 * Senza questa distinzione, aprire una zona del catalogo toscano avrebbe mostrato le sette zone,
 * cioè lo stesso difetto che questa funzione esiste per chiudere, solo dentro la stessa regione.
 */
export async function loadMapRegion(
  explicit: string | null | undefined,
  cookie: string | null | undefined,
): Promise<ReferenceRegion> {
  if (isRegionSlug(explicit)) {
    const snapshot = await loadRegion(explicit)
    if (snapshot !== null && snapshot.zones.length > 0) {
      const choices = await regionChoices()
      const name = choices.find((r) => r.slug === explicit)?.name ?? explicit
      return { slug: explicit, name, snapshot, choices, isTuscanyCalibration: false }
    }
  }
  return loadReferenceRegion(cookie)
}
