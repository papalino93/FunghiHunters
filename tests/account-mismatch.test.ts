/**
 * Test del controllo che impedisce di sincronizzare in automatico il diario di una persona
 * nell'account di un'altra, su un dispositivo condiviso.
 *
 * Trovato in una revisione approfondita del codice di sincronizzazione: `sync()` partiva da solo
 * a ogni login, e il logout non cancella il diario locale (di proposito — è dati dell'utente).
 * Due persone in sequenza sullo stesso telefono, senza che la prima esporti/cancelli: la seconda
 * fa login e il diario della prima — comprese eventuali coordinate esatte — finiva spedito
 * nell'account della seconda.
 */

import { describe, expect, it } from 'vitest'

import { isAccountMismatch } from '@/lib/sync/useDiarySync'

describe('isAccountMismatch', () => {
  it('nessun mismatch se questo dispositivo non ha mai sincronizzato con nessuno', () => {
    expect(isAccountMismatch(null, 'utente-b')).toBe(false)
  })

  it('nessun mismatch se è lo stesso account di sempre', () => {
    expect(isAccountMismatch('utente-a', 'utente-a')).toBe(false)
  })

  it('mismatch se l\'ultimo account sincronizzato è diverso da quello collegato ora', () => {
    expect(isAccountMismatch('utente-a', 'utente-b')).toBe(true)
  })
})
