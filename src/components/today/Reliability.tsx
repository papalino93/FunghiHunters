'use client'

/**
 * L'affidabilità dei dati in parole, estratta da `SuggestionCard` perché ora la usano anche le
 * zone che seguo: due schede diverse devono dire "stima solida" con le stesse soglie, non
 * ridefinirle ciascuna per conto proprio — è esattamente il tipo di doppione che ha già causato un
 * bug reale nel progetto (`mpiLabel` duplicato fra `explain.ts` e `ZoneSheet.tsx`, M3 in
 * `docs/AUDIT.md`).
 *
 * Pura, separata dal componente per essere testabile senza montare React — stesso principio di
 * `parsePlaceForecast` in `open-meteo-place.ts`.
 *
 * **`hasStations` non è un dettaglio.** Con la copertura nazionale, `dataQuality` da sola non
 * basta più a distinguere una stima misurata da una di solo modello: una zona senza una sola
 * stazione vicina può comunque avere una `dataQuality` alta (buona risoluzione, orizzonte breve)
 * e finire etichettata "stima solida" — la stessa parola di una delle sette zone toscane tarate
 * su osservazioni reali. "Solida" si guadagna con le osservazioni, non con la sola risoluzione
 * del modello meteo: senza stazioni, il tetto è "stima da modello", mai "stima solida".
 */
export function reliabilityLabel(
  dataQuality: number,
  hasStations: boolean,
): { readonly label: string; readonly colour: string } {
  if (!hasStations) {
    return dataQuality >= 50
      ? { label: 'stima da modello', colour: 'text-ink-dim' }
      : { label: 'stima da modello, incerta', colour: 'text-warn' }
  }
  if (dataQuality >= 70) return { label: 'stima solida', colour: 'text-accent' }
  if (dataQuality >= 50) return { label: 'stima discreta', colour: 'text-ink-dim' }
  return { label: 'stima incerta', colour: 'text-warn' }
}

export function Reliability({
  dataQuality,
  hasStations = true,
}: {
  dataQuality: number
  /** `false` per una zona senza una sola stazione vicina: solo modello, mai "solida". */
  hasStations?: boolean
}) {
  const { label, colour } = reliabilityLabel(dataQuality, hasStations)
  return <span className={colour}>{label}</span>
}
