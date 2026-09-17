/**
 * Regressione lineare pesata, con regolarizzazione.
 *
 * Serve a stimare il **trend deterministico** di una grandezza sul territorio prima di
 * interpolare: la temperatura dipende in primo luogo dalla quota, e stimare quel gradiente dai
 * dati del giorno e' molto meglio che assumere i canonici -6.5 gradi per chilometro. In
 * inversione termica il gradiente puo' anche cambiare segno, e una costante lo sbaglierebbe
 * proprio nelle notti serene che contano per la gelata.
 *
 * Non serve una libreria: i predittori sono tre o quattro e la matrice normale e' minuscola.
 */

export interface Sample {
  /** Predittori, senza l'intercetta: viene aggiunta dal solutore. */
  readonly x: readonly number[]
  readonly y: number
  /** Peso del campione. Assente significa 1. */
  readonly weight?: number
}

export interface LinearModel {
  /** Coefficienti, con l'intercetta in posizione 0. */
  readonly coefficients: readonly number[]
  readonly n: number
  /** Coefficiente di determinazione, 0-1. */
  readonly r2: number
  /** Errore medio assoluto sui campioni di stima. */
  readonly mae: number
}

/**
 * Risolve un sistema lineare con eliminazione di Gauss e pivot parziale.
 * Restituisce `null` quando la matrice e' singolare, invece di propagare NaN.
 */
export function solveLinearSystem(
  matrix: readonly (readonly number[])[],
  rhs: readonly number[],
): number[] | null {
  const n = rhs.length
  const a = matrix.map((row, i) => [...row, rhs[i] ?? 0])

  for (let col = 0; col < n; col += 1) {
    // Pivot parziale: senza, una colonna quasi nulla fa esplodere l'errore numerico.
    let pivot = col
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row]?.[col] ?? 0) > Math.abs(a[pivot]?.[col] ?? 0)) pivot = row
    }
    if (Math.abs(a[pivot]?.[col] ?? 0) < 1e-12) return null
    if (pivot !== col) {
      const tmp = a[col]
      const swapped = a[pivot]
      if (tmp === undefined || swapped === undefined) return null
      a[col] = swapped
      a[pivot] = tmp
    }

    const pivotRow = a[col]
    if (pivotRow === undefined) return null
    const pivotValue = pivotRow[col] ?? 0

    for (let row = col + 1; row < n; row += 1) {
      const currentRow = a[row]
      if (currentRow === undefined) continue
      const factor = (currentRow[col] ?? 0) / pivotValue
      if (factor === 0) continue
      for (let k = col; k <= n; k += 1) {
        currentRow[k] = (currentRow[k] ?? 0) - factor * (pivotRow[k] ?? 0)
      }
    }
  }

  const solution = new Array<number>(n).fill(0)
  for (let row = n - 1; row >= 0; row -= 1) {
    const currentRow = a[row]
    if (currentRow === undefined) return null
    let sum = currentRow[n] ?? 0
    for (let col = row + 1; col < n; col += 1) {
      sum -= (currentRow[col] ?? 0) * (solution[col] ?? 0)
    }
    const diagonal = currentRow[row] ?? 0
    if (Math.abs(diagonal) < 1e-12) return null
    solution[row] = sum / diagonal
  }
  return solution
}

/**
 * Minimi quadrati pesati con regolarizzazione di Tikhonov.
 *
 * La regolarizzazione non e' cosmetica: quando tutte le stazioni disponibili stanno alla stessa
 * quota, la colonna della quota e' costante e il sistema e' singolare. Senza il termine di
 * ridge si otterrebbero coefficienti enormi e senza senso invece di un trend piatto.
 */
export function fitLinear(
  samples: readonly Sample[],
  ridge = 1e-6,
): LinearModel | null {
  if (samples.length === 0) return null
  const predictorCount = samples[0]?.x.length ?? 0
  const size = predictorCount + 1
  if (samples.length < size) return null

  const xtx: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0))
  const xty: number[] = new Array<number>(size).fill(0)

  for (const sample of samples) {
    const weight = sample.weight ?? 1
    const row = [1, ...sample.x]
    for (let i = 0; i < size; i += 1) {
      const rowI = xtx[i]
      if (rowI === undefined) continue
      for (let j = 0; j < size; j += 1) {
        rowI[j] = (rowI[j] ?? 0) + weight * (row[i] ?? 0) * (row[j] ?? 0)
      }
      xty[i] = (xty[i] ?? 0) + weight * (row[i] ?? 0) * sample.y
    }
  }

  // L'intercetta non si regolarizza: penalizzarla sposterebbe il livello medio della stima.
  for (let i = 1; i < size; i += 1) {
    const rowI = xtx[i]
    if (rowI !== undefined) rowI[i] = (rowI[i] ?? 0) + ridge
  }

  const coefficients = solveLinearSystem(xtx, xty)
  if (coefficients === null) return null

  let sumSquaredError = 0
  let sumAbsError = 0
  let totalWeight = 0
  let weightedMean = 0
  for (const sample of samples) {
    const weight = sample.weight ?? 1
    weightedMean += weight * sample.y
    totalWeight += weight
  }
  weightedMean /= totalWeight === 0 ? 1 : totalWeight

  let totalVariance = 0
  for (const sample of samples) {
    const weight = sample.weight ?? 1
    const predicted = predictLinear({ coefficients, n: samples.length, r2: 0, mae: 0 }, sample.x)
    const error = sample.y - predicted
    sumSquaredError += weight * error * error
    sumAbsError += weight * Math.abs(error)
    totalVariance += weight * (sample.y - weightedMean) ** 2
  }

  return {
    coefficients,
    n: samples.length,
    r2: totalVariance === 0 ? 0 : Math.max(0, 1 - sumSquaredError / totalVariance),
    mae: totalWeight === 0 ? 0 : sumAbsError / totalWeight,
  }
}

export function predictLinear(model: LinearModel, x: readonly number[]): number {
  let sum = model.coefficients[0] ?? 0
  for (const [i, value] of x.entries()) {
    sum += (model.coefficients[i + 1] ?? 0) * value
  }
  return sum
}
