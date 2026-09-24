import { weatherCodeIcon, weatherCodeLabel } from '@/lib/ui/weatherCode'

/*
 * Icone del tempo in SVG in linea, a tratto, colorate con `currentColor` più un accento per sole,
 * pioggia e neve: si leggono in chiaro e in scuro senza file esterni, e offline ci sono sempre.
 * Decorative (`aria-hidden`): la parola accanto dice la stessa cosa a chi non le vede.
 */
const SUN = 'text-amber-500'
const WATER = 'text-sky-500'

function Cloud({ y = 0 }: { y?: number }) {
  return (
    <path
      d={`M7 ${String(18 + y)}h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 ${String(9.4 + y)} 4.3 4.3 0 0 0 7 ${String(18 + y)}Z`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  )
}

export function WeatherIcon({ code, size = 18 }: { code: number | null; size?: number }) {
  const kind = weatherCodeIcon(code)
  if (kind === null) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-ink-dim">
      {kind === 'sole' && (
        <g className={SUN} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none">
          <circle cx="12" cy="12" r="4.2" fill="currentColor" fillOpacity="0.25" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1="12" y1="2.8" x2="12" y2="5.2" transform={`rotate(${String(a)} 12 12)`} />
          ))}
        </g>
      )}
      {kind === 'poco-nuvoloso' && (
        <>
          <g className={SUN} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none">
            <circle cx="9" cy="8.5" r="3.2" fill="currentColor" fillOpacity="0.25" />
            <line x1="9" y1="2.6" x2="9" y2="3.8" />
            <line x1="3.1" y1="8.5" x2="4.3" y2="8.5" />
            <line x1="4.8" y1="4.3" x2="5.7" y2="5.2" />
            <line x1="13.2" y1="4.3" x2="12.3" y2="5.2" />
          </g>
          <Cloud y={1.5} />
        </>
      )}
      {kind === 'coperto' && (
        <>
          <path d="M9 12.5a4.5 4.5 0 0 1 8.2-2.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
          <Cloud y={1} />
        </>
      )}
      {kind === 'nebbia' && (
        <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="3" y1="13" x2="18" y2="13" />
          <line x1="6" y1="17" x2="21" y2="17" />
        </g>
      )}
      {(kind === 'pioggerella' || kind === 'pioggia' || kind === 'temporale' || kind === 'neve') && <Cloud y={-3} />}
      {kind === 'pioggerella' && (
        <g className={WATER} fill="currentColor">
          <circle cx="9" cy="19" r="1" />
          <circle cx="13" cy="20.5" r="1" />
          <circle cx="16.5" cy="18.5" r="1" />
        </g>
      )}
      {kind === 'pioggia' && (
        <g className={WATER} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="9" y1="18" x2="8" y2="21.5" />
          <line x1="13" y1="18" x2="12" y2="21.5" />
          <line x1="17" y1="18" x2="16" y2="21.5" />
        </g>
      )}
      {kind === 'temporale' && (
        <path d="M13 16.5l-3 4h3l-1.5 3.5 4.5-5h-3l1.5-2.5Z" className={SUN} fill="currentColor" />
      )}
      {kind === 'neve' && (
        <g className={WATER} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {[9, 15].map((x) => (
            <g key={x}>
              <line x1={x} y1="17.5" x2={x} y2="22" />
              <line x1={x - 2} y1="18.6" x2={x + 2} y2="20.9" />
              <line x1={x - 2} y1="20.9" x2={x + 2} y2="18.6" />
            </g>
          ))}
        </g>
      )}
    </svg>
  )
}

/** Icona e parola insieme, per le celle delle tabelle. */
export function WeatherBadge({ code }: { code: number | null }) {
  const label = weatherCodeLabel(code)
  if (label === null) return <span className="text-ink-faint">—</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <WeatherIcon code={code} />
      <span>{label}</span>
    </span>
  )
}
