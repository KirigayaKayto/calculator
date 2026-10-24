import { CalcError } from './errors'
import type { DecimalMark } from './input'

/**
 * Statistics of measured data: the summary of one list, and the least-squares line through
 * (x, y) pairs with the standard errors of its slope and intercept, as a lab report needs.
 */

/** Numbers typed or pasted: separated by spaces, new lines, semicolons, and commas unless the comma is the decimal mark. */
export function parseNumbers(text: string, decimal: DecimalMark): number[] {
  const separators = decimal === ',' ? /[\s;]+/ : /[\s;,]+/
  return text
    .trim()
    .split(separators)
    .filter(Boolean)
    .map((word) => {
      const n = Number(word.replace(',', '.').replace('−', '-'))
      if (!Number.isFinite(n)) throw new CalcError(`“${word}” is not a number`)
      return n
    })
}

/** Pairs, one per line: "x y", "x; y", "x, y" or two columns pasted from a spreadsheet. */
export function parsePairs(text: string, decimal: DecimalMark): { xs: number[]; ys: number[] } {
  const xs: number[] = []
  const ys: number[] = []
  text.split(/\n/).forEach((line, i) => {
    if (!line.trim()) return
    const nums = parseNumbers(line, decimal)
    if (nums.length !== 2) throw new CalcError(`Line ${i + 1}: write two numbers, x and y`)
    xs.push(nums[0])
    ys.push(nums[1])
  })
  return { xs, ys }
}

export interface Summary {
  n: number
  sum: number
  mean: number
  median: number
  min: number
  max: number
  q1: number
  q3: number
  /** Sample standard deviation (n − 1) and the population one (n). */
  s: number | null
  sigma: number
  /** Standard error of the mean, s/√n. */
  sem: number | null
  sumSquares: number
  modes: number[]
}

/** The p-quantile by linear interpolation between order statistics (R type 7, Excel QUARTILE.INC). */
export function quantile(sorted: number[], p: number): number {
  const h = (sorted.length - 1) * p
  const lo = Math.floor(h)
  const hi = Math.min(lo + 1, sorted.length - 1)
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}

/** Sum with compensation (Kahan–Neumaier), so long lists don't lose digits. */
function total(xs: number[]): number {
  let sum = 0
  let c = 0
  for (const x of xs) {
    const t = sum + x
    c += Math.abs(sum) >= Math.abs(x) ? sum - t + x : x - t + sum
    sum = t
  }
  return sum + c
}

export function summary(xs: number[]): Summary {
  const n = xs.length
  if (!n) throw new CalcError('No data yet')
  const sorted = [...xs].sort((a, b) => a - b)
  const sum = total(xs)
  const mean = sum / n
  // squares of deviations from the mean: steadier than Σx² − n·mean²
  const ss = total(xs.map((x) => (x - mean) ** 2))
  const counts = new Map<number, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  const most = Math.max(...counts.values())
  return {
    n,
    sum,
    mean,
    median: quantile(sorted, 0.5),
    min: sorted[0],
    max: sorted[n - 1],
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    s: n > 1 ? Math.sqrt(ss / (n - 1)) : null,
    sigma: Math.sqrt(ss / n),
    sem: n > 1 ? Math.sqrt(ss / (n - 1) / n) : null,
    sumSquares: total(xs.map((x) => x * x)),
    // a mode only when some value repeats, and not when every value repeats equally
    modes: most > 1 && counts.size > 1 && [...counts.values()].some((c) => c !== most) ? sorted.filter((x, i) => counts.get(x) === most && sorted[i - 1] !== x) : [],
  }
}

export interface LinearFit {
  n: number
  slope: number
  intercept: number
  /** Standard errors of the slope and the intercept; null below three points. */
  slopeError: number | null
  interceptError: number | null
  r: number
  r2: number
}

/** The least-squares line y = slope·x + intercept. */
export function linearFit(xs: number[], ys: number[]): LinearFit {
  const n = xs.length
  if (n !== ys.length) throw new CalcError('x and y need the same number of values')
  if (n < 2) throw new CalcError('A line needs at least two points')
  const mx = total(xs) / n
  const my = total(ys) / n
  const sxx = total(xs.map((x) => (x - mx) ** 2))
  const syy = total(ys.map((y) => (y - my) ** 2))
  const sxy = total(xs.map((x, i) => (x - mx) * (ys[i] - my)))
  if (sxx === 0) throw new CalcError('All x values are the same: the line would be vertical')
  const slope = sxy / sxx
  const intercept = my - slope * mx
  const sse = Math.max(0, syy - slope * sxy)
  const r = syy === 0 ? 1 : sxy / Math.sqrt(sxx * syy)
  let slopeError: number | null = null
  let interceptError: number | null = null
  if (n > 2) {
    const syx = Math.sqrt(sse / (n - 2))
    slopeError = syx / Math.sqrt(sxx)
    interceptError = syx * Math.sqrt(1 / n + (mx * mx) / sxx)
  }
  return { n, slope, intercept, slopeError, interceptError, r, r2: r * r }
}
