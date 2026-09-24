import { ImageResponse } from 'next/og'

import { loadItaliaIndex } from '@/lib/snapshot/load-italia'

/**
 * L'anteprima del link di una regione: quella che compare quando lo si manda a qualcuno.
 *
 * Prima ogni pagina aveva la stessa immagine generica. Il link inviato in privato è il modo in cui
 * un'app come questa si fa conoscere senza feed né condivisioni pubbliche, e l'anteprima deve dire
 * subito di cosa parla: la regione, la zona migliore di oggi con il suo punteggio, la data, e che
 * è una stima del solo modello. Dati dall'indice nazionale leggero, calcolato ogni giorno.
 */
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Porcini oggi nella regione, secondo FungiCast'

const BAND_COLOURS = ['#3b3d33', '#6e6c45', '#8fa45a', '#7dc377', '#bde88f'] as const
const BAND_NAMES = ['sfavorevoli', 'poco favorevoli', 'discrete', 'favorevoli', 'molto favorevoli'] as const

function band(mpi: number): number {
  return Math.min(4, Math.max(0, Math.floor(mpi / 20)))
}

export default async function Image({ params }: { params: Promise<{ regione: string }> }) {
  const { regione } = await params
  const index = await loadItaliaIndex()
  const region = index.regions.find((r) => r.slug === regione)
  const name = (region?.name ?? 'Italia').split('/')[0] ?? 'Italia'
  const best = index.zones
    .filter((z) => z.regionSlug === regione)
    .sort((a, b) => b.mpi - a.mpi)[0]
  const [y, m, d] = index.referenceDate.split('-')
  const date = y !== undefined && m !== undefined && d !== undefined ? `${d}/${m}/${y}` : ''

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0f130f',
          padding: '72px 88px',
          color: '#eceff4',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 34, color: '#98a18e' }}>FungiCast · {date}</div>
          <div style={{ display: 'flex', marginTop: 16, fontSize: 76, fontWeight: 700 }}>
            Porcini in {name} oggi
          </div>
        </div>

        {best !== undefined ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 190,
                height: 190,
                borderRadius: 32,
                fontSize: 96,
                fontWeight: 700,
                background: BAND_COLOURS[band(best.mpi)],
                color: band(best.mpi) >= 2 ? '#0f130f' : '#eceff4',
              }}
            >
              {Math.round(best.mpi)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 48 }}>
              <div style={{ display: 'flex', fontSize: 30, color: '#98a18e' }}>La zona migliore oggi</div>
              <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, marginTop: 6 }}>{best.name}</div>
              <div style={{ display: 'flex', fontSize: 34, color: '#bac2b0', marginTop: 6 }}>
                condizioni {BAND_NAMES[band(best.mpi)]} · su 100
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', fontSize: 40, color: '#bac2b0' }}>Condizioni zona per zona</div>
        )}

        <div style={{ display: 'flex', fontSize: 28, color: '#a4b5d1' }}>
          Anteprima · stima da modello, non verificata da stazioni · modello {index.algorithmVersion}
        </div>
      </div>
    ),
    { ...size },
  )
}
