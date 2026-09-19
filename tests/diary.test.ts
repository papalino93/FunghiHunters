/**
 * Test del diario uscite.
 *
 * Girano sull'implementazione in memoria: la logica sta dietro un'interfaccia proprio perché sia
 * verificabile senza IndexedDB, e perché il passaggio a Supabase dovrà toccare
 * un'implementazione e nient'altro.
 */

import { describe, expect, it } from 'vitest'

import {
  InMemoryDiaryRepository,
  importInto,
  materialise,
  normaliseEntry,
  sortEntries,
  toExport,
} from '@/lib/diary/store'
import { MIN_ENTRIES_FOR_SIGNAL, calibrate, spearman } from '@/lib/diary/calibration'
import {
  ABUNDANCE_LABELS,
  applyPrivacy,
  isValidDurationMinutes,
  isValidSearchers,
  type Abundance,
  type DiaryEntry,
} from '@/lib/diary/types'

function draft(overrides: Partial<Parameters<InMemoryDiaryRepository['add']>[0]> = {}) {
  return {
    date: '2026-09-16',
    zoneCode: 'garfagnana',
    zoneName: 'Garfagnana',
    abundance: 'some' as Abundance,
    mpiAtEntry: 42,
    confidenceAtEntry: 71,
    algorithmVersionAtEntry: '1.0.0-porcino',
    ...overrides,
  }
}

describe('riservatezza delle coordinate', () => {
  it('conserva le coordinate esatte solo se lo chiedi', () => {
    const exact = applyPrivacy(44.18337, 10.38339, 'exact')
    expect(exact.latitude).toBe(44.18337)
    expect(exact.longitude).toBe(10.38339)
  })

  it('sfoca a circa un chilometro con "area"', () => {
    const area = applyPrivacy(44.18337, 10.38339, 'area')
    expect(area.latitude).toBe(44.18)
    expect(area.longitude).toBe(10.38)
  })

  it('sfoca alla zona con "zone"', () => {
    const zone = applyPrivacy(44.18337, 10.38339, 'zone')
    expect(zone.latitude).toBe(44.2)
    expect(zone.longitude).toBe(10.4)
  })

  it('la sfocatura non è recuperabile', () => {
    // Una volta salvata l'area, le coordinate precise non esistono più da nessuna parte.
    const blurred = applyPrivacy(44.18337, 10.38339, 'area')
    const again = applyPrivacy(blurred.latitude, blurred.longitude, 'exact')
    expect(again.latitude).toBe(44.18)
    expect(again.latitude).not.toBe(44.18337)
  })

  it('senza coordinate non inventa niente', () => {
    expect(applyPrivacy(null, null, 'exact')).toEqual({ latitude: null, longitude: null })
  })
})

describe('creazione delle voci', () => {
  it('applica la riservatezza al momento del salvataggio, non della lettura', () => {
    const entry = materialise({
      ...draft(),
      latitude: 44.18337,
      longitude: 10.38339,
      privacy: 'area',
    })
    expect(entry.latitude).toBe(44.18)
  })

  it('usa "area" come riservatezza predefinita', () => {
    const entry = materialise({ ...draft(), latitude: 44.18337, longitude: 10.38339 })
    expect(entry.privacy).toBe('area')
    expect(entry.latitude).toBe(44.18)
  })

  it('genera identificativi distinti', () => {
    const a = materialise(draft())
    const b = materialise(draft())
    expect(a.id).not.toBe(b.id)
  })

  it('distingue una posizione GPS reale dal punto di ripiego della zona', () => {
    const gps = materialise({
      ...draft(),
      latitude: 44.18337,
      longitude: 10.38339,
      privacy: 'exact',
      positionSource: 'gps',
    })
    expect(gps.positionSource).toBe('gps')

    const zone = materialise({
      ...draft(),
      latitude: 44.18337,
      longitude: 10.38339,
      positionSource: 'zone',
    })
    expect(zone.positionSource).toBe('zone')
  })

  it('senza indicazione la provenienza della posizione resta null, non un valore inventato', () => {
    const entry = materialise(draft())
    expect(entry.positionSource).toBeNull()
  })

  it('registra gli alberi osservati, vuoto se non indicati', () => {
    const withTrees = materialise({ ...draft(), trees: ['faggio', 'abete'] })
    expect(withTrees.trees).toEqual(['faggio', 'abete'])

    const withoutTrees = materialise(draft())
    expect(withoutTrees.trees).toEqual([])
  })

  it('durata e numero di cercatori sono facoltativi, null se non indicati', () => {
    const entry = materialise(draft())
    expect(entry.durationMinutes).toBeNull()
    expect(entry.searchers).toBeNull()
  })

  it('registra durata e numero di cercatori quando indicati', () => {
    const entry = materialise({ ...draft(), durationMinutes: 90, searchers: 2 })
    expect(entry.durationMinutes).toBe(90)
    expect(entry.searchers).toBe(2)
  })

  it('un null esplicito cancella durata e cercatori, invece di essere letto come "non toccare"', async () => {
    // Con `??` al posto di `!== undefined` questi due campi non si potevano più svuotare una
    // volta scritti: la modifica sembrava andata a buon fine e il vecchio valore restava.
    const repo = new InMemoryDiaryRepository()
    const entry = await repo.add(draft({ durationMinutes: 120, searchers: 3 }))
    const updated = await repo.update(entry.id, { durationMinutes: null, searchers: null })
    expect(updated?.durationMinutes).toBeNull()
    expect(updated?.searchers).toBeNull()
  })

  it('una patch che non li nomina lascia i valori esistenti', async () => {
    const repo = new InMemoryDiaryRepository()
    const entry = await repo.add(draft({ durationMinutes: 120, searchers: 3 }))
    const updated = await repo.update(entry.id, { notes: 'solo una nota' })
    expect(updated?.durationMinutes).toBe(120)
    expect(updated?.searchers).toBe(3)
  })
})

describe('validazione di durata e cercatori', () => {
  it('accetta interi dentro l\'intervallo dichiarato', () => {
    expect(isValidDurationMinutes(5)).toBe(true)
    expect(isValidDurationMinutes(720)).toBe(true)
    expect(isValidDurationMinutes(90)).toBe(true)
    expect(isValidSearchers(1)).toBe(true)
    expect(isValidSearchers(20)).toBe(true)
  })

  it('rifiuta valori fuori intervallo, non interi o non finiti', () => {
    expect(isValidDurationMinutes(4)).toBe(false)
    expect(isValidDurationMinutes(721)).toBe(false)
    expect(isValidDurationMinutes(45.5)).toBe(false)
    expect(isValidDurationMinutes(Number.NaN)).toBe(false)
    expect(isValidSearchers(0)).toBe(false)
    expect(isValidSearchers(21)).toBe(false)
    expect(isValidSearchers(2.5)).toBe(false)
  })
})

describe('i tre campi congelati', () => {
  it('conserva punteggio, affidabilità e versione del modello', async () => {
    const repo = new InMemoryDiaryRepository()
    const entry = await repo.add(draft())
    expect(entry.mpiAtEntry).toBe(42)
    expect(entry.confidenceAtEntry).toBe(71)
    expect(entry.algorithmVersionAtEntry).toBe('1.0.0-porcino')
  })

  it('NON li riscrive quando modifichi la voce', async () => {
    // È la proprietà che rende il diario utile alla calibrazione: descrivono cosa il modello
    // prevedeva quel giorno, e quel giorno non torna. Se si aggiornassero, il confronto fra
    // previsto e osservato diventerebbe impossibile da ricostruire.
    const repo = new InMemoryDiaryRepository()
    const entry = await repo.add(draft())
    const updated = await repo.update(entry.id, {
      abundance: 'many',
      mpiAtEntry: 99,
      algorithmVersionAtEntry: '2.0.0',
    })
    expect(updated?.abundance).toBe('many')
    expect(updated?.mpiAtEntry).toBe(42)
    expect(updated?.algorithmVersionAtEntry).toBe('1.0.0-porcino')
  })

  it('accetta una voce senza punteggio, marcandola come non utilizzabile', async () => {
    const repo = new InMemoryDiaryRepository()
    const entry = await repo.add({ ...draft(), mpiAtEntry: null })
    expect(entry.mpiAtEntry).toBeNull()
    expect(calibrate([entry]).usable).toBe(0)
  })
})

describe('archivio', () => {
  it('elenca dalla più recente', async () => {
    const repo = new InMemoryDiaryRepository()
    await repo.add(draft({ date: '2026-09-10' }))
    await repo.add(draft({ date: '2026-09-16' }))
    await repo.add(draft({ date: '2026-09-13' }))
    const dates = (await repo.list()).map((e) => e.date)
    expect(dates).toEqual(['2026-09-16', '2026-09-13', '2026-09-10'])
  })

  it('aggiorna e cancella', async () => {
    const repo = new InMemoryDiaryRepository()
    const entry = await repo.add(draft())
    expect((await repo.update(entry.id, { notes: 'faggeta a nord' }))?.notes).toBe('faggeta a nord')
    expect(await repo.remove(entry.id)).toBe(true)
    expect(await repo.list()).toHaveLength(0)
  })

  it('non aggiorna una voce inesistente', async () => {
    const repo = new InMemoryDiaryRepository()
    expect(await repo.update('nessuno', { notes: 'x' })).toBeNull()
  })
})

describe('tombstone', () => {
  // La cancellazione deve propagarsi a un secondo dispositivo che era offline: per questo
  // `remove()` non toglie la riga, la marca. Vedi il motore di sincronizzazione in `sync/engine.ts`.
  it('remove() marca deletedAt invece di far sparire la riga', async () => {
    const repo = new InMemoryDiaryRepository()
    const entry = await repo.add(draft())
    await repo.remove(entry.id)

    const all = await repo.listAll()
    expect(all).toHaveLength(1)
    expect(all[0]?.deletedAt).not.toBeNull()
  })

  it('list() nasconde i tombstone, listAll() li mostra', async () => {
    const repo = new InMemoryDiaryRepository()
    const live = await repo.add(draft({ date: '2026-09-16' }))
    const removed = await repo.add(draft({ date: '2026-09-10' }))
    await repo.remove(removed.id)

    expect((await repo.list()).map((e) => e.id)).toEqual([live.id])
    expect((await repo.listAll()).map((e) => e.id).sort()).toEqual([live.id, removed.id].sort())
  })

  it('non si aggiorna né si ri-cancella una voce già cancellata', async () => {
    const repo = new InMemoryDiaryRepository()
    const entry = await repo.add(draft())
    await repo.remove(entry.id)

    expect(await repo.update(entry.id, { notes: 'troppo tardi' })).toBeNull()
    expect(await repo.remove(entry.id)).toBe(false)
  })

  it('purge() toglie fisicamente la riga', async () => {
    const repo = new InMemoryDiaryRepository()
    const entry = await repo.add(draft())
    await repo.remove(entry.id)
    expect(await repo.purge(entry.id)).toBe(true)
    expect(await repo.listAll()).toHaveLength(0)
  })

  it("upsertRaw() scrive una voce così com'è, senza rigenerare id o timestamp", async () => {
    const repo = new InMemoryDiaryRepository()
    const remote: DiaryEntry = {
      ...materialise(draft()),
      id: 'remote-1',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await repo.upsertRaw(remote)
    const [stored] = await repo.listAll()
    expect(stored?.id).toBe('remote-1')
    expect(stored?.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('esportazione e importazione', () => {
  it('fa il giro completo senza perdere nulla', async () => {
    const source = new InMemoryDiaryRepository()
    await source.add(draft({ date: '2026-09-16', abundance: 'many' }))
    await source.add(draft({ date: '2026-09-10', abundance: 'none' }))
    const exported = toExport(await source.list())

    const target = new InMemoryDiaryRepository()
    const result = await importInto(target, exported)

    expect(result.imported).toBe(2)
    expect(result.errors).toHaveLength(0)
    const entries = await target.list()
    expect(entries.map((e) => e.abundance)).toEqual(['many', 'none'])
    // Anche i campi congelati sopravvivono al trasferimento, altrimenti esportare
    // significherebbe perdere il valore di calibrazione.
    expect(entries[0]?.mpiAtEntry).toBe(42)
  })

  it('porta con sé posizione GPS, alberi osservati, durata e cercatori', async () => {
    const source = new InMemoryDiaryRepository()
    await source.add(
      draft({
        latitude: 44.18337,
        longitude: 10.38339,
        privacy: 'exact',
        positionSource: 'gps',
        trees: ['faggio', 'cerro'],
        durationMinutes: 120,
        searchers: 3,
      }),
    )

    const exported = toExport(await source.list())
    const target = new InMemoryDiaryRepository()
    await importInto(target, exported)
    const [imported] = await target.list()

    expect(imported?.positionSource).toBe('gps')
    expect(imported?.trees).toEqual(['faggio', 'cerro'])
    expect(imported?.durationMinutes).toBe(120)
    expect(imported?.searchers).toBe(3)
  })

  it('un vecchio export con "photoIds" si importa senza errori, senza foto', async () => {
    // Le foto sono state rimosse dall'app (erano una funzione reale, in produzione): un file
    // esportato mentre esistevano deve continuare a importarsi, ignorando quella chiave.
    const repo = new InMemoryDiaryRepository()
    const result = await importInto(repo, {
      format: 'fungicast-diary',
      version: 1,
      entries: [
        {
          id: 'con-foto',
          date: '2026-09-16',
          zoneCode: 'amiata',
          abundance: 'few',
          photoIds: ['photo-1', 'photo-2'],
        },
      ],
    })
    expect(result.imported).toBe(1)
    expect(result.errors).toHaveLength(0)
    const [entry] = await repo.list()
    expect(entry).not.toHaveProperty('photoIds')
  })

  it('sanifica i campi di un file manomesso invece di far entrare valori impossibili', async () => {
    /*
     * Il file lo sceglie chi usa l'app, non lo scrive questa app: può essere stato modificato a
     * mano o prodotto da una versione futura. Un'abbondanza inventata non dà un errore, dà
     * `ABUNDANCE_RANK[...] === undefined` e quindi `NaN` in tutto il pannello di calibrazione;
     * un `trees` che non è una lista rifà esplodere `entry.trees.length`, il crash che aveva
     * chiuso il diario in produzione.
     */
    const repo = new InMemoryDiaryRepository()
    const result = await importInto(repo, {
      format: 'fungicast-diary',
      version: 1,
      entries: [
        {
          id: 'manomessa',
          date: '2026-09-16',
          zoneCode: 'amiata',
          abundance: 'tantissimi',
          trees: 'faggio',
          elevationM: 'mille',
          notes: { testo: 'non una stringa' },
          privacy: 'pubblica',
          positionSource: 'satellite',
          mpiAtEntry: 'alto',
          confidenceAtEntry: null,
          algorithmVersionAtEntry: 7,
        },
      ],
    })

    expect(result.imported).toBe(1)
    const [entry] = await repo.list()
    expect(entry?.abundance).toBe('none')
    expect(entry?.trees).toEqual([])
    expect(entry?.elevationM).toBeNull()
    expect(entry?.notes).toBe('')
    expect(entry?.privacy).toBe('area')
    expect(entry?.positionSource).toBeNull()
    expect(entry?.mpiAtEntry).toBeNull()
    expect(entry?.algorithmVersionAtEntry).toBeNull()
  })

  it('tiene i valori buoni di una voce che ne ha anche di sbagliati', async () => {
    const repo = new InMemoryDiaryRepository()
    await importInto(repo, {
      format: 'fungicast-diary',
      version: 1,
      entries: [
        {
          id: 'mista',
          date: '2026-09-16',
          zoneCode: 'amiata',
          zoneName: 'Monte Amiata',
          abundance: 'many',
          trees: ['faggio', 'sequoia', 42],
          elevationM: 1200,
        },
      ],
    })
    const [entry] = await repo.list()
    expect(entry?.abundance).toBe('many')
    expect(entry?.zoneName).toBe('Monte Amiata')
    expect(entry?.elevationM).toBe(1200)
    // Solo le specie riconosciute sopravvivono: le altre non sono un motivo per perdere la voce.
    expect(entry?.trees).toEqual(['faggio'])
  })

  it('conserva l\'id del file, così reimportare lo stesso backup non duplica il diario', async () => {
    // Il bug che questo test chiude: `importInto` rigenerava l'id a ogni voce, quindi il
    // controllo anti-duplicato non poteva mai trovare corrispondenza e la seconda importazione
    // dello stesso file raddoppiava tutto — in silenzio, e con un account collegato anche sul
    // server, dove l'id è la chiave della sincronizzazione.
    const file = {
      format: 'fungicast-diary' as const,
      version: 1 as const,
      exportedAt: '2026-09-16T10:00:00.000Z',
      entries: [
        {
          id: 'da-un-altro-telefono',
          date: '2026-09-16',
          zoneCode: 'amiata',
          zoneName: 'Monte Amiata',
          abundance: 'few' as const,
          createdAt: '2026-09-16T08:00:00.000Z',
        },
      ],
    }
    const repo = new InMemoryDiaryRepository()

    const primo = await importInto(repo, file)
    expect(primo.imported).toBe(1)
    const [importata] = await repo.list()
    expect(importata?.id).toBe('da-un-altro-telefono')
    expect(importata?.createdAt).toBe('2026-09-16T08:00:00.000Z')

    const secondo = await importInto(repo, file)
    expect(secondo.imported).toBe(0)
    expect(secondo.skipped).toBe(1)
    expect(await repo.list()).toHaveLength(1)
  })

  it('una voce importata risulta modificata adesso, altrimenti non verrebbe mai sincronizzata', async () => {
    const repo = new InMemoryDiaryRepository()
    await importInto(repo, {
      format: 'fungicast-diary',
      version: 1,
      exportedAt: '2026-09-16T10:00:00.000Z',
      entries: [{ id: 'x', date: '2026-09-16', zoneCode: 'amiata', abundance: 'few', updatedAt: '2020-01-01T00:00:00.000Z' }],
    })
    const [entry] = await repo.list()
    expect(entry?.updatedAt.startsWith('2020')).toBe(false)
  })

  it('salta le voci già presenti invece di duplicarle', async () => {
    const repo = new InMemoryDiaryRepository()
    await repo.add(draft())
    const exported = toExport(await repo.list())
    const result = await importInto(repo, exported)
    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(1)
    expect(await repo.list()).toHaveLength(1)
  })

  it('rifiuta un file di formato sbagliato invece di indovinare', async () => {
    const repo = new InMemoryDiaryRepository()
    await expect(importInto(repo, { entries: [] })).rejects.toThrow(/formato/)
    await expect(importInto(repo, 'testo')).rejects.toThrow(/oggetto JSON/)
    await expect(importInto(repo, { format: 'fungicast-diary' })).rejects.toThrow(/elenco/)
  })

  it('una riga rotta non fa perdere le altre', async () => {
    const repo = new InMemoryDiaryRepository()
    const result = await importInto(repo, {
      format: 'fungicast-diary',
      version: 1,
      entries: [
        { id: 'a', date: '2026-09-16', zoneCode: 'amiata', abundance: 'few' },
        { id: 'b', zoneCode: 'amiata' },
      ],
    })
    expect(result.imported).toBe(1)
    expect(result.errors).toHaveLength(1)
  })
})

describe('correlazione di rango', () => {
  it('vale 1 su una relazione crescente perfetta', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 6)
  })

  it('vale -1 su una relazione invertita', () => {
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 6)
  })

  it('gestisce i pari merito col rango medio', () => {
    expect(spearman([1, 2, 2, 3], [1, 2, 2, 3])).toBeCloseTo(1, 6)
  })

  it('non si esprime senza variabilità o senza dati', () => {
    expect(spearman([1, 1, 1], [2, 3, 4])).toBeNull()
    expect(spearman([1, 2], [1, 2])).toBeNull()
  })
})

describe('calibrazione', () => {
  const entry = (mpi: number, abundance: Abundance, i: number): DiaryEntry =>
    materialise({ ...draft({ date: `2026-09-${String(i).padStart(2, '0')}` }), mpiAtEntry: mpi, abundance })

  it('con zero uscite lo dice e non calcola nulla', () => {
    const report = calibrate([])
    expect(report.usable).toBe(0)
    expect(report.hasSignal).toBe(false)
    expect(report.verdict).toMatch(/Nessuna uscita/)
  })

  it('sotto la soglia dichiara quante ne mancano, invece di fingere un giudizio', () => {
    const entries = [entry(30, 'few', 1), entry(70, 'many', 2), entry(10, 'none', 3)]
    const report = calibrate(entries)
    expect(report.hasSignal).toBe(false)
    expect(report.verdict).toContain(`almeno ${MIN_ENTRIES_FOR_SIGNAL}`)
    expect(report.verdict).toMatch(/ne mancano 9/)
  })

  it('riconosce un modello che ordina bene gli esiti', () => {
    const entries = [
      ...Array.from({ length: 4 }, (_, i) => entry(10 + i, 'none', i + 1)),
      ...Array.from({ length: 4 }, (_, i) => entry(45 + i, 'few', i + 5)),
      ...Array.from({ length: 4 }, (_, i) => entry(80 + i, 'many', i + 9)),
    ]
    const report = calibrate(entries)
    expect(report.hasSignal).toBe(true)
    expect(report.rankCorrelation).toBeGreaterThan(0.8)
    expect(report.verdict).toMatch(/incoraggiante/)
  })

  it('riconosce un modello che sbaglia sistematicamente e lo dice', () => {
    const entries = [
      ...Array.from({ length: 6 }, (_, i) => entry(85 + i, 'none', i + 1)),
      ...Array.from({ length: 6 }, (_, i) => entry(10 + i, 'many', i + 7)),
    ]
    const report = calibrate(entries)
    expect(report.rankCorrelation).toBeLessThan(-0.8)
    expect(report.verdict).toMatch(/invertita|ricalibrato/)
  })

  it('conta le uscite con contesto sufficiente (durata registrata)', () => {
    const withDuration = materialise({ ...draft({ date: '2026-09-01' }), mpiAtEntry: 30, durationMinutes: 60 })
    const withoutDuration = materialise({ ...draft({ date: '2026-09-02' }), mpiAtEntry: 40 })
    const report = calibrate([withDuration, withoutDuration])
    expect(report.usable).toBe(2)
    expect(report.contextual).toBe(1)
  })

  it('avvisa quando ci sono "niente trovato" senza durata: lo zero non si può leggere', () => {
    const empty = materialise({ ...draft({ date: '2026-09-01' }), mpiAtEntry: 30, abundance: 'none' })
    const report = calibrate([empty])
    expect(report.shortSearchCaveat).toMatch(/durata della ricerca/)
  })

  it('non avvisa se il "niente trovato" ha la durata, o se non ci sono "niente trovato"', () => {
    const emptyWithDuration = materialise({
      ...draft({ date: '2026-09-01' }),
      mpiAtEntry: 30,
      abundance: 'none',
      durationMinutes: 180,
    })
    expect(calibrate([emptyWithDuration]).shortSearchCaveat).toBeNull()

    const found = materialise({ ...draft({ date: '2026-09-01' }), mpiAtEntry: 30, abundance: 'many' })
    expect(calibrate([found]).shortSearchCaveat).toBeNull()
  })

  it('sotto la soglia minima non si esprime sulla direzione dell\'errore', () => {
    const entries = [entry(30, 'few', 1), entry(70, 'many', 2)]
    expect(calibrate(entries).biasDirection).toBeNull()
  })

  it('riconosce la sovrastima: punteggi alti, esiti quasi sempre vuoti', () => {
    const entries = Array.from({ length: 14 }, (_, i) => entry(90, 'none', i + 1))
    expect(calibrate(entries).biasDirection).toBe('sovrastima')
  })

  it('riconosce la sottostima: punteggi bassi, esiti quasi sempre positivi', () => {
    const entries = Array.from({ length: 14 }, (_, i) => entry(5, 'many', i + 1))
    expect(calibrate(entries).biasDirection).toBe('sottostima')
  })

  it('raggruppa per fascia di punteggio con il conteggio', () => {
    const report = calibrate([entry(15, 'none', 1), entry(85, 'many', 2), entry(88, 'some', 3)])
    const low = report.bands.find((b) => b.from === 0)
    const high = report.bands.find((b) => b.from === 80)
    expect(low?.count).toBe(1)
    expect(low?.successRate).toBe(0)
    expect(high?.count).toBe(2)
    expect(high?.successRate).toBe(1)
  })
})

describe('vincolo di sicurezza', () => {
  it('il diario non ha nessun concetto di commestibilità', () => {
    const entry = materialise(draft())
    const keys = Object.keys(entry).join(' ').toLowerCase()
    for (const forbidden of ['edible', 'commestib', 'safe', 'identif', 'species']) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('le etichette di abbondanza descrivono la ricerca, non il fungo', () => {
    const labels = Object.values(ABUNDANCE_LABELS).join(' ')
    expect(labels).not.toMatch(/commestib|velenos|sicur/i)
  })
})

describe('ordinamento', () => {
  it('a parità di data usa l ordine di inserimento', () => {
    const a = materialise(draft({ date: '2026-09-16' }))
    const b = { ...materialise(draft({ date: '2026-09-16' })), createdAt: '2030-01-01T00:00:00Z' }
    expect(sortEntries([a, b])[0]?.id).toBe(b.id)
  })
})

describe('voci salvate da versioni precedenti dell app', () => {
  /*
   * Il caso che ha rotto il diario in produzione. Chi aveva gia' delle uscite salvate apriva la
   * scheda e trovava la pagina bianca: le voci scritte prima degli alberi e delle foto non hanno
   * quei campi, e `entry.trees.length` sollevava "Cannot read properties of undefined". Chi il
   * diario non l'aveva mai usato non vedeva niente di strano — cioe' il bug colpiva solo chi
   * aveva qualcosa da perdere.
   */
  const vecchia = {
    id: 'voce-di-prima',
    date: '2026-09-10',
    zoneCode: 'garfagnana',
    zoneName: 'Garfagnana',
    abundance: 'some' as const,
    elevationM: null,
    notes: 'uscita registrata prima del rilascio',
    latitude: null,
    longitude: null,
    privacy: 'area' as const,
    mpiAtEntry: 20,
    confidenceAtEntry: 70,
    algorithmVersionAtEntry: '1.1.0-porcino',
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
    deletedAt: null,
  }

  it('riempie i campi che quella versione non aveva, invece di lasciarli indefiniti', () => {
    const entry = normaliseEntry(vecchia)
    expect(entry.trees).toEqual([])
    expect(entry.positionSource).toBeNull()
    expect(entry.durationMinutes).toBeNull()
    expect(entry.searchers).toBeNull()
  })

  it('una riga con un "photoIds" residuo (da quando le foto esistevano) si legge senza errori', () => {
    // Non teorico: le foto sono state in produzione (vedi PR #5) prima di essere rimosse. Chi le
    // ha usate ha righe IndexedDB reali con questa chiave, che oggi non significa più niente.
    const conFoto = { ...vecchia, id: 'voce-con-foto-vecchia', photoIds: ['photo-1'] }
    expect(() => normaliseEntry(conFoto)).not.toThrow()
    expect(normaliseEntry(conFoto)).not.toHaveProperty('photoIds')
  })

  it('non tocca quello che la voce dichiara gia', () => {
    const entry = normaliseEntry(vecchia)
    expect(entry.notes).toBe('uscita registrata prima del rilascio')
    expect(entry.abundance).toBe('some')
    expect(entry.mpiAtEntry).toBe(20)
    expect(entry.createdAt).toBe('2026-09-10T08:00:00.000Z')
  })

  it('una voce anteriore ai tombstone resta visibile invece di sparire in silenzio', () => {
    // `list()` filtra su `deletedAt === null`: con `undefined` il confronto e' falso e la voce
    // non comparirebbe piu', senza nessun errore a dirlo.
    const senzaTombstone: Omit<typeof vecchia, 'deletedAt'> & { deletedAt?: null } = { ...vecchia }
    delete senzaTombstone.deletedAt
    expect(normaliseEntry(senzaTombstone).deletedAt).toBeNull()
  })
})
