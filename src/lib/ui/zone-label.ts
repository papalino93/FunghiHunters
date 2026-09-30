/**
 * La quota accanto al nome di una zona, ovunque compaia: «Vicchio · 376 m», «Mugello · Passo
 * della Futa · 900 m».
 *
 * Senza, due zone vicine con punteggi molto diversi sembravano la stessa cosa: «Mugello» (la
 * faggeta del Passo della Futa, 900 m) e «Borgo San Lorenzo» (le colline, 294 m) sono entrambe
 * Mugello per chi le legge, ma non per il porcino. Il 25/09/2026 davano 65 e 20.
 */

/** «900 m», oppure `null` se la quota non c'è. */
export function elevationText(elevationM: number | null | undefined): string | null {
  if (elevationM === null || elevationM === undefined || !Number.isFinite(elevationM)) return null
  return `${String(Math.round(elevationM))} m`
}

function comparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Il posto di riferimento, solo quando dice qualcosa in più del nome: «Passo della Futa» per
 * «Mugello», niente per «Vicchio» (che ha sé stesso come riferimento).
 */
export function referenceText(name: string, reference: string | null | undefined): string | null {
  if (reference === null || reference === undefined || reference.trim() === '') return null
  const a = comparable(name)
  const b = comparable(reference)
  if (a === b || a.includes(b) || b.includes(a)) return null
  return reference.trim()
}

/** Quello che va dopo il nome: «Passo della Futa · 900 m», «376 m», o `null`. */
export function zoneDetail(zone: {
  readonly name: string
  readonly reference?: string | null
  readonly elevationM?: number | null
}): string | null {
  const parts = [referenceText(zone.name, zone.reference), elevationText(zone.elevationM)].filter(
    (x): x is string => x !== null,
  )
  return parts.length === 0 ? null : parts.join(' · ')
}

/** Nome e dettaglio in una riga sola, per testi semplici (opzioni di un menu, titoli). */
export function zoneLabel(zone: {
  readonly name: string
  readonly reference?: string | null
  readonly elevationM?: number | null
}): string {
  const detail = zoneDetail(zone)
  return detail === null ? zone.name : `${zone.name} · ${detail}`
}
