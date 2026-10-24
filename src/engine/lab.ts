/**
 * Lab work: significant-figure arithmetic and measurement uncertainties.
 * Both work on the mathjs expression the LaTeX converter produced.
 */
import type { BigNumber, MathNode } from 'mathjs'
import { math, type Scope } from './math'
import { CalcError } from './errors'

/** Precision of a number: significant figures, and the position of its last significant digit. */
interface Precision {
  sf: number
  /** Exponent of the least significant digit: 2.50 → −2, 120. → 0. */
  lsd: number
}

/** Exact numbers (whole numbers, π, constants) never limit the answer. */
const EXACT: Precision = { sf: Infinity, lsd: -Infinity }

const NUMBER = /(?<![\w.])(\d+\.\d*|\.\d+|\d+)(?:e([+-]?\d+))?(?![\w.])/g

/**
 * Significant figures of a number as typed. Whole numbers count as exact (the 2 in 2πr);
 * a measured whole number is written with a point: "120." or 1.20×10².
 */
export function literalPrecision(text: string): Precision {
  const m = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(text)
  if (!m || m[2] === undefined) return EXACT
  const [, int, frac, exp = '0'] = m
  const digits = (int + frac).replace(/^0+/, '')
  const sf = Math.max(1, digits.length)
  return { sf, lsd: -frac.length + Number(exp) }
}

/** Exponent of the leading digit of a value (numbers and quantities with units). */
function magnitude(value: unknown): number | null {
  let n: unknown = value
  if (math.isUnit(n)) n = (n as unknown as { toNumeric(u: string): unknown; formatUnits(): string }).toNumeric(
    (n as unknown as { formatUnits(): string }).formatUnits(),
  )
  if (typeof n === 'number') n = math.bignumber(n)
  if (!math.isBigNumber(n) || n.isZero() || !n.isFinite()) return null
  return n.e
}

function precisionOf(node: MathNode, scope: Scope, literals: Precision[]): Precision {
  const value = node.compile().evaluate(scope)
  const mag = magnitude(value)
  const fromSf = (sf: number): Precision =>
    Number.isFinite(sf) && mag !== null ? { sf, lsd: mag - sf + 1 } : sf === Infinity ? EXACT : { sf, lsd: -Infinity }
  const fromLsd = (lsd: number): Precision =>
    Number.isFinite(lsd) && mag !== null ? { sf: Math.max(1, mag - lsd + 1), lsd } : EXACT
  const of = (n: MathNode) => precisionOf(n, scope, literals)
  const minSf = (ps: Precision[]) => fromSf(Math.min(...ps.map((p) => p.sf)))

  switch (node.type) {
    case 'SymbolNode': {
      const m = /^__n(\d+)$/.exec((node as unknown as { name: string }).name)
      return m ? literals[Number(m[1])] : EXACT
    }
    case 'ParenthesisNode':
      return of((node as unknown as { content: MathNode }).content)
    case 'OperatorNode': {
      const op = node as unknown as { fn: string; args: MathNode[] }
      const args = op.args.map(of)
      switch (op.fn) {
        case 'add':
        case 'subtract':
          // sums keep the decimal place of the least precise term
          return fromLsd(Math.max(...args.map((a) => a.lsd)))
        case 'unaryMinus':
        case 'unaryPlus':
          return args[0]
        case 'pow':
          // 10^x: as many figures as x has decimals; x^n: as many as x
          return args[0] === EXACT && args[1] !== EXACT ? fromSf(Math.max(1, -args[1].lsd)) : fromSf(args[0].sf)
        case 'to':
          return fromSf(args[0].sf)
        default:
          // products and quotients keep the fewest significant figures
          return minSf(args)
      }
    }
    case 'FunctionNode': {
      const fn = node as unknown as { fn: { name: string }; args: MathNode[] }
      const args = fn.args.map(of)
      const name = fn.fn.name
      // a logarithm has as many decimals as its argument has significant figures
      if (['log', 'lg', 'log10', 'ln', 'log2'].includes(name)) return fromLsd(-args[0].sf)
      if (name === 'exp') return fromSf(Math.max(1, -args[0].lsd))
      return minSf(args)
    }
    default:
      return EXACT
  }
}

/**
 * How many significant figures the answer has by the lab rules, or null if every number
 * in the expression is exact.
 */
export function labSignificantFigures(expr: string, scope: Scope): number | null {
  const literals: Precision[] = []
  const replaced = expr.replace(NUMBER, (text) => {
    const p = literalPrecision(text)
    if (p === EXACT) return text
    const name = `__n${literals.length}`
    literals.push(p)
    scope.set(name, math.bignumber(text))
    return name
  })
  if (!literals.length) return null
  const p = precisionOf(math.parse(replaced), scope, literals)
  return Number.isFinite(p.sf) ? Math.min(15, Math.max(1, p.sf)) : null
}

// ---- uncertainties ----

const MEASUREMENT = /(\d+\.?\d*(?:e[+-]?\d+)?)\s*±\s*(\d+\.?\d*(?:e[+-]?\d+)?)/g

export interface Uncertain {
  /** The value as computed (a number or a quantity with a unit). */
  value: unknown
  /** Value and standard uncertainty as plain numbers, in the unit of `unit`. */
  center: BigNumber
  sigma: BigNumber
  unit: string | null
}

/**
 * Evaluate an expression with measurements "2.50 ± 0.02": the uncertainties of independent
 * measurements are propagated to first order, σ² = Σ (∂f/∂xᵢ · σᵢ)².
 */
export function evaluateUncertain(expr: string, scope: Scope): Uncertain {
  const vars: { name: string; value: BigNumber; sigma: BigNumber }[] = []
  const replaced = expr.replace(MEASUREMENT, (_, a: string, b: string) => {
    const name = `__u${vars.length}`
    vars.push({ name, value: math.bignumber(a), sigma: math.bignumber(b) })
    return name
  })
  if (replaced.includes('±')) throw new CalcError('Write the uncertainty right after a number: 2.50 ± 0.02')

  const code = math.compile(replaced)
  const at = (changed?: { name: string; value: BigNumber }) => {
    for (const v of vars) scope.set(v.name, changed?.name === v.name ? changed.value : v.value)
    return code.evaluate(scope)
  }
  const value = at()
  const unit = math.isUnit(value) ? (value as unknown as { formatUnits(): string }).formatUnits() : null
  const num = (x: unknown): BigNumber =>
    unit ? math.bignumber((x as unknown as { toNumeric(u: string): BigNumber }).toNumeric(unit)) : math.bignumber(x as BigNumber)

  let variance = math.bignumber(0)
  for (const v of vars) {
    if (v.sigma.isZero()) continue
    // a tiny step: the 64-digit arithmetic keeps the difference exact enough
    const h = v.sigma.times('1e-12')
    const up = num(at({ name: v.name, value: v.value.plus(h) }))
    const down = num(at({ name: v.name, value: v.value.minus(h) }))
    const slope = up.minus(down).div(h.times(2))
    variance = variance.plus(slope.times(v.sigma).pow(2))
  }
  at()
  return { value, center: num(value), sigma: variance.sqrt(), unit }
}

/**
 * Round a measurement the usual way: the uncertainty to one significant figure (two if it
 * starts with 1), the value to the same decimal place. 7.7500 ± 0.3132 → 7.8 ± 0.3.
 */
export function roundMeasurement(center: BigNumber, sigma: BigNumber): { center: string; sigma: string } {
  if (sigma.isZero()) return { center: center.toString(), sigma: '0' }
  const lead = sigma.e
  const first = sigma.div(math.bignumber(10).pow(lead)).floor().toNumber()
  const lsd = lead - (first === 1 ? 1 : 0)
  const step = math.bignumber(10).pow(lsd)
  const round = (x: BigNumber) => x.div(step).toDecimalPlaces(0).times(step)
  const places = Math.max(0, -lsd)
  return { center: round(center).toFixed(places), sigma: round(sigma).toFixed(places) }
}
