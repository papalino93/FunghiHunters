/**
 * Il bosco dentro il punteggio.
 *
 * Fino alla versione 1.3.0 il modello sapeva soltanto meteo, quota e stagione: due zone con lo
 * stesso meteo prendevano lo stesso numero, che una fosse faggeta all'80 per cento e l'altra un
 * altopiano spoglio con il 5. Per una specie micorrizica e' il limite piu' grosso possibile,
 * perche' senza pianta ospite il porcino non e' raro: non c'e'.
 *
 * Qui il bosco misurato (ForestPaths, vedi `src/lib/sources/forest-genus.ts`) diventa un
 * moltiplicatore del punteggio, con due termini che rispondono a due domande diverse:
 *
 *   copertura — quanto bosco c'e' attorno al punto della zona
 *   ospite    — che bosco e', cioe' quanto quei generi ospitano il porcino
 *
 * **Dove il dato non sa, il punteggio non si abbassa.** Le classi "altre latifoglie" e "altre
 * conifere" tengono insieme cose molto diverse — il castagno, ottimo, e il pioppo, che non ospita
 * nulla — e questo e' un limite della mappa, non un bosco peggiore. Si paga sulla confidence.
 * Abbassare il punteggio dove la fonte e' generica vorrebbe dire dare un numero piu' basso a chi
 * ha meno dati invece che a chi ha un bosco meno adatto: due cose diverse che l'utente leggerebbe
 * come la stessa.
 *
 * Il moltiplicatore si applica **dopo** la saturazione, come le penalita' e non come i fattori
 * meteo: e' una proprieta' del posto, non del giorno. Dentro il core sarebbe stato invisibile
 * proprio dove serve di piu', cioe' fra le zone che saturano — il 21 settembre 2026 erano 230
 * su 1.202.
 */

import type { AlgorithmConfig } from '@/lib/config/algorithm'
import { AMBIGUOUS_SLUGS } from '@/lib/sources/forest-genus'

/** Quello che il modello sa del bosco di una zona. `null` quando non e' stato misurato. */
export interface ForestHabitat {
  /** Quota a bosco sui pixel classificati, 0-1. */
  readonly forestFraction: number
  /** Quota di ciascun tipo **sul bosco**, non sull'area totale. */
  readonly shares: Readonly<Record<string, number>>
}

export interface HabitatResult {
  /** Moltiplicatore applicato al punteggio. Vale 1 quando il bosco non e' misurato. */
  readonly factor: number
  /** Solo il termine di copertura. */
  readonly cover: number
  /** Solo il termine di idoneita' come ospite. */
  readonly host: number
  /**
   * Quanto il tipo di bosco e' noto, 0-1. Entra nella **confidence**, mai nel punteggio:
   * vedi il commento in testa a questo file.
   */
  readonly certainty: number
  /** `false` quando la zona non ha un bosco misurato e il termine resta neutro. */
  readonly measured: boolean
  readonly detail: string
}

/*
 * Non un `certainty: 1` fisso: non sapere se una zona ha bosco, e di che tipo, non puo' valere
 * piu' della certezza che resta a una zona misurata ma completamente ambigua (`ambiguousCertainty`
 * qui sotto) — altrimenti "non so nulla" risulterebbe piu' affidabile di "so qualcosa ma non
 * quale genere", l'esatto contrario di quello che la confidence deve dire. Stesso principio del
 * commento in testa al file: il punteggio non si tocca, ma la confidence sì.
 */
function unmeasured(config: AlgorithmConfig): HabitatResult {
  return {
    factor: 1,
    cover: 1,
    host: 1,
    certainty: config.habitat.ambiguousCertainty.value,
    measured: false,
    detail: 'bosco non misurato per questa zona',
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** I tipi con almeno questa quota finiscono nella spiegazione: sotto sono frangia. */
const NAMED_SHARE = 0.05

function describe(forest: ForestHabitat, coverReference: number): string {
  const percent = Math.round(forest.forestFraction * 100)
  const named = Object.entries(forest.shares)
    .filter(([, share]) => share >= NAMED_SHARE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([slug, share]) => `${slug} ${Math.round(share * 100)}%`)

  const cover =
    forest.forestFraction >= coverReference
      ? `bosco sul ${percent}% dell'area attorno al punto`
      : `bosco sul ${percent}% dell'area attorno al punto, sotto il ` +
        `${Math.round(coverReference * 100)}% oltre il quale non si toglie nulla`

  return named.length === 0 ? cover : `${cover}; ${named.join(', ')}`
}

/**
 * Il termine habitat per una zona.
 *
 * Con `forest` nullo il termine e' neutro e dichiarato tale: una zona senza bosco misurato non
 * deve perdere punti rispetto a una misurata, altrimenti la classifica premierebbe l'ignoranza.
 */
export function habitatSuitability(
  forest: ForestHabitat | null | undefined,
  config: AlgorithmConfig,
): HabitatResult {
  if (forest === null || forest === undefined) return unmeasured(config)
  const h = config.habitat

  const coverRaw =
    h.coverFloor.value +
    (1 - h.coverFloor.value) * clamp(forest.forestFraction / h.coverReference.value, 0, 1)
  const cover = 1 - h.coverWeight.value * (1 - coverRaw)

  let hostWeighted = 0
  let ambiguous = 0
  let total = 0
  for (const [slug, share] of Object.entries(forest.shares)) {
    if (!(share > 0)) continue
    total += share
    hostWeighted += share * (h.host[slug]?.value ?? h.hostUnknown.value)
    if (AMBIGUOUS_SLUGS.has(slug) || h.host[slug] === undefined) ambiguous += share
  }

  // Senza bosco non c'e' nessun ospite da giudicare: il termine resta neutro e il conto lo fa
  // gia' la copertura, che li' e' al minimo. Sommarli due volte sarebbe doppio conteggio.
  const hostRaw = total > 0 ? hostWeighted / total : 1
  const host = 1 - h.hostWeight.value * (1 - hostRaw)

  const certainty =
    total > 0 ? 1 - (1 - h.ambiguousCertainty.value) * clamp(ambiguous / total, 0, 1) : 1

  return {
    factor: cover * host,
    cover,
    host,
    certainty,
    measured: true,
    detail: describe(forest, h.coverReference.value),
  }
}
