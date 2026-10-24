import { create, all, type BigNumber, type MathJsInstance } from 'mathjs'
import { CalcError } from './errors'

export type Angle = 'deg' | 'rad'

// predictable: sqrt(-1), asin(2), log(-1) give NaN ("Undefined") instead of complex numbers,
// which is what people expect from a calculator.
export const math: MathJsInstance = create(all, {
  number: 'BigNumber',
  precision: 64,
  predictable: true,
})

// ---- units mathjs does not have ----

const EXTRA_UNITS: [string, string, string[]?][] = [
  ['cal', '4.184 J', ['calorie', 'calories']],
  ['kcal', '4184 J', ['kilocalorie', 'kilocalories']],
  ['knot', '1852 m/h', ['knots', 'kn']],
  ['nmi', '1852 m', ['nauticalmile']],
  ['ly', '9460730472580800 m', ['lightyear', 'lightyears']],
  ['au', '149597870700 m'],
  ['pc', '30856775814913673 m', ['parsec', 'parsecs']],
  ['rpm', '1/min'],
]

const isUnit = (math as unknown as { Unit: { isValuelessUnit: (name: string) => boolean } }).Unit.isValuelessUnit

for (const [name, definition, aliases = []] of EXTRA_UNITS) {
  if (isUnit(name)) continue
  math.createUnit(name, { definition, aliases: aliases.filter((a) => !isUnit(a)) })
}

// ---- functions that behave like a calculator ----

const PI = math.pi as unknown as BigNumber

function isBig(x: unknown): x is BigNumber {
  return math.isBigNumber(x)
}

/** Remove the last-digit noise of 64-digit trig, so sin(30°) is exactly 0.5 and sin(180°) is 0. */
function snap(x: unknown, places = 58): unknown {
  return isBig(x) && x.isFinite() ? x.toDecimalPlaces(places) : x
}

function toRadians(x: unknown, angle: Angle): unknown {
  if (angle === 'rad' || math.isUnit(x)) return x
  return math.multiply(x as BigNumber, math.divide(PI, 180) as BigNumber)
}

function fromRadians(x: unknown, angle: Angle): unknown {
  if (angle === 'rad') return snap(x)
  return snap(math.multiply(x as BigNumber, math.divide(180, PI) as BigNumber), 50)
}

function undefinedResult(): never {
  throw new CalcError('Undefined')
}

/** Functions placed in the evaluation scope; mathjs resolves scope before its built-ins. */
export function calculatorFunctions(angle: Angle): Map<string, unknown> {
  const sin = (x: unknown) => snap(math.sin(toRadians(x, angle) as BigNumber))
  const cos = (x: unknown) => snap(math.cos(toRadians(x, angle) as BigNumber))
  const tan = (x: unknown) => {
    // tan(90°) must be an error, not 10^63
    if (angle === 'deg' && isBig(x) && x.minus(90).mod(180).isZero()) undefinedResult()
    const r = snap(math.tan(toRadians(x, angle) as BigNumber))
    if (isBig(r) && r.abs().gt(1e40)) undefinedResult()
    return r
  }
  const cot = (x: unknown) => {
    const t = tan(x)
    if (isBig(t) && t.isZero()) undefinedResult()
    return math.divide(1, t as BigNumber)
  }
  const sec = (x: unknown) => math.divide(1, cos(x) as BigNumber)
  const csc = (x: unknown) => math.divide(1, sin(x) as BigNumber)
  const asin = (x: unknown) => fromRadians(math.asin(x as BigNumber), angle)
  const acos = (x: unknown) => fromRadians(math.acos(x as BigNumber), angle)
  const atan = (x: unknown) => fromRadians(math.atan(x as BigNumber), angle)
  const log10 = (x: unknown) => math.log10(x as BigNumber)
  const fns: Record<string, unknown> = {
    sin,
    cos,
    tan,
    cot,
    sec,
    csc,
    asin,
    acos,
    atan,
    acot: (x: unknown) => fromRadians(math.acot(x as BigNumber), angle),
    // as on any calculator: log is base 10, ln is natural
    log: (x: unknown, base?: unknown) =>
      base === undefined ? log10(x) : math.log(x as BigNumber, base as BigNumber),
    lg: log10,
    ln: (x: unknown) => math.log(x as BigNumber),
  }
  return new Map(Object.entries(fns))
}

/**
 * Scope for mathjs: built-in calculator functions underneath, user variables on top.
 * Assignments always land in `vars`.
 */
export class Scope {
  constructor(
    private base: Map<string, unknown>,
    readonly vars: Map<string, unknown> = new Map(),
  ) {}
  get(key: string) {
    return this.vars.has(key) ? this.vars.get(key) : this.base.get(key)
  }
  set(key: string, value: unknown) {
    this.vars.set(key, value)
    return this
  }
  has(key: string) {
    return this.vars.has(key) || this.base.has(key)
  }
  keys() {
    return new Set([...this.base.keys(), ...this.vars.keys()]).values()
  }
  delete(key: string) {
    return this.vars.delete(key)
  }
  clear() {
    this.vars.clear()
  }
  forEach(cb: (value: unknown, key: string) => void) {
    for (const key of this.keys()) cb(this.get(key), key)
  }
  [Symbol.iterator]() {
    return [...this.keys()].map((k) => [k, this.get(k)] as [string, unknown])[Symbol.iterator]()
  }
}
