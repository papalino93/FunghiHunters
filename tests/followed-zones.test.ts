/**
 * Test del repository locale delle zone che seguo.
 *
 * Stessa idea di `tests/diary.test.ts`: gira sull'implementazione in memoria, cosi' non serve
 * IndexedDB per verificare la logica. Il punto da proteggere e' che l'id e' il codice zona
 * (seguire di nuovo la stessa zona non crea una seconda riga) e che il tombstone si comporta come
 * quello del diario: non sparisce finche' non e' stato confermato, e non resuscita da solo.
 */

import { describe, expect, it } from 'vitest'

import { InMemoryFollowedZoneRepository } from '@/lib/zones/store'
import { isCatalogueZoneCode, normaliseFollowedZone, zoneMapHref } from '@/lib/zones/types'

function draft(overrides: { zoneCode?: string; zoneName?: string; regionSlug?: string } = {}) {
  return {
    zoneCode: overrides.zoneCode ?? 'garfagnana',
    zoneName: overrides.zoneName ?? 'Garfagnana',
    regionSlug: overrides.regionSlug ?? 'toscana',
  }
}

describe('seguire e non seguire', () => {
  it('seguire una zona la fa comparire nella lista viva', async () => {
    const repo = new InMemoryFollowedZoneRepository()
    await repo.follow(draft())

    const list = await repo.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.zoneCode).toBe('garfagnana')
    expect(list[0]?.deletedAt).toBeNull()
  })

  it('seguire due volte la stessa zona non crea una seconda riga', async () => {
    const repo = new InMemoryFollowedZoneRepository()
    await repo.follow(draft())
    await repo.follow(draft({ zoneName: 'Garfagnana (aggiornato)' }))

    expect(await repo.listAll()).toHaveLength(1)
  })

  it('l\'id e\' il codice zona, non un uuid: due zone diverse restano righe diverse', async () => {
    const repo = new InMemoryFollowedZoneRepository()
    const a = await repo.follow(draft({ zoneCode: 'amiata', zoneName: 'Monte Amiata' }))
    const b = await repo.follow(draft({ zoneCode: 'casentino', zoneName: 'Casentino' }))

    expect(a.id).toBe('amiata')
    expect(b.id).toBe('casentino')
    expect(await repo.list()).toHaveLength(2)
  })

  it('non seguire più marca un tombstone, non cancella subito la riga', async () => {
    const repo = new InMemoryFollowedZoneRepository()
    await repo.follow(draft())
    const removed = await repo.unfollow('garfagnana')

    expect(removed).toBe(true)
    expect(await repo.list()).toHaveLength(0) // sparita dalla lista viva
    expect(await repo.listAll()).toHaveLength(1) // ma il motore di sync la vede ancora
    expect((await repo.listAll())[0]?.deletedAt).not.toBeNull()
  })

  it('non seguire più una zona già non seguita non fa nulla', async () => {
    const repo = new InMemoryFollowedZoneRepository()
    expect(await repo.unfollow('inesistente')).toBe(false)

    await repo.follow(draft())
    await repo.unfollow('garfagnana')
    expect(await repo.unfollow('garfagnana')).toBe(false) // già tombstonata
  })

  it('seguire di nuovo dopo aver smesso di seguire la fa ricomparire (stesso id)', async () => {
    const repo = new InMemoryFollowedZoneRepository()
    const first = await repo.follow(draft())
    await repo.unfollow('garfagnana')
    const second = await repo.follow(draft())

    expect(second.id).toBe(first.id)
    expect(second.deletedAt).toBeNull()
    expect(await repo.list()).toHaveLength(1)
  })

  it('isFollowed è false per una zona mai seguita e per una tombstonata', async () => {
    const repo = new InMemoryFollowedZoneRepository()
    expect(await repo.isFollowed('garfagnana')).toBe(false)

    await repo.follow(draft())
    expect(await repo.isFollowed('garfagnana')).toBe(true)

    await repo.unfollow('garfagnana')
    expect(await repo.isFollowed('garfagnana')).toBe(false)
  })

  it('purge toglie fisicamente la riga', async () => {
    const repo = new InMemoryFollowedZoneRepository()
    await repo.follow(draft())
    await repo.unfollow('garfagnana')
    expect(await repo.purge('garfagnana')).toBe(true)
    expect(await repo.listAll()).toHaveLength(0)
  })
})

describe('normaliseFollowedZone', () => {
  it('riempie i campi mancanti su una riga scritta da una versione precedente', () => {
    const normalised = normaliseFollowedZone({ id: 'amiata' })
    expect(normalised.zoneCode).toBe('amiata')
    expect(normalised.zoneName).toBe('amiata')
    expect(normalised.deletedAt).toBeNull()
  })
})

describe('indirizzo mappa di una zona seguita', () => {
  it('riconosce le zone di taratura toscane dal codice, senza prefisso', () => {
    expect(isCatalogueZoneCode('amiata')).toBe(false)
    expect(isCatalogueZoneCode('it-048017')).toBe(true)
  })

  it('una zona di taratura apre la mappa senza parametro regione', () => {
    expect(zoneMapHref({ zoneCode: 'amiata', regionSlug: 'toscana' })).toBe('/mappa?zona=amiata')
  })

  it('una zona del catalogo nazionale porta sempre la sua regione', () => {
    expect(zoneMapHref({ zoneCode: 'it-048017', regionSlug: 'lombardia' })).toBe(
      '/mappa?regione=lombardia&zona=it-048017',
    )
  })
})
