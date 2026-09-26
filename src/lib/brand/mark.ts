/**
 * Il segno di FungiCast: un porcino d'autunno.
 *
 * Un porcino vero, tozzo: cappello largo e scuro color castagna, il bordo chiaro dei pori sotto,
 * gambo panciuto color crema che si allarga verso terra. Attorno, due foglie cadute e l'ombra sul
 * terreno, su un fondo arancio d'autunno — la stagione in cui l'app serve. Scelto il 26/09/2026
 * al posto del porcino-segnaposto, che «non sembrava né un fungo né un segnaposto».
 *
 * ## Una fonte sola
 *
 * Il disegno era copiato a mano in sei file — le tre icone, l'anteprima di condivisione, il
 * benvenuto, la versione «maskable» — e ogni ritocco rischiava di lasciarne uno indietro. Ora
 * tutto deriva da qui: i componenti lo importano, e i file statici in `public/` più
 * `src/app/favicon.ico` li scrive `scripts/build-brand-assets.ts` a partire da queste costanti.
 *
 * Tutte le coordinate sono nel riquadro `0 0 340 340`: qualunque file che usava un segno
 * precedente usa questo senza cambiare dimensioni.
 */

export const MARK_VIEWBOX = '0 0 340 340'
/** Raggio degli angoli del quadrato, nello stesso riquadro. */
export const MARK_CORNER = 74

export const MARK_COLORS = {
  /** Arancio d'autunno, scurito in diagonale verso il basso. */
  backgroundFrom: '#e0983f',
  backgroundTo: '#b85f24',
  /** Il cappello, castagna scura: è il colore che fa dire «porcino» e non «fungo qualsiasi». */
  capFrom: '#5a2c12',
  capTo: '#3a1b0a',
  highlight: '#8a4a24',
  /** Il bordo dei pori sotto il cappello, giallo paglia come nel porcino maturo. */
  pores: '#e8cf7c',
  stem: '#f6e7c6',
  stemShade: '#e2c996',
  leafLeft: '#8a3d15',
  leafRight: '#9c4a1c',
  leafVein: '#b85f24',
  ground: '#7a3510',
} as const

/** Un livello del disegno: un tracciato pieno, uno a tratto o un'ellisse. */
export type MarkLayer =
  | { readonly kind: 'fill'; readonly d: string; readonly fill: string; readonly opacity?: number }
  | {
      readonly kind: 'stroke'
      readonly d: string
      readonly stroke: string
      readonly width: number
      readonly opacity?: number
    }
  | {
      readonly kind: 'ellipse'
      readonly cx: number
      readonly cy: number
      readonly rx: number
      readonly ry: number
      readonly fill: string
      readonly opacity?: number
    }

/** Segnaposto per il gradiente del cappello: ogni disegno lo sostituisce con la sua id. */
export const CAP_GRADIENT = 'cap-gradient'

/**
 * La scena attorno al fungo — foglie e ombra a terra. Sta sul quadrato arancio delle icone; il
 * benvenuto, che ha già il suo bosco, disegna solo il fungo.
 */
export const MARK_SCENE: readonly MarkLayer[] = [
  { kind: 'fill', d: 'M60 300 C80 262 122 250 146 266 C124 284 94 300 60 300 Z', fill: MARK_COLORS.leafLeft, opacity: 0.85 },
  { kind: 'stroke', d: 'M62 299 L140 268', stroke: MARK_COLORS.leafVein, width: 3 },
  { kind: 'fill', d: 'M284 296 C262 258 218 250 196 268 C220 284 250 298 284 296 Z', fill: MARK_COLORS.leafRight, opacity: 0.85 },
  { kind: 'ellipse', cx: 170, cy: 308, rx: 74, ry: 9, fill: MARK_COLORS.ground, opacity: 0.45 },
]

/** Il fungo, dal basso verso l'alto: gambo, sua ombra, pori, cappello, riflesso sul cappello. */
export const MARK_MUSHROOM: readonly MarkLayer[] = [
  {
    kind: 'fill',
    d: 'M134 204 C130 226 112 242 112 266 C112 295 138 308 170 308 C202 308 228 295 228 266 C228 242 210 226 206 204 Z',
    fill: MARK_COLORS.stem,
  },
  {
    kind: 'fill',
    d: 'M206 204 C210 226 228 242 228 266 C228 295 202 308 170 308 C198 296 210 278 208 254 C206 234 202 220 206 204 Z',
    fill: MARK_COLORS.stemShade,
  },
  { kind: 'fill', d: 'M74 192 L266 192 C262 204 252 211 240 211 L100 211 C88 211 78 204 74 192 Z', fill: MARK_COLORS.pores },
  {
    kind: 'fill',
    d: 'M54 180 C54 112 106 72 170 72 C234 72 286 112 286 180 C286 190 278 196 266 196 L74 196 C62 196 54 190 54 180 Z',
    fill: CAP_GRADIENT,
  },
  { kind: 'stroke', d: 'M94 140 C108 104 138 84 170 84 C198 84 222 96 238 116', stroke: MARK_COLORS.highlight, width: 11, opacity: 0.8 },
]

/** Sfondo del quadrato come gradiente CSS, per chi lo disegna con un `<div>` (Satori, `next/og`). */
export const MARK_BACKGROUND_CSS = `linear-gradient(135deg, ${MARK_COLORS.backgroundFrom}, ${MARK_COLORS.backgroundTo})`

function layerSvg(layer: MarkLayer, capFill: string): string {
  const opacity = layer.opacity === undefined ? '' : ` opacity="${String(layer.opacity)}"`
  switch (layer.kind) {
    case 'fill':
      return `<path d="${layer.d}" fill="${layer.fill === CAP_GRADIENT ? capFill : layer.fill}"${opacity}/>`
    case 'stroke':
      return `<path d="${layer.d}" stroke="${layer.stroke}" stroke-width="${String(layer.width)}" stroke-linecap="round" fill="none"${opacity}/>`
    case 'ellipse':
      return `<ellipse cx="${String(layer.cx)}" cy="${String(layer.cy)}" rx="${String(layer.rx)}" ry="${String(layer.ry)}" fill="${layer.fill}"${opacity}/>`
  }
}

/**
 * Il segno come frammento SVG — solo le forme, senza il quadrato di fondo.
 *
 * Una stringa e non JSX: serve a chi non gira dentro React, cioè allo script che scrive i file
 * statici. I componenti usano `BrandMark`, che disegna gli stessi livelli.
 * `idPrefix` tiene uniche le id del gradiente se il segno compare due volte nella stessa pagina.
 */
export function markShapesSvg(idPrefix = 'fcm', withScene = true): string {
  const c = MARK_COLORS
  const capFill = `url(#${idPrefix}-cap)`
  const layers = withScene ? [...MARK_SCENE, ...MARK_MUSHROOM] : MARK_MUSHROOM
  return [
    `<defs><linearGradient id="${idPrefix}-cap" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${c.capFrom}"/><stop offset="1" stop-color="${c.capTo}"/>`,
    `</linearGradient></defs>`,
    ...layers.map((layer) => layerSvg(layer, capFill)),
  ].join('')
}

/** Il quadrato di fondo col suo gradiente, come frammento SVG. */
export function markBackgroundSvg(idPrefix = 'fcm', rounded = true): string {
  const c = MARK_COLORS
  return [
    `<defs><linearGradient id="${idPrefix}-bg" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="${c.backgroundFrom}"/><stop offset="1" stop-color="${c.backgroundTo}"/>`,
    `</linearGradient></defs>`,
    `<rect width="340" height="340"${rounded ? ` rx="${String(MARK_CORNER)}"` : ''} fill="url(#${idPrefix}-bg)"/>`,
  ].join('')
}
