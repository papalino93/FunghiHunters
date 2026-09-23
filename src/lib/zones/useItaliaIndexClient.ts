'use client'

/**
 * L'indice nazionale leggero, letto dal browser.
 *
 * Serve a un solo caso: mostrare in home il punteggio di una zona seguita che non appartiene alla
 * regione di riferimento aperta in questo momento (vedi `src/lib/zones/resolve.ts`). Il file è
 * già uno degli asset statici di `public/data/` — lo stesso che il server legge da disco per
 * `regionChoices()` — quindi qui si fa un `fetch` qualunque, senza una rotta API dedicata.
 *
 * Una sola richiesta per tutta la sessione della pagina: l'indice non cambia più di una volta al
 * giorno, rileggerlo a ogni apertura della sezione "Le tue zone" sarebbe solo traffico in più. Un
 * fallimento (offline, file non ancora generato) non è un errore da mostrare: la sezione mostra
 * quello che sa dalla regione corrente e basta, com'è già il comportamento quando l'indice manca
 * lato server (`loadItaliaIndex`).
 */

import { useEffect, useState } from 'react'

import type { ItaliaIndex } from '@/../scripts/build-snapshot-italia'
import type { IndexSource } from '@/lib/zones/resolve'

let cached: IndexSource | null | undefined

async function fetchIndex(): Promise<IndexSource | null> {
  try {
    const response = await fetch('/data/italia-index.json')
    if (!response.ok) return null
    const parsed = (await response.json()) as Partial<ItaliaIndex>
    if (!Array.isArray(parsed.zones) || typeof parsed.referenceDate !== 'string') return null
    return { zones: parsed.zones, referenceDate: parsed.referenceDate }
  } catch {
    return null
  }
}

/** `undefined` = ancora in lettura, `null` = non disponibile (offline o file assente). */
export function useItaliaIndexClient(enabled: boolean): IndexSource | null | undefined {
  const [index, setIndex] = useState<IndexSource | null | undefined>(cached)

  useEffect(() => {
    if (!enabled || cached !== undefined) return
    let cancelled = false
    void fetchIndex().then((result) => {
      cached = result
      if (!cancelled) setIndex(result)
    })
    return () => { cancelled = true }
  }, [enabled])

  return enabled ? index : undefined
}
