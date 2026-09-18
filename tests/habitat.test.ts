import { describe, expect, it } from 'vitest'

import { habitatCuesFor } from '@/lib/model/habitat'

describe('habitatCuesFor', () => {
  it('restituisce un accenno per ogni tipo di bosco riconosciuto', () => {
    const cues = habitatCuesFor(['faggeta', 'abetina'])
    expect(cues.map((c) => c.forestType)).toEqual(['faggeta', 'abetina'])
    expect(cues[0]!.note.length).toBeGreaterThan(0)
  })

  it('non duplica lo stesso tipo di bosco', () => {
    const cues = habitatCuesFor(['faggeta', 'faggeta'])
    expect(cues).toHaveLength(1)
  })

  it('ignora i tipi di bosco non riconosciuti invece di fallire', () => {
    const cues = habitatCuesFor(['tipo-inventato', 'cerreta'])
    expect(cues.map((c) => c.forestType)).toEqual(['cerreta'])
  })

  it('lista vuota per zone senza tipi di bosco', () => {
    expect(habitatCuesFor([])).toEqual([])
  })

  it('nessun accenno promette la presenza di funghi', () => {
    const all = habitatCuesFor(['faggeta', 'abetina', 'castagneto', 'cerreta', 'leccio'])
    const forbidden = /trover|garantit|sicuramente|certo cento per cento/i
    for (const cue of all) {
      expect(cue.note).not.toMatch(forbidden)
    }
  })
})
