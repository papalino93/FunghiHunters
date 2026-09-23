'use client'

/**
 * L'affidabilità dei dati in parole, estratta da `SuggestionCard` perché ora la usano anche le
 * zone che seguo: due schede diverse devono dire "stima solida" con le stesse soglie, non
 * ridefinirle ciascuna per conto proprio — è esattamente il tipo di doppione che ha già causato un
 * bug reale nel progetto (`mpiLabel` duplicato fra `explain.ts` e `ZoneSheet.tsx`, M3 in
 * `docs/AUDIT.md`).
 */
export function Reliability({ dataQuality }: { dataQuality: number }) {
  const label =
    dataQuality >= 70 ? 'stima solida' : dataQuality >= 50 ? 'stima discreta' : 'stima incerta'
  const colour =
    dataQuality >= 70 ? 'text-accent' : dataQuality >= 50 ? 'text-ink-dim' : 'text-warn'
  return <span className={colour}>{label}</span>
}
