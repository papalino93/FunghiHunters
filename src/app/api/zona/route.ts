import { NextResponse } from 'next/server'

import { loadMapRegion, loadReferenceRegion } from '@/lib/snapshot/load-reference'

/**
 * Il dettaglio di una zona, per la scheda della mappa: `/api/zona?regione=toscana&codice=it-051023`.
 *
 * La pagina `/mappa` manda al telefono la versione leggera dello snapshot (`toListSnapshot`), la
 * stessa della home: tutti i punteggi di tutti i giorni, ma non i fattori con le fonti, le
 * stazioni, il meteo giorno per giorno e i comuni vicini. Quelli servono solo alla zona che si
 * apre, e arrivano da qui quando la si tocca. Prima la pagina della mappa della Toscana pesava
 * 3,1 MB (340 KB compressi), quasi tutti di dettagli che nessuno avrebbe aperto.
 *
 * Stessa fonte della pagina (`loadMapRegion`), quindi stessi numeri. La risposta porta la data del
 * calcolo: chi la riceve la usa solo se coincide con quella della pagina che ha aperto. Cache CDN
 * breve, perché i dati cambiano due volte al giorno; il service worker la tiene per l'uso offline.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const regione = url.searchParams.get('regione')
  const codice = url.searchParams.get('codice')
  if (codice === null || codice === '' || codice.length > 64) {
    return NextResponse.json({ error: 'Indica il codice della zona' }, { status: 400 })
  }
  try {
    let region = await loadMapRegion(regione, regione)
    let zone = region.snapshot.zones.find((z) => z.code === codice)
    // La Toscana delle sole sette zone storiche, quando il file completo non c'è: è la mappa che
    // si apre senza `?regione=`, e le sue zone vanno trovate anche da qui.
    if (zone === undefined) {
      region = await loadReferenceRegion(regione)
      zone = region.snapshot.zones.find((z) => z.code === codice)
    }
    if (zone === undefined) {
      return NextResponse.json({ error: 'Zona non trovata' }, { status: 404 })
    }
    return NextResponse.json(
      { referenceDate: region.snapshot.referenceDate, generatedAt: region.snapshot.generatedAt, zone },
      { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } },
    )
  } catch (error) {
    console.error('[api/zona]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Dettaglio non disponibile' }, { status: 502 })
  }
}
