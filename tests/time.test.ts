import { describe, expect, it } from 'vitest'

import {
  addDays,
  attributedDateFromLabel,
  daysBetween,
  eachDay,
  localHour,
  localOffsetMinutes,
  localToInstant,
  toLocalDate,
  windowInterval,
} from '@/lib/domain/time'

describe('conversione UTC -> data locale', () => {
  it('attribuisce al giorno giusto la mezzanotte locale espressa in UTC', () => {
    // Caso reale dal layer sir_pluviometri_valori_ieri_pubblico del 2026-09-17:
    // dataora 2026-09-15T22:00:00Z e' la mezzanotte del 16 settembre in ora legale italiana.
    expect(toLocalDate('2026-09-15T22:00:00Z')).toBe('2026-09-16')
  })

  it('attribuisce al giorno giusto le 9:00 locali espresse in UTC', () => {
    // Caso reale dal layer sir_pluviometri_valori_ieri9_pubblico dello stesso giorno.
    expect(toLocalDate('2026-09-16T07:00:00Z')).toBe('2026-09-16')
    expect(localHour('2026-09-16T07:00:00Z')).toBe(9)
  })

  it('gestisce il cambio fra ora legale e ora solare', () => {
    // In ora legale (CEST, UTC+2) le 9:00 locali sono le 07:00Z...
    expect(localOffsetMinutes('2026-09-16T07:00:00Z')).toBe(120)
    expect(localHour('2026-09-16T07:00:00Z')).toBe(9)
    // ...in ora solare (CET, UTC+1) sono le 08:00Z. E' il motivo per cui l'offset non si scrive
    // come costante da nessuna parte.
    expect(localOffsetMinutes('2026-01-15T08:00:00Z')).toBe(60)
    expect(localHour('2026-01-15T08:00:00Z')).toBe(9)
  })

  it('la stessa regola vale per entrambe le finestre', () => {
    // E' questa coincidenza che permette un solo percorso di conversione nell'adapter.
    expect(attributedDateFromLabel('2026-09-15T22:00:00Z')).toBe('2026-09-16')
    expect(attributedDateFromLabel('2026-09-16T07:00:00Z')).toBe('2026-09-16')
  })
})

describe('andata e ritorno fra data locale e istante', () => {
  it('ricostruisce la mezzanotte locale in ora legale', () => {
    expect(localToInstant('2026-09-16', 0).toISOString()).toBe('2026-09-15T22:00:00.000Z')
  })

  it('ricostruisce la mezzanotte locale in ora solare', () => {
    expect(localToInstant('2026-01-16', 0).toISOString()).toBe('2026-01-15T23:00:00.000Z')
  })

  it('ricostruisce le 9:00 locali in entrambi i regimi', () => {
    expect(localToInstant('2026-09-16', 9).toISOString()).toBe('2026-09-16T07:00:00.000Z')
    expect(localToInstant('2026-01-16', 9).toISOString()).toBe('2026-01-16T08:00:00.000Z')
  })
})

describe('aritmetica sulle date locali', () => {
  it('somma e sottrae giorni attraversando i confini di mese e anno', () => {
    expect(addDays('2026-09-17', 1)).toBe('2026-09-18')
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('non perde un giorno attraversando il cambio d ora', () => {
    // L'ora legale 2026 in Italia finisce il 25 ottobre: sommare giorni su date locali non deve
    // risentirne. Questo e' il test che fallisce se qualcuno reintroduce l aritmetica su Date.
    const days = eachDay('2026-10-23', '2026-10-27')
    expect(days).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
    expect(daysBetween('2026-10-23', '2026-10-27')).toBe(4)
  })

  it('daysBetween e eachDay sono coerenti fra loro', () => {
    expect(eachDay('2026-09-17', '2026-09-17')).toEqual(['2026-09-17'])
    expect(eachDay('2026-09-18', '2026-09-17')).toEqual([])
    expect(daysBetween('2026-09-17', '2026-09-17')).toBe(0)
  })
})

describe('intervallo fisico delle finestre di aggregazione', () => {
  it('la finestra 0-24 copre la giornata locale', () => {
    const { start, end } = windowInterval('2026-09-16', '0_24')
    expect(start.toISOString()).toBe('2026-09-15T22:00:00.000Z')
    expect(end.toISOString()).toBe('2026-09-16T22:00:00.000Z')
  })

  it('la finestra 9-9 copre dalle 9:00 del giorno prima alle 9:00 del giorno indicato', () => {
    const { start, end } = windowInterval('2026-09-16', '9_9')
    expect(start.toISOString()).toBe('2026-09-15T07:00:00.000Z')
    expect(end.toISOString()).toBe('2026-09-16T07:00:00.000Z')
  })

  it('le due finestre dello stesso giorno sono sfasate di nove ore', () => {
    // La ragione per cui un evento puo' cadere in due giorni diversi a seconda della serie.
    const zeroTwentyFour = windowInterval('2026-09-16', '0_24')
    const nineNine = windowInterval('2026-09-16', '9_9')
    const shiftHours = (zeroTwentyFour.start.getTime() - nineNine.start.getTime()) / 3_600_000
    expect(shiftHours).toBe(15)
  })

  it('rifiuta una data mal formata invece di indovinare', () => {
    expect(() => windowInterval('17/09/2026', '0_24')).toThrow(/Data locale non valida/)
    expect(() => addDays('2026-9-17', 1)).toThrow(/Data locale non valida/)
  })
})
