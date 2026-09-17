/**
 * Griglia di celle geografiche, pilota per la granularità oltre le sette macro-zone.
 *
 * **Cosa fa e cosa non fa, dichiarato qui perché è la cosa più facile da fraintendere.** Genera
 * geometria reale (celle quadrate, centroidi, comune/provincia verificati sui confini ISTAT) ma
 * **non stima il potenziale di nessuna cella**: mancano maschera forestale e DTM, entrambi
 * bloccati in questa sessione (vedi `docs/CATALOGO-FONTI.md`). Una cella senza quei dati è
 * `not-evaluable`, non "favorevole" né "sfavorevole" — è la regola esplicitamente richiesta:
 * "le celle senza dati o senza copertura forestale sufficiente devono risultare non valutabili,
 * non favorevoli". Con zero copertura forestale reale disponibile, **tutte** le celle generate
 * oggi sono `not-evaluable`, ed è il risultato corretto, non un difetto da nascondere.
 *
 * Non e' collegata alla mappa: e' il motore, testato da solo. Collegarla alla UI e' lavoro
 * separato, che ha senso solo dopo aver ingerito almeno la maschera forestale.
 */

/** Approssimazione locale, non geodetica: sufficiente per celle di 1 km su un'estensione di zona. */
const KM_PER_DEGREE_LAT = 111.32

function kmPerDegreeLon(latitudeDeg: number): number {
  return KM_PER_DEGREE_LAT * Math.cos((latitudeDeg * Math.PI) / 180)
}

export interface GridCell {
  readonly id: string
  readonly resolutionM: number
  readonly centroidLat: number
  readonly centroidLon: number
  /** Angolo (sud-ovest, nord-est) della cella quadrata, in gradi. */
  readonly bounds: { readonly south: number; readonly west: number; readonly north: number; readonly east: number }
  readonly zoneCode: string

  // Dati territoriali: null finché la fonte reale non è ingerita. Vedi il commento in testa.
  readonly elevationM: number | null
  readonly slopeDeg: number | null
  readonly aspectDeg: number | null
  readonly forestFraction: number | null
  readonly adminMunicipality: string | null
  readonly adminProvince: string | null
}

export interface GenerateGridOptions {
  readonly zoneCode: string
  readonly centerLat: number
  readonly centerLon: number
  /** Raggio della griglia attorno al centro. */
  readonly radiusKm: number
  readonly resolutionM: number
}

/**
 * Genera una griglia quadrata attorno a un centro. Deterministica: stessi argomenti, stesse celle,
 * stessi id — necessario per poter fare il join con dati territoriali ingeriti in un secondo
 * momento senza rigenerare tutto.
 */
export function generateGrid(options: GenerateGridOptions): GridCell[] {
  const { zoneCode, centerLat, centerLon, radiusKm, resolutionM } = options
  if (radiusKm <= 0 || resolutionM <= 0) return []

  const stepKm = resolutionM / 1000
  const stepsPerSide = Math.max(1, Math.floor(radiusKm / stepKm))
  const kmPerLon = kmPerDegreeLon(centerLat)

  const cells: GridCell[] = []
  for (let row = -stepsPerSide; row <= stepsPerSide; row++) {
    for (let col = -stepsPerSide; col <= stepsPerSide; col++) {
      const centroidLat = centerLat + (row * stepKm) / KM_PER_DEGREE_LAT
      const centroidLon = centerLon + (col * stepKm) / kmPerLon
      // Griglia quadrata, non un cerchio ritagliato a scalini: il raggio filtra per distanza
      // reale dal centro, non per riga/colonna, cosi' il bordo e' un cerchio vero.
      const distanceKm = Math.hypot(row * stepKm, col * stepKm)
      if (distanceKm > radiusKm) continue

      const halfStepLat = stepKm / 2 / KM_PER_DEGREE_LAT
      const halfStepLon = stepKm / 2 / kmPerLon

      cells.push({
        id: `${zoneCode}-${resolutionM}-${row}-${col}`,
        resolutionM,
        centroidLat,
        centroidLon,
        bounds: {
          south: centroidLat - halfStepLat,
          north: centroidLat + halfStepLat,
          west: centroidLon - halfStepLon,
          east: centroidLon + halfStepLon,
        },
        zoneCode,
        elevationM: null,
        slopeDeg: null,
        aspectDeg: null,
        forestFraction: null,
        adminMunicipality: null,
        adminProvince: null,
      })
    }
  }
  return cells
}

export type Evaluability = 'evaluable' | 'not-evaluable'

export interface EvaluabilityAssessment {
  readonly status: Evaluability
  /** Perché, in frasi pronte per l'utente — non chiavi tecniche. */
  readonly reasons: readonly string[]
}

/**
 * Una cella è valutabile solo se ha abbastanza dati territoriali reali per stimare qualcosa.
 * La soglia (`MIN_FOREST_FRACTION`) non è arbitraria quanto potrebbe sembrare: sotto il 10% di
 * copertura forestale un ettaro è quasi certamente campo o urbanizzato, dove il porcino non
 * fruttifica per definizione di habitat — non serve un modello per dirlo, serve escludere la
 * cella, non calcolare un punteggio basso.
 */
const MIN_FOREST_FRACTION = 0.1

export function assessEvaluability(cell: GridCell): EvaluabilityAssessment {
  const reasons: string[] = []
  if (cell.forestFraction === null) {
    reasons.push('copertura forestale non disponibile per questa cella')
  } else if (cell.forestFraction < MIN_FOREST_FRACTION) {
    reasons.push(
      `copertura forestale insufficiente (${Math.round(cell.forestFraction * 100)}%, sotto ${Math.round(MIN_FOREST_FRACTION * 100)}%)`,
    )
  }
  if (cell.elevationM === null) reasons.push('quota non disponibile per questa cella')

  return reasons.length === 0 ? { status: 'evaluable', reasons: [] } : { status: 'not-evaluable', reasons }
}
