import {
  MARK_COLORS,
  MARK_CORNER,
  MARK_SHAPES,
  MARK_VIEWBOX,
} from '@/lib/brand/mark'

export interface BrandMarkProps {
  /** Lato in pixel. */
  readonly size: number
  /**
   * Con il quadrato verde di fondo (le icone) o senza (il benvenuto, dove il segno sta su una
   * scena già sua).
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
 * Il segno di FungiCast in JSX: un porcino che è anche un segnaposto.
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
  const s = MARK_SHAPES
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
      <ellipse
        cx={s.shadow.cx}
        cy={s.shadow.cy}
        rx={s.shadow.rx}
        ry={s.shadow.ry}
        fill={c.shadow}
        opacity={0.6}
      />
      <path d={s.stem} fill={c.stem} />
      <path d={s.cap} fill={`url(#${idPrefix}-cap)`} />
      <path
        d={s.highlight}
        stroke={c.highlight}
        strokeWidth={12}
        strokeLinecap="round"
        fill="none"
        opacity={0.5}
      />
    </svg>
  )
}
