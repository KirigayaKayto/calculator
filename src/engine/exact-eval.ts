/**
 * The exact value of a mathjs expression tree, worked out alongside the numeric answer:
 * sqrt(20) is 2√5, sin(60) in degrees is √3/2. Anything the exact arithmetic cannot
 * express (ln 2, a unit, a matrix) gives null, and the calculator shows the decimal.
 */
import type { BigNumber, MathNode } from 'mathjs'
import { math, type Scope, type Angle } from './math'
import {
  ZERO,
  ONE,
  PI,
  E,
  fromInt,
  fromRational,
  fromDecimal,
  fromBigNumber,
  add,
  sub,
  mul,
  div,
  neg,
  pow,
  root,
  abs,
  sign,
  integerPart,
  factorial,
  logBase,
  asRational,
  key,
  rat,
  agreesWith,
  type Exact,
} from './exact'

export interface ExactContext {
  angle: Angle
  scope: Scope
}

interface OperatorLike {
  fn: string
  args: MathNode[]
  implicit?: boolean
}

interface FunctionLike {
  fn: { name: string }
  args: MathNode[]
}

/** The exact value of the tree, or null. Never throws. */
export function exactOf(node: MathNode, ctx: ExactContext): Exact | null {
  try {
    return walk(node, ctx)
  } catch {
    return null
  }
}

/** The exact value only if it agrees with the number the numeric engine computed. */
export function checkedExact(node: MathNode, ctx: ExactContext, value: BigNumber): Exact | null {
  const e = exactOf(node, ctx)
  return e && agreesWith(e, value) ? e : null
}

function walk(node: MathNode, ctx: ExactContext): Exact | null {
  switch (node.type) {
    case 'ConstantNode':
      return constant((node as unknown as { value: unknown }).value)
    case 'SymbolNode':
      return symbolValue((node as unknown as { name: string }).name, ctx)
    case 'ParenthesisNode':
      return walk((node as unknown as { content: MathNode }).content, ctx)
    case 'OperatorNode':
      return operator(node as unknown as OperatorLike, ctx)
    case 'FunctionNode':
      return call(node as unknown as FunctionLike, ctx)
    default:
      return null
  }
}

function constant(value: unknown): Exact | null {
  if (math.isBigNumber(value)) return fromDecimal((value as BigNumber).toFixed())
  // the 100 of a percentage is a plain number
  if (typeof value === 'number') return Number.isInteger(value) ? fromInt(BigInt(value)) : fromDecimal(String(value))
  if (typeof value === 'bigint') return fromInt(value)
  return null
}

function symbolValue(name: string, ctx: ExactContext): Exact | null {
  if (name === 'pi') return PI
  if (name === 'e') return E
  const exact = ctx.scope.exact.get(name)
  if (exact) return exact
  const v = ctx.scope.vars.get(name)
  return math.isBigNumber(v) ? fromBigNumber(v as BigNumber) : null
}

const TEN = fromInt(10n)!
const TWO = fromInt(2n)!

function integer(a: Exact | null): bigint | null {
  const q = a && asRational(a)
  return q && q.d === 1n ? q.n : null
}

function operator(op: OperatorLike, ctx: ExactContext): Exact | null {
  const v = (i: number) => walk(op.args[i], ctx)
  const binary = (f: (a: Exact, b: Exact) => Exact | null) => {
    if (op.args.length !== 2) return null
    const a = v(0)
    const b = a && v(1)
    return a && b ? f(a, b) : null
  }
  switch (op.fn) {
    case 'unaryPlus':
      return v(0)
    case 'unaryMinus': {
      const a = v(0)
      return a && neg(a)
    }
    case 'add':
      return binary(add)
    case 'subtract':
      return binary(sub)
    case 'multiply':
      return binary(mul)
    case 'divide':
      return binary(div)
    case 'pow':
      return binary((a, r) => {
        const q = asRational(r)
        return q ? pow(a, q) : null
      })
    case 'mod':
      return binary((a, b) => {
        const x = integer(a)
        const m = integer(b)
        if (x === null || m === null || m <= 0n) return null
        return fromInt(((x % m) + m) % m)
      })
    case 'factorial': {
      const a = v(0)
      return a && factorial(a)
    }
    default:
      return null
  }
}

function call(fn: FunctionLike, ctx: ExactContext): Exact | null {
  const name = fn.fn.name
  const args = fn.args
  const v = (i: number) => walk(args[i], ctx)
  const one = () => (args.length === 1 ? v(0) : null)
  switch (name) {
    case 'sqrt': {
      const a = one()
      return a && root(a, 2n)
    }
    case 'cbrt': {
      const a = one()
      return a && root(a, 3n)
    }
    case 'nthRoot': {
      const a = v(0)
      const n = args.length > 1 ? integer(v(1)) : 2n
      return a && n !== null ? root(a, n) : null
    }
    case 'abs': {
      const a = one()
      return a && abs(a)
    }
    case 'floor':
    case 'ceil':
    case 'round': {
      const a = one()
      return a && integerPart(a, name)
    }
    case 'sign': {
      const a = one()
      const s = a && sign(a)
      return s === null ? null : fromInt(BigInt(s))
    }
    case 'exp': {
      const a = one()
      const q = a && asRational(a)
      return q ? pow(E, q) : null
    }
    case 'ln': {
      const a = one()
      return a && logBase(a, E)
    }
    case 'log': {
      const a = v(0)
      if (!a) return null
      if (args.length === 1) return logBase(a, TEN)
      const b = v(1)
      return b && logBase(a, b)
    }
    case 'lg':
    case 'log10': {
      const a = one()
      return a && logBase(a, TEN)
    }
    case 'log2': {
      const a = one()
      return a && logBase(a, TWO)
    }
    case 'sin':
    case 'cos':
    case 'tan':
    case 'cot':
    case 'sec':
    case 'csc':
      return args.length === 1 ? trig(name, args[0], ctx) : null
    case 'asin':
    case 'acos':
    case 'atan':
    case 'acot':
      return inverseTrig(name, one(), ctx)
    case 'factorial': {
      const a = one()
      return a && factorial(a)
    }
    case 'combinations':
    case 'permutations': {
      const n = integer(v(0))
      const k = args.length > 1 ? integer(v(1)) : n
      if (n === null || k === null || n < 0n || k < 0n || k > n || n > 5000n) return null
      let r = 1n
      for (let i = 0n; i < k; i++) {
        r *= n - i
        if (name === 'combinations') r /= i + 1n
      }
      return fromInt(r)
    }
    case 'gcd':
    case 'lcm': {
      const values = args.map((_, i) => integer(v(i)))
      if (values.some((x) => x === null)) return null
      const [first, ...rest] = values as bigint[]
      return fromInt(rest.reduce((acc, x) => (name === 'gcd' ? bigGcd(acc, x) : bigLcm(acc, x)), first))
    }
    default:
      return null
  }
}

function bigGcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a
  b = b < 0n ? -b : b
  while (b) [a, b] = [b, a % b]
  return a
}

function bigLcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n
  const l = (a / bigGcd(a, b)) * b
  return l < 0n ? -l : l
}

// ---- trigonometry at the special angles ----

/** The angle in whole degrees, from "30 deg", a number in degree mode, or k·π in radian mode. */
function degrees(arg: MathNode, ctx: ExactContext): bigint | null {
  let node = arg
  while (node.type === 'ParenthesisNode') node = (node as unknown as { content: MathNode }).content
  if (node.type === 'OperatorNode') {
    const op = node as unknown as OperatorLike
    const unit = op.args[1] as unknown as { type: string; name?: string }
    if (op.fn === 'multiply' && op.args.length === 2 && unit.type === 'SymbolNode' && unit.name === 'deg') {
      return integer(walk(op.args[0], ctx))
    }
  }
  const x = walk(arg, ctx)
  if (!x) return null
  if (ctx.angle === 'deg') return integer(x)
  if (x.length === 0) return 0n
  if (x.length !== 1 || x[0].factors.size !== 1) return null
  const e = x[0].factors.get('pi')
  if (!e || e.n !== 1n || e.d !== 1n) return null
  const q = rat(x[0].coef.n * 180n, x[0].coef.d)
  return q.d === 1n ? q.n : null
}

let SIN: Map<number, Exact> | null = null
let ASIN: Map<string, bigint> | null = null
let ACOS: Map<string, bigint> | null = null
let ATAN: Map<string, bigint> | null = null

function tables() {
  if (SIN) return
  const r = (n: bigint) => root(fromInt(n)!, 2n)!
  const half = fromRational(1n, 2n)!
  const quarter = fromRational(1n, 4n)!
  SIN = new Map<number, Exact>([
    [0, ZERO],
    [15, mul(quarter, sub(r(6n), r(2n))!)!],
    [18, mul(quarter, sub(r(5n), ONE)!)!],
    [30, half],
    [45, mul(half, r(2n))!],
    [54, mul(quarter, add(r(5n), ONE)!)!],
    [60, mul(half, r(3n))!],
    [75, mul(quarter, add(r(6n), r(2n))!)!],
    [90, ONE],
  ])
  ASIN = new Map()
  ACOS = new Map()
  ATAN = new Map()
  for (let t = -90n; t <= 90n; t++) {
    const s = sinDeg(t)
    if (s) ASIN.set(key(s), t)
  }
  for (let t = 0n; t <= 180n; t++) {
    const c = cosDeg(t)
    if (c) ACOS.set(key(c), t)
  }
  for (let t = -89n; t <= 89n; t++) {
    const s = sinDeg(t)
    const c = cosDeg(t)
    const q = s && c ? div(s, c) : null
    if (q) ATAN.set(key(q), t)
  }
}

function sinDeg(theta: bigint): Exact | null {
  let t = ((theta % 360n) + 360n) % 360n
  let negative = false
  if (t >= 180n) {
    t -= 180n
    negative = true
  }
  if (t > 90n) t = 180n - t
  const v = SIN!.get(Number(t))
  if (!v) return null
  return negative ? neg(v) : v
}

const cosDeg = (theta: bigint) => sinDeg(theta + 90n)

function trig(name: string, arg: MathNode, ctx: ExactContext): Exact | null {
  tables()
  const theta = degrees(arg, ctx)
  if (theta === null) return null
  const s = sinDeg(theta)
  const c = cosDeg(theta)
  switch (name) {
    case 'sin':
      return s
    case 'cos':
      return c
    case 'tan':
      return s && c ? div(s, c) : null
    case 'cot':
      return s && c ? div(c, s) : null
    case 'sec':
      return c && div(ONE, c)
    default:
      return s && div(ONE, s)
  }
}

function inverseTrig(name: string, x: Exact | null, ctx: ExactContext): Exact | null {
  if (!x) return null
  tables()
  let theta: bigint | undefined
  if (name === 'asin') theta = ASIN!.get(key(x))
  else if (name === 'acos') theta = ACOS!.get(key(x))
  else if (name === 'atan') theta = ATAN!.get(key(x))
  else if (x.length === 0) theta = 90n
  else {
    const inv = div(ONE, x)
    theta = inv ? ATAN!.get(key(inv)) : undefined
  }
  if (theta === undefined) return null
  return ctx.angle === 'deg' ? fromInt(theta) : mul(fromRational(theta, 180n)!, PI)
}
