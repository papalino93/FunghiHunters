import OpengraphImage from './opengraph-image'

// La stessa anteprima dell'Open Graph (vedi `opengraph-image.tsx` qui accanto). Le costanti sono
// ripetute e non riesportate: Next le legge in modo statico da questo file.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Porcini oggi nella regione, secondo FungiCast'

export default function TwitterImage(props: { params: Promise<{ regione: string }> }) {
  return OpengraphImage(props)
}
