/**
 * `planRegions` e `describePartialRun`: cosa succede ai file di regione quando un lotto
 * Open-Meteo fallisce. Prima un solo lotto andato male buttava via l'intera corsa nazionale; ora
 * ogni regione decide per conto suo, e questi test fissano le quattro strade possibili senza
 * toccare ne' la rete ne' il disco.
 */

import { describe, expect, it } from 'vitest'

import { describePartialRun, planRegions } from '@/../scripts/build-snapshot-italia'
import type { SnapshotZone } from '@/lib/snapshot/types'

// `planRegions` legge solo il codice: il resto della zona non c'entra con la decisione.
function computed(code: string): SnapshotZone {
  return { code } as unknown as SnapshotZone
}

const CATALOG = [
  { code: 'PI1', region: 'Piemonte' },
  { code: 'PI2', region: 'Piemonte' },
  { code: 'LO1', region: 'Lombardia' },
  { code: 'LO2', region: 'Lombardia' },
  { code: 'VA1', region: "Valle d'Aosta/Vallée d'Aoste" },
]

describe('planRegions', () => {
  it('corsa completa: ogni regione si scrive, con la fonte "ok"', () => {
    const plans = planRegions(
      CATALOG,
      CATALOG.map((z) => computed(z.code)),
      new Set(),
      new Set(['piemonte', 'lombardia']),
    )
    expect(plans.map((p) => [p.slug, p.kind, p.kind === 'write' ? p.status : null])).toEqual([
      ['piemonte', 'write', 'ok'],
      ['lombardia', 'write', 'ok'],
      ['valle-d-aosta-vallee-d-aoste', 'write', 'ok'],
    ])
  })

  it('un lotto perso tiene il file di ieri della regione colpita, e solo di quella', () => {
    // Il lotto con LO2 e' fallito: la Lombardia avrebbe mezza regione. Il file di ieri e'
    // completo, quindi resta quello; il Piemonte, intero, si riscrive come sempre.
    const plans = planRegions(
      CATALOG,
      [computed('PI1'), computed('PI2'), computed('LO1'), computed('VA1')],
      new Set(['LO2']),
      new Set(['piemonte', 'lombardia', 'valle-d-aosta-vallee-d-aoste']),
    )
    const bySlug = new Map(plans.map((p) => [p.slug, p]))
    expect(bySlug.get('piemonte')).toMatchObject({ kind: 'write', status: 'ok' })
    expect(bySlug.get('lombardia')).toMatchObject({ kind: 'keep', failed: 1 })
    expect(bySlug.get('valle-d-aosta-vallee-d-aoste')).toMatchObject({ kind: 'write', status: 'ok' })
  })

  it('senza file di ieri una regione parziale si scrive lo stesso, dichiarata "degraded"', () => {
    const plans = planRegions(
      CATALOG,
      [computed('PI1'), computed('PI2'), computed('LO1')],
      new Set(['LO2', 'VA1']),
      new Set(),
    )
    const bySlug = new Map(plans.map((p) => [p.slug, p]))
    const lombardia = bySlug.get('lombardia')
    expect(lombardia).toMatchObject({ kind: 'write', status: 'degraded', failed: 1 })
    expect(lombardia?.kind === 'write' ? lombardia.zones.map((z) => z.code) : []).toEqual(['LO1'])
    // Nessuna zona e nessun file precedente: la regione manca, ma non si inventa niente.
    expect(bySlug.get('valle-d-aosta-vallee-d-aoste')).toMatchObject({ kind: 'lost', failed: 1 })
  })

  it('una regione interamente persa con il file di ieri lo tiene, non lo cancella', () => {
    const plans = planRegions(
      CATALOG,
      [computed('PI1'), computed('PI2'), computed('VA1')],
      new Set(['LO1', 'LO2']),
      new Set(['lombardia']),
    )
    expect(plans.find((p) => p.slug === 'lombardia')).toMatchObject({ kind: 'keep', failed: 2 })
  })
})

describe('describePartialRun', () => {
  it('tace quando la corsa e\' completa', () => {
    const plans = planRegions(CATALOG, CATALOG.map((z) => computed(z.code)), new Set(), new Set())
    expect(describePartialRun(plans, [])).toBeNull()
  })

  it('elenca per nome le regioni rimaste indietro e i lotti falliti', () => {
    const plans = planRegions(
      CATALOG,
      [computed('PI1'), computed('PI2'), computed('LO1')],
      new Set(['LO2', 'VA1']),
      new Set(['lombardia']),
    )
    const report = describePartialRun(plans, ['lotto 3/3 (Lombardia): Risposta non JSON'])
    expect(report?.title).toBe('Snapshot nazionale parziale: 2 regioni non aggiornate')
    expect(report?.message).toContain('Lombardia: 1 zone perse, resta il file della corsa precedente')
    expect(report?.message).toContain("Valle d'Aosta/Vallée d'Aoste: nessuna zona calcolata")
    expect(report?.message).toContain('lotto 3/3 (Lombardia): Risposta non JSON')
    expect(report?.message).not.toContain('Piemonte')
  })
})
