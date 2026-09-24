import type { PickingRules } from '@/lib/rules/types'

const MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

/** `2026-09-24` → «24 settembre 2026». */
export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (y === undefined || m === undefined || d === undefined || MONTHS[m - 1] === undefined) return iso
  return `${String(d)} ${MONTHS[m - 1] ?? ''} ${String(y)}`
}

/**
 * Quanto della scheda è confermato da una fonte ufficiale, sui sei punti che contano di più per
 * chi parte: come si ottiene il permesso, quanto si raccoglie, quando, come, dove no, le multe.
 * Serve a dirlo in cima alla pagina, invece di lasciare che una scheda quasi vuota sembri completa.
 */
export function coverage(rules: PickingRules): 'completa' | 'parziale' | 'scarsa' {
  const core = [
    rules.permit.how ?? rules.permit.cost,
    rules.dailyLimitKg,
    rules.hours,
    rules.tools,
    rules.protectedAreas,
    rules.sanctions,
  ]
  const known = core.filter((v) => v !== null).length
  return known >= 5 ? 'completa' : known >= 3 ? 'parziale' : 'scarsa'
}

export function permitLabel(required: boolean | null): string {
  if (required === true) return 'Sì'
  if (required === false) return 'No, per la legge regionale'
  return 'Dipende dalla zona'
}
