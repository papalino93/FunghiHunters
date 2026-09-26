/**
 * Risposte comuni alle rotte `/api/admin/*`.
 *
 * Fuori dai file `route.ts` perché Next.js lì accetta solo esportazioni riservate (`GET`,
 * `dynamic`, …): una costante esportata da una rotta è un errore di build.
 */

import { NextResponse } from 'next/server'

/**
 * Nessuna copia, da nessuna parte.
 *
 * `force-dynamic` basta già perché la CDN di Vercel non conservi la risposta, ma per il diario di
 * tutti gli utenti non ci si affida a un comportamento predefinito: `private` vieta le cache
 * condivise, `no-store` anche quella del browser — su un computer condiviso, altrimenti, le note
 * potrebbero restare nella cache su disco dopo aver chiuso la pagina. Vale per ogni risposta,
 * compresi gli errori: non c'è motivo di fare eccezioni.
 */
export const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

/**
 * Identica a quella di una rotta che non esiste: per chi non è l'amministratore, `/api/admin/*`
 * semplicemente non c'è. Vedi il commento sul 404 in `guard.ts`.
 */
export function adminNotFound(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
}
