/**
 * Le norme di raccolta, regione per regione.
 *
 * I dati stanno in `regole.json`: raccolti sulle fonti ufficiali (leggi regionali e provinciali,
 * pagine delle Regioni) con la data del controllo, e lasciati a `null` dove una fonte ufficiale
 * non c'era. Vanno ricontrollati ogni stagione: le tariffe e i limiti cambiano per delibera, e il
 * Trentino ha alzato il limite da 2 a 3 kg nell'agosto 2025.
 */

import data from '@/lib/rules/regole.json'
import type { PickingRules } from '@/lib/rules/types'

export type { PickingRules } from '@/lib/rules/types'

export const PICKING_RULES: readonly PickingRules[] = data as readonly PickingRules[]

export function rulesBySlug(slug: string): PickingRules | null {
  return PICKING_RULES.find((r) => r.slug === slug) ?? null
}
