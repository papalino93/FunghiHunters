/**
 * Test del repository foto del diario.
 *
 * Sull'implementazione in memoria, per lo stesso motivo del resto del diario: verificabile senza
 * IndexedDB, che nei test non esiste.
 */

import { describe, expect, it } from 'vitest'

import { InMemoryPhotoRepository } from '@/lib/diary/photos'

function blob(content: string): Blob {
  return new Blob([content], { type: 'image/jpeg' })
}

describe('repository foto', () => {
  it('associa ogni foto alla voce di diario a cui appartiene', async () => {
    const repo = new InMemoryPhotoRepository()
    await repo.add('entry-1', blob('a'))
    await repo.add('entry-1', blob('b'))
    await repo.add('entry-2', blob('c'))

    expect(await repo.listFor('entry-1')).toHaveLength(2)
    expect(await repo.listFor('entry-2')).toHaveLength(1)
    expect(await repo.listFor('entry-3')).toHaveLength(0)
  })

  it('genera identificativi distinti per foto diverse', async () => {
    const repo = new InMemoryPhotoRepository()
    const a = await repo.add('entry-1', blob('a'))
    const b = await repo.add('entry-1', blob('b'))
    expect(a.id).not.toBe(b.id)
  })

  it('rimuove una singola foto senza toccare le altre', async () => {
    const repo = new InMemoryPhotoRepository()
    const a = await repo.add('entry-1', blob('a'))
    await repo.add('entry-1', blob('b'))

    await repo.remove(a.id)

    expect(await repo.listFor('entry-1')).toHaveLength(1)
  })

  it('rimuove tutte le foto di una voce quando la voce stessa sparisce', async () => {
    const repo = new InMemoryPhotoRepository()
    await repo.add('entry-1', blob('a'))
    await repo.add('entry-1', blob('b'))
    await repo.add('entry-2', blob('c'))

    await repo.removeAllFor('entry-1')

    expect(await repo.listFor('entry-1')).toHaveLength(0)
    expect(await repo.listFor('entry-2')).toHaveLength(1)
  })
})
