import {
  CAP_GRADIENT,
  MARK_COLORS,
  MARK_CORNER,
  MARK_MUSHROOM,
  MARK_SCENE,
  MARK_VIEWBOX,
  type MarkLayer,
} from '@/lib/brand/mark'

export interface BrandMarkProps {
  /** Lato in pixel. */
  readonly size: number
  /**
   * Con il quadrato arancio di fondo, le foglie e l'ombra a terra (le icone), o il fungo da solo
   * (il benvenuto, dove il segno sta su una scena già sua).
   */
  readonly withBackground?: boolean
  /**
   * Angoli arrotondati del fondo. Falso per le icone che il sistema ritaglia da sé — iOS e i
   * launcher Android — dove un doppio arrotondamento lascerebbe un bordo visibile.
   */
  readonly rounded?: boolean
  /** Prefisso delle id dei gradienti: diverso per ogni copia del segno nella stessa pagina. */
  readonly idPrefix?: string
}

/**
 * Un livello come elemento SVG. Una funzione e non un componente, di proposito: Satori
 * serializza l'`<svg>` così com'è e non risolve i componenti annidati, che sparirebbero dalle
 * icone e dall'anteprima di condivisione.
 */
function layerElement(layer: MarkLayer, capFill: string, key: number) {
  switch (layer.kind) {
    case 'fill':
      return (
        <path
          key={key}
          d={layer.d}
          fill={layer.fill === CAP_GRADIENT ? capFill : layer.fill}
          opacity={layer.opacity}
        />
      )
    case 'stroke':
      return (
        <path
          key={key}
          d={layer.d}
          stroke={layer.stroke}
          strokeWidth={layer.width}
          strokeLinecap="round"
          fill="none"
          opacity={layer.opacity}
        />
      )
    case 'ellipse':
      return (
        <ellipse
          key={key}
          cx={layer.cx}
          cy={layer.cy}
          rx={layer.rx}
          ry={layer.ry}
          fill={layer.fill}
          opacity={layer.opacity}
        />
      )
  }
}

/**
 * Il segno di FungiCast in JSX: un porcino d'autunno.
 *
 * Nessun hook e nessuno stato, di proposito: gira nei componenti client, in quelli server e dentro
 * `next/og`, che disegna le icone e l'anteprima di condivisione con Satori. Le forme e i colori
 * vengono da `@/lib/brand/mark`, la stessa fonte dei file statici.
 */
export function BrandMark({
  size,
  withBackground = false,
  rounded = true,
  idPrefix = 'fcm',
}: BrandMarkProps) {
  const c = MARK_COLORS
  const capFill = `url(#${idPrefix}-cap)`
  const layers = withBackground ? [...MARK_SCENE, ...MARK_MUSHROOM] : MARK_MUSHROOM
  return (
    <svg width={size} height={size} viewBox={MARK_VIEWBOX} aria-hidden="true">
      <defs>
        <linearGradient id={`${idPrefix}-cap`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.capFrom} />
          <stop offset="1" stopColor={c.capTo} />
        </linearGradient>
        {withBackground && (
          <linearGradient id={`${idPrefix}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={c.backgroundFrom} />
            <stop offset="1" stopColor={c.backgroundTo} />
          </linearGradient>
        )}
      </defs>
      {withBackground && (
        <rect width="340" height="340" rx={rounded ? MARK_CORNER : 0} fill={`url(#${idPrefix}-bg)`} />
      )}
      {layers.map((layer, i) => layerElement(layer, capFill, i))}
    </svg>
  )
}
