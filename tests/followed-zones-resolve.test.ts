/**
 * Come si legge il punteggio di una zona seguita — `src/lib/zones/resolve.ts`.
 *
 * Il punto da proteggere, esplicitamente chiesto: una zona seguita non deve mai mostrare un dato
 * vecchio spacciato per quello di oggi. Qui non c'è nessun valore congelato da leggere (il tipo
 * `FollowedZone` non ha né `mpi` né `confidence`, vedi `src/lib/zones/types.ts`): la funzione
 * legge sempre da una delle due fonti live, e torna `null` quando nessuna delle due ha la zona,
 * mai un numero indovinato.
 */

import { describe, expect, it } from 'vitest'

import { resolveFollowedZone } from '@/lib/zones/resolve'
import type { SnapshotStation } from '@/lib/snapshot/types'

const STATION: SnapshotStation = {
  code: 'TOS11000114',
  name: 'Laghetto Verde',
  latitude: 42.88,
  longitude: 11.66,
  elevationM: 900,
  distanceKm: 1.2,
  elevationDiffM: 10,
  effectiveKm: 1.2,
  variable: 'rain',
}

const snapshot = {
  referenceDate: '2026-09-22',
  zones: [
    { code: 'amiata', mpi: 42, label: 'discrete', dataQuality: 81, stations: [STATION] },
    // Una zona nazionale di solo modello, nella stessa regione: nessuna stazione vicina.
    { code: 'it-nazionale', mpi: 55, label: 'buone', dataQuality: 69, stations: [] },
  ],
}

const index = {
  referenceDate: '2026-09-21', // un giorno diverso apposta: le due fonti non aggiornano insieme
  zones: [{ code: 'it-048017', mpi: 17, label: 'poco favorevoli', confidence: 63 }],
}

describe('resolveFollowedZone', () => {
  it('legge dallo snapshot della regione corrente quando la zona c\'è, con dataQuality', () => {
    const result = resolveFollowedZone('amiata', snapshot, index)
    expect(result).toEqual({
      mpi: 42,
      label: 'discrete',
      referenceDate: '2026-09-22',
      reliability: { kind: 'quality', dataQuality: 81, hasStations: true },
    })
  })

  it('segnala l\'assenza di stazioni: una zona nazionale di solo modello non è "hasStations"', () => {
    // Il difetto che questo test chiude: senza `hasStations`, questa zona sarebbe indistinguibile
    // da "amiata" qui sopra a parità di `dataQuality` — e "Reliability" le etichetterebbe entrambe
    // con la stessa parola, anche se una sola delle due ha una stazione reale vicina.
    const result = resolveFollowedZone('it-nazionale', snapshot, index)
    expect(result?.reliability).toEqual({ kind: 'quality', dataQuality: 69, hasStations: false })
  })

  it('ricade sull\'indice nazionale per una zona fuori dalla regione corrente, con confidence', () => {
    const result = resolveFollowedZone('it-048017', snapshot, index)
    expect(result).toEqual({
      mpi: 17,
      label: 'poco favorevoli',
      referenceDate: '2026-09-21',
      reliability: { kind: 'confidence', confidence: 63 },
    })
  })

  it('preferisce lo snapshot corrente anche se la zona esiste anche nell\'indice', () => {
    const bothIndex = { referenceDate: '2026-09-20', zones: [{ code: 'amiata', mpi: 99, label: 'x', confidence: 10 }] }
    const result = resolveFollowedZone('amiata', snapshot, bothIndex)
    // Vince lo snapshot (42, di oggi), mai il valore più vecchio dell'indice (99).
    expect(result?.mpi).toBe(42)
    expect(result?.referenceDate).toBe('2026-09-22')
  })

  it('torna null, mai un numero inventato, se la zona non è in nessuna delle due fonti', () => {
    expect(resolveFollowedZone('inesistente', snapshot, index)).toBeNull()
  })

  it('torna null quando l\'indice non è disponibile e la zona non è nello snapshot corrente', () => {
    expect(resolveFollowedZone('it-048017', snapshot, null)).toBeNull()
  })
})
