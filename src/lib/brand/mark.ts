/**
 * Il segno di FungiCast: un porcino che è anche un segnaposto.
 *
 * Il cappello è la testa del segnaposto, il gambo si stringe fino alla punta che tocca il punto
 * sulla mappa. Dice in un'immagine la domanda della home, «Dove vado oggi», e regge a 16 pixel
 * perché la sagoma a goccia di un segnaposto è una delle forme più riconoscibili che esistano.
 *
 * ## Una fonte sola
 *
 * Il disegno precedente era copiato a mano in sei file — le tre icone, l'anteprima di
 * condivisione, il benvenuto, la versione «maskable» — e ogni ritocco rischiava di lasciarne uno
 * indietro. Ora tutto deriva da qui: i componenti lo importano, e i file statici in `public/` più
 * `src/app/favicon.ico` li scrive `scripts/build-brand-assets.ts` a partire da queste costanti.
 *
 * Tutte le coordinate sono nel riquadro `0 0 340 340`, lo stesso di prima: qualunque file che
 * usava il vecchio segno usa il nuovo senza cambiare dimensioni.
 */

export const MARK_VIEWBOX = '0 0 340 340'
/** Raggio degli angoli del quadrato, nello stesso riquadro. */
export const MARK_CORNER = 74

export const MARK_COLORS = {
  /** Il verde menta dell'app, scurito verso il basso: lo stesso di `--accent` in chiaro. */
  backgroundFrom: '#119070',
  backgroundTo: '#0a5a43',
  capFrom: '#a0602e',
  capTo: '#6a3719',
  /** Il gambo, color crema come quello di un porcino vero. */
  stem: '#f5edd6',
  highlight: '#c7874d',
  shadow: '#063a2b',
} as const

export const MARK_SHAPES = {
  /** L'ombra a terra: è ciò che fa leggere la sagoma come un segnaposto piantato in un punto. */
  shadow: { cx: 170, cy: 302, rx: 38, ry: 9 },
  /** Il gambo che si stringe fino alla punta. Largo in alto perché a 16 px non sparisca. */
  stem: 'M120 176 L220 176 L186 288 Q170 312 154 288 Z',
  cap: 'M60 176 C60 104 110 52 170 52 C230 52 280 104 280 176 C280 188 271 194 258 194 L82 194 C69 194 60 188 60 176 Z',
  highlight: 'M100 140 C114 100 142 80 170 80',
} as const

/** Sfondo del quadrato come gradiente CSS, per chi lo disegna con un `<div>` (Satori, `next/og`). */
export const MARK_BACKGROUND_CSS = `linear-gradient(135deg, ${MARK_COLORS.backgroundFrom}, ${MARK_COLORS.backgroundTo})`

/**
 * Il segno come frammento SVG — solo le forme, senza il quadrato di fondo.
 *
 * Una stringa e non JSX: serve a chi non gira dentro React, cioè allo script che scrive i file
 * statici. I componenti usano `BrandMark`, che disegna le stesse forme con gli stessi valori.
 * `idPrefix` tiene uniche le id del gradiente se il segno compare due volte nella stessa pagina.
 */
export function markShapesSvg(idPrefix = 'fcm'): string {
  const c = MARK_COLORS
  const s = MARK_SHAPES
  return [
    `<defs><linearGradient id="${idPrefix}-cap" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${c.capFrom}"/><stop offset="1" stop-color="${c.capTo}"/>`,
    `</linearGradient></defs>`,
    `<ellipse cx="${s.shadow.cx}" cy="${s.shadow.cy}" rx="${s.shadow.rx}" ry="${s.shadow.ry}" fill="${c.shadow}" opacity="0.6"/>`,
    `<path d="${s.stem}" fill="${c.stem}"/>`,
    `<path d="${s.cap}" fill="url(#${idPrefix}-cap)"/>`,
    `<path d="${s.highlight}" stroke="${c.highlight}" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.5"/>`,
  ].join('')
}

/** Il quadrato di fondo col suo gradiente, come frammento SVG. */
export function markBackgroundSvg(idPrefix = 'fcm', rounded = true): string {
  const c = MARK_COLORS
  return [
    `<defs><linearGradient id="${idPrefix}-bg" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="${c.backgroundFrom}"/><stop offset="1" stop-color="${c.backgroundTo}"/>`,
    `</linearGradient></defs>`,
    `<rect width="340" height="340"${rounded ? ` rx="${MARK_CORNER}"` : ''} fill="url(#${idPrefix}-bg)"/>`,
  ].join('')
}
