/**
 * Exact arithmetic for textbook answers: 2√5, √2/2, π/3, (1+√5)/2, 2∛2, e³.
 *
 * A value is a sum of terms; a term is a rational coefficient times a product of
 * bases raised to rational powers. The bases are primes (whose exponents are kept in
 * (0, 1): whole powers go into the coefficient) and the symbols π and e (any exponent).
 * Everything is immutable; every operation returns a new value or null when the answer
 * is outside this world (ln 2, π^π, numbers too big to factor), and the decimal is shown.
 */
import type { BigNumber } from 'mathjs'
import { math } from './math'
import { factorize, gcd, type Factorization } from './integers'
import { superscript } from './format'

export interface Rational {
  n: bigint
  /** Always positive; the fraction is reduced. */
  d: bigint
}

export type Base = bigint | 'pi' | 'e'

export interface Term {
  coef: Rational
  factors: ReadonlyMap<Base, Rational>
  /** Canonical key of `factors` ("2^1/2|pi^1"): like terms have the same one. */
  sig: string
}

export type Exact = readonly Term[]

export type Kind = 'integer' | 'rational' | 'irrational'

// ---- limits: beyond them the decimal is shown ----

const MAX = 10n ** 64n
const MAX_TERMS = 32
const MAX_POWER = 4096n
const MAX_ROOT = 100n
const MAX_FACTORIAL = 200n
/** Pollard-rho budget per number: big radicands with large prime factors give up quickly. */
const FACTOR_STEPS = 5000

const big = (x: bigint) => (x < 0n ? -x : x)
const tooBig = (x: bigint) => big(x) >= MAX

function floorDiv(n: bigint, d: bigint): bigint {
  const q = n / d
  return (n % d !== 0n && (n < 0n) !== (d < 0n)) ? q - 1n : q
}

function isqrt(n: bigint): bigint {
  if (n < 2n) return n
  let x = n
  let y = (x + 1n) >> 1n
  while (y < x) {
    x = y
    y = (x + n / x) >> 1n
  }
  return x
}

// ---- rationals ----

export function rat(n: bigint, d: bigint): Rational {
  if (d < 0n) {
    n = -n
    d = -d
  }
  const g = gcd(n, d)
  return g > 1n ? { n: n / g, d: d / g } : { n, d }
}

const rInt = (n: bigint): Rational => ({ n, d: 1n })
const rAdd = (a: Rational, b: Rational) => rat(a.n * b.d + b.n * a.d, a.d * b.d)
const rSub = (a: Rational, b: Rational) => rat(a.n * b.d - b.n * a.d, a.d * b.d)
const rMul = (a: Rational, b: Rational) => rat(a.n * b.n, a.d * b.d)
const rNeg = (a: Rational): Rational => ({ n: -a.n, d: a.d })
const rInv = (a: Rational): Rational | null => (a.n === 0n ? null : rat(a.d, a.n))
const rEq = (a: Rational, b: Rational) => a.n === b.n && a.d === b.d
const rStr = (a: Rational) => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`)

// ---- terms ----

function baseRank(b: Base): number {
  return typeof b === 'bigint' ? 0 : b === 'pi' ? 1 : 2
}

function compareBase(a: Base, b: Base): number {
  const ra = baseRank(a)
  const rb = baseRank(b)
  if (ra !== rb) return ra - rb
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0
  return 0
}

/**
 * The one place that keeps the invariant: whole powers of primes go into the coefficient,
 * the fractional part stays as a factor, zero exponents disappear, sizes are checked.
 */
function makeTerm(coef: Rational, exps: Iterable<[Base, Rational]>): Term | null {
  let n = coef.n
  let d = coef.d
  const factors = new Map<Base, Rational>()
  for (const [base, e] of exps) {
    if (e.n === 0n) continue
    if (typeof base !== 'bigint') {
      factors.set(base, e)
      continue
    }
    const k = floorDiv(e.n, e.d)
    if (big(k) > MAX_POWER) return null
    if (k > 0n) n *= base ** k
    else if (k < 0n) d *= base ** -k
    if (tooBig(n) || tooBig(d)) return null
    const f = rat(e.n - k * e.d, e.d)
    if (f.n !== 0n) factors.set(base, f)
  }
  const c = rat(n, d)
  if (tooBig(c.n) || tooBig(c.d)) return null
  const sorted = [...factors].sort(([a], [b]) => compareBase(a, b))
  const sig = sorted.map(([b, e]) => `${b}^${rStr(e)}`).join('|')
  return { coef: c, factors: new Map(sorted), sig }
}

/** Merge like terms; null when there are too many or the numbers got too big. */
function sum(terms: (Term | null)[]): Exact | null {
  const byKey = new Map<string, Term>()
  for (const t of terms) {
    if (!t) return null
    if (t.coef.n === 0n) continue
    const prev = byKey.get(t.sig)
    if (!prev) {
      byKey.set(t.sig, t)
      continue
    }
    const c = rAdd(prev.coef, t.coef)
    if (tooBig(c.n) || tooBig(c.d)) return null
    if (c.n === 0n) byKey.delete(t.sig)
    else byKey.set(t.sig, { ...prev, coef: c })
  }
  if (byKey.size > MAX_TERMS) return null
  return [...byKey.values()]
}

function single(coef: Rational, exps: [Base, Rational][] = []): Exact {
  const t = makeTerm(coef, exps)!
  return t.coef.n === 0n ? [] : [t]
}

export const ZERO: Exact = []
export const ONE: Exact = single(rInt(1n))
export const PI: Exact = single(rInt(1n), [['pi', rInt(1n)]])
export const E: Exact = single(rInt(1n), [['e', rInt(1n)]])

// ---- constructors ----

export function fromRational(n: bigint, d: bigint): Exact | null {
  if (d === 0n) return null
  const t = makeTerm(rat(n, d), [])
  return t ? (t.coef.n === 0n ? ZERO : [t]) : null
}

export const fromInt = (n: bigint): Exact | null => fromRational(n, 1n)

/** A decimal literal as typed: 0.1 is exactly 1/10, 1.5e-3 is 3/2000. */
export function fromDecimal(text: string): Exact | null {
  const m = /^(-?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text.trim())
  if (!m) return null
  const [, sign, int, frac = '', exp = '0'] = m
  let n = BigInt(int + frac)
  let d = 10n ** BigInt(frac.length)
  const e = Number(exp)
  if (e > 0) n *= 10n ** BigInt(e)
  else if (e < 0) d *= 10n ** BigInt(-e)
  if (sign) n = -n
  return fromRational(n, d)
}

/** A computed number that is really a whole number or a fraction; null for 0.7071… */
export function fromBigNumber(x: BigNumber): Exact | null {
  if (!x.isFinite()) return null
  const r = x.toSignificantDigits(60)
  if (r.isInteger()) return fromInt(BigInt(r.toFixed()))
  const f = toFraction(r)
  if (!f) return null
  const n = BigInt(f.whole) * BigInt(f.den) + BigInt(f.num)
  return fromRational(f.negative ? -n : n, BigInt(f.den))
}

// ---- arithmetic ----

export function add(a: Exact, b: Exact): Exact | null {
  return sum([...a, ...b])
}

export function neg(a: Exact): Exact {
  return a.map((t) => ({ ...t, coef: rNeg(t.coef) }))
}

export function sub(a: Exact, b: Exact): Exact | null {
  return add(a, neg(b))
}

function mulTerms(x: Term, y: Term): Term | null {
  const exps = new Map<Base, Rational>(x.factors)
  for (const [base, e] of y.factors) {
    const prev = exps.get(base)
    exps.set(base, prev ? rAdd(prev, e) : e)
  }
  return makeTerm(rMul(x.coef, y.coef), exps)
}

export function mul(a: Exact, b: Exact): Exact | null {
  const terms: (Term | null)[] = []
  for (const x of a) for (const y of b) terms.push(mulTerms(x, y))
  return sum(terms)
}

function invTerm(t: Term): Exact | null {
  const coef = rInv(t.coef)
  if (!coef) return null
  const exps: [Base, Rational][] = [...t.factors].map(([b, e]) => [b, rNeg(e)])
  const r = makeTerm(coef, exps)
  return r ? [r] : null
}

/** Only square roots of primes in every term: the kind of denominator a conjugate clears. */
function onlySquareRoots(a: Exact): boolean {
  return a.every((t) => [...t.factors].every(([b, e]) => typeof b === 'bigint' && e.n === 1n && e.d === 2n))
}

export function div(a: Exact, b: Exact, depth = 0): Exact | null {
  if (b.length === 0) return null
  if (b.length === 1) {
    const inv = invTerm(b[0])
    return inv ? mul(a, inv) : null
  }
  if (depth > 8 || !onlySquareRoots(b)) return null
  // rationalize one prime at a time: (A + B√p) · (A − B√p) = A² − pB²
  const p = [...b.flatMap((t) => [...t.factors.keys()])].sort(compareBase)[0] as bigint
  const without = (t: Term): Term | null => makeTerm(t.coef, [...t.factors].filter(([base]) => base !== p))
  const A = sum(b.filter((t) => !t.factors.has(p)))
  const B = sum(b.filter((t) => t.factors.has(p)).map(without))
  if (!A || !B) return null
  const sqrtP = single(rInt(1n), [[p, rat(1n, 2n)]])
  const bSqrtP = mul(B, sqrtP)
  const bb = mul(B, B)
  if (!bSqrtP || !bb) return null
  const conjugate = sub(A, bSqrtP)
  const aa = mul(A, A)
  const pbb = mul(fromInt(p)!, bb)
  if (!conjugate || !aa || !pbb) return null
  const numerator = mul(a, conjugate)
  const denominator = sub(aa, pbb)
  if (!numerator || !denominator) return null
  return div(numerator, denominator, depth + 1)
}

function intPow(a: Exact, n: bigint): Exact | null {
  if (big(n) > MAX_POWER) return null
  if (n < 0n) {
    const p = intPow(a, -n)
    return p ? div(ONE, p) : null
  }
  let result: Exact | null = ONE
  let base: Exact | null = a
  let e = n
  while (e > 0n && result && base) {
    if (e & 1n) result = mul(result, base)
    e >>= 1n
    if (e > 0n) base = mul(base, base)
  }
  return result
}

const factorCache = new Map<bigint, Factorization | null>()

function factorization(x: bigint): Factorization | null {
  let f = factorCache.get(x)
  if (f === undefined) {
    const r = factorize(x, FACTOR_STEPS)
    f = r.unfactored ? null : r
    if (factorCache.size >= 512) factorCache.clear()
    factorCache.set(x, f)
  }
  return f
}

/** Exponent of every base in |t|: the coefficient's prime factors plus the roots. */
function exponentVector(t: Term): Map<Base, Rational> | null {
  const v = new Map<Base, Rational>(t.factors)
  const addPrimes = (x: bigint, sign: bigint) => {
    if (x === 1n) return true
    const f = factorization(x)
    if (!f) return false
    for (const [p, k] of f.factors) {
      const prev = v.get(p)
      const e = rInt(sign * BigInt(k))
      v.set(p, prev ? rAdd(prev, e) : e)
    }
    return true
  }
  if (!addPrimes(big(t.coef.n), 1n) || !addPrimes(t.coef.d, -1n)) return null
  return v
}

/** |t|^r for a fractional r: multiply every exponent, then carry whole powers back out. */
function termPow(t: Term, r: Rational): Exact | null {
  if (t.coef.n === 0n) return r.n > 0n ? ZERO : null
  const v = exponentVector(t)
  if (!v) return null
  const exps = new Map<Base, Rational>()
  for (const [b, e] of v) exps.set(b, rMul(e, r))
  const out = makeTerm(rInt(1n), exps)
  return out ? [out] : null
}

/** √(a + b√c) = √((a+s)/2) ± √((a−s)/2) when s = √(a² − b²c) is rational. */
function denest(a: Exact): Exact | null {
  if (a.length !== 2) return null
  const rational = a.find((t) => t.factors.size === 0)
  const radical = a.find((t) => t.factors.size > 0)
  if (!rational || !radical || rational.coef.n <= 0n || !onlySquareRoots([radical])) return null
  let c = 1n
  for (const [p] of radical.factors) c *= p as bigint
  const A = rational.coef
  const B = radical.coef
  const d = rSub(rMul(A, A), rMul(rMul(B, B), rInt(c)))
  if (d.n < 0n) return null
  const sn = isqrt(d.n)
  const sd = isqrt(d.d)
  if (sn * sn !== d.n || sd * sd !== d.d) return null
  const s = rat(sn, sd)
  const x = rMul(rAdd(A, s), rat(1n, 2n))
  const y = rMul(rSub(A, s), rat(1n, 2n))
  const rx = fromRational(x.n, x.d)
  const ry = fromRational(y.n, y.d)
  if (!rx || !ry) return null
  const sx = root(rx, 2n)
  const sy = root(ry, 2n)
  if (!sx || !sy) return null
  return B.n > 0n ? add(sx, sy) : sub(sx, sy)
}

/** a^r as mathjs' ^ does it: a negative base with a fractional exponent is undefined. */
export function pow(a: Exact, r: Rational): Exact | null {
  if (r.d === 1n) return intPow(a, r.n)
  if (r.d > MAX_ROOT) return null
  if (a.length === 0) return r.n > 0n ? ZERO : null
  if (a.length === 1) return a[0].coef.n < 0n ? null : termPow(a[0], r)
  if (r.d === 2n) {
    const s = denest(a)
    return s ? intPow(s, r.n) : null
  }
  return null
}

/** The n-th root as nthRoot does it: an odd root of a negative number is negative. */
export function root(a: Exact, n: bigint): Exact | null {
  if (n < 2n || n > MAX_ROOT) return null
  if (a.length === 1 && a[0].coef.n < 0n) {
    if (n % 2n === 0n) return null
    const p = termPow({ ...a[0], coef: rNeg(a[0].coef) }, rat(1n, n))
    return p ? neg(p) : null
  }
  return pow(a, rat(1n, n))
}

export function asRational(a: Exact): Rational | null {
  if (a.length === 0) return rInt(0n)
  if (a.length === 1 && a[0].factors.size === 0) return a[0].coef
  return null
}

export function kind(a: Exact): Kind {
  const q = asRational(a)
  return q ? (q.d === 1n ? 'integer' : 'rational') : 'irrational'
}

/** A canonical string: equal values have equal keys. */
export function key(a: Exact): string {
  return [...a]
    .sort((x, y) => (x.sig < y.sig ? -1 : x.sig > y.sig ? 1 : 0))
    .map((t) => `${rStr(t.coef)}*${t.sig}`)
    .join('+')
}

export function sign(a: Exact): -1 | 0 | 1 | null {
  if (a.length === 0) return 0
  // roots of primes, π and e are positive: one term has the sign of its coefficient
  if (a.length === 1) return a[0].coef.n < 0n ? -1 : 1
  const v = toBig(a)
  if (v.abs().lt('1e-40')) return null
  return v.isNegative() ? -1 : 1
}

export function abs(a: Exact): Exact | null {
  const s = sign(a)
  return s === null ? null : s < 0 ? neg(a) : a
}

/** floor, ceil and round (half away from zero, as mathjs does). */
export function integerPart(a: Exact, mode: 'floor' | 'ceil' | 'round'): Exact | null {
  const q = asRational(a)
  if (q) {
    if (mode === 'floor') return fromInt(floorDiv(q.n, q.d))
    if (mode === 'ceil') return fromInt(-floorDiv(-q.n, q.d))
    const r = floorDiv(2n * big(q.n) + q.d, 2n * q.d)
    return fromInt(q.n < 0n ? -r : r)
  }
  const v = toBig(a)
  // too close to a whole number to tell on which side it is
  if (v.minus(v.round()).abs().lt('1e-40')) return null
  const r = mode === 'floor' ? v.floor() : mode === 'ceil' ? v.ceil() : v.round()
  return fromInt(BigInt(r.toFixed()))
}

export function factorial(a: Exact): Exact | null {
  const q = asRational(a)
  if (!q || q.d !== 1n || q.n < 0n || q.n > MAX_FACTORIAL) return null
  let f = 1n
  for (let k = 2n; k <= q.n; k++) {
    f *= k
    if (tooBig(f)) return null
  }
  return fromInt(f)
}

/** log_b x when it is rational: ln e² = 2, log 1000 = 3, log √10 = ½; otherwise null. */
export function logBase(x: Exact, b: Exact): Exact | null {
  if (x.length !== 1 || b.length !== 1 || x[0].coef.n <= 0n || b[0].coef.n <= 0n) return null
  const vx = exponentVector(x[0])
  const vb = exponentVector(b[0])
  if (!vx || !vb || vb.size === 0) return null
  let k: Rational | null = null
  for (const base of new Set([...vx.keys(), ...vb.keys()])) {
    const ex = vx.get(base) ?? rInt(0n)
    const eb = vb.get(base) ?? rInt(0n)
    if (eb.n === 0n) {
      if (ex.n !== 0n) return null
      continue
    }
    const q = rMul(ex, rInv(eb)!)
    if (k === null) k = q
    else if (!rEq(k, q)) return null
  }
  return k ? fromRational(k.n, k.d) : ZERO
}

// ---- numbers ----

function baseBig(b: Base): BigNumber {
  if (typeof b === 'bigint') return math.bignumber(b.toString())
  return (b === 'pi' ? math.pi : math.e) as unknown as BigNumber
}

export function toBig(a: Exact): BigNumber {
  let total = math.bignumber(0)
  for (const t of a) {
    let v = math.bignumber(t.coef.n.toString()).div(t.coef.d.toString())
    for (const [b, e] of t.factors) v = v.times(baseBig(b).pow(math.bignumber(e.n.toString()).div(e.d.toString())))
    total = total.plus(v)
  }
  return total
}

/** Does the exact value match the number the numeric engine found? A guard against mistakes. */
export function agreesWith(a: Exact, x: BigNumber): boolean {
  if (!x.isFinite()) return false
  const v = toBig(a)
  const scale = v.abs().gt(x.abs()) ? v.abs() : x.abs()
  if (scale.lt('1e-50')) return true
  return v.minus(x).abs().lte(scale.times('1e-30'))
}

// ---- writing ----

type Style = 'latex' | 'plain'

function termOrder(t: Term): [number, bigint, bigint] {
  let cls = 0
  let q = 1n
  let radicand = 1n
  for (const [b, e] of t.factors) {
    if (typeof b !== 'bigint') cls = 2
    else {
      if (cls === 0) cls = 1
      if (e.d > q) {
        q = e.d
        radicand = b
      }
    }
  }
  return [cls, q, radicand]
}

function compareTerms(x: Term, y: Term): number {
  const a = termOrder(x)
  const b = termOrder(y)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  return x.sig < y.sig ? -1 : x.sig > y.sig ? 1 : 0
}

function radical(radicand: bigint, q: bigint, style: Style): string {
  const r = radicand.toString()
  if (style === 'latex') return q === 2n ? `\\sqrt{${r}}` : `\\sqrt[${q}]{${r}}`
  return q === 2n ? `√${r}` : q === 3n ? `∛${r}` : q === 4n ? `∜${r}` : `${r}^(1/${q})`
}

function symbol(b: 'pi' | 'e', e: Rational, style: Style): string {
  const name = style === 'latex' ? (b === 'pi' ? '\\pi' : '\\exponentialE') : b === 'pi' ? 'π' : 'e'
  if (e.d === 1n) {
    if (e.n === 1n) return name
    return style === 'latex' ? `${name}^{${e.n}}` : name + superscript(e.n.toString())
  }
  if (e.n === 1n && e.d === 2n) return style === 'latex' ? `\\sqrt{${name}}` : `√${name}`
  return style === 'latex' ? `${name}^{\\frac{${e.n}}{${e.d}}}` : `${name}^(${e.n}/${e.d})`
}

/** |c|·factors with a whole coefficient c: "2\sqrt{5}", "\sqrt{2}\pi", "7". */
function termBody(c: bigint, factors: ReadonlyMap<Base, Rational>, style: Style): string {
  const radicands = new Map<bigint, bigint>()
  const symbols: string[] = []
  for (const [b, e] of factors) {
    if (typeof b === 'bigint') radicands.set(e.d, (radicands.get(e.d) ?? 1n) * b ** e.n)
    else symbols.push(symbol(b, e, style))
  }
  const roots = [...radicands].sort(([p], [q]) => (p < q ? -1 : 1)).map(([q, r]) => radical(r, q, style))
  const parts = [...roots, ...symbols]
  const coefficient = big(c)
  if (!parts.length) return coefficient.toString()
  const prefix = coefficient === 1n ? '' : coefficient.toString()
  if (style === 'latex') return prefix + parts.join('')
  // in plain text a dot keeps √2·π from reading as √(2π)
  return prefix + (roots.length && symbols.length ? [...roots, ...symbols].join('·') : parts.join(''))
}

/** A sum of terms with whole coefficients, positive ones first: "1+\sqrt{2}", "\sqrt{2}-1". */
function renderSum(terms: Term[], style: Style): string {
  const sorted = [...terms].sort(compareTerms)
  const ordered = [...sorted.filter((t) => t.coef.n > 0n), ...sorted.filter((t) => t.coef.n < 0n)]
  let out = ''
  for (const t of ordered) {
    const body = termBody(t.coef.n, t.factors, style)
    if (t.coef.n < 0n) out += '-' + body
    else out += (out ? '+' : '') + body
  }
  return out
}

/** A term whose π or e sits in a denominator (1/π): written as its own fraction. */
function termFraction(t: Term, style: Style): string {
  const up: [Base, Rational][] = []
  const down: [Base, Rational][] = []
  for (const [b, e] of t.factors) (e.n < 0n ? down : up).push([b, e.n < 0n ? rNeg(e) : e])
  const num = termBody(t.coef.n, new Map(up), style)
  const den = termBody(t.coef.d, new Map(down), style)
  return style === 'latex' ? `\\frac{${num}}{${den}}` : `${num}/${den}`
}

function render(a: Exact, style: Style, mixed: boolean): string {
  if (a.length === 0) return '0'
  const q = asRational(a)
  if (q && q.d !== 1n && mixed && big(q.n) > q.d) {
    const whole = big(q.n) / q.d
    const rest = big(q.n) % q.d
    return `${q.n < 0n ? '-' : ''}${whole}${style === 'latex' ? `\\frac{${rest}}{${q.d}}` : ` ${rest}/${q.d}`}`
  }
  if (a.some((t) => [...t.factors.values()].some((e) => e.n < 0n))) {
    const sorted = [...a].sort(compareTerms)
    return sorted
      .map((t, i) => {
        const body = termFraction({ ...t, coef: { n: big(t.coef.n), d: t.coef.d } }, style)
        return (t.coef.n < 0n ? '-' : i ? '+' : '') + body
      })
      .join('')
  }
  let L = 1n
  for (const t of a) L = (L / gcd(L, t.coef.d)) * t.coef.d
  if (L === 1n) return renderSum([...a], style)
  // one fraction for the whole value: (1+√5)/2 rather than 1/2 + √5/2
  if (a.every((t) => t.coef.n < 0n)) return '-' + render(neg(a), style, mixed)
  const scaled = a.map((t) => ({ ...t, coef: rInt(t.coef.n * (L / t.coef.d)) }))
  const body = renderSum(scaled, style)
  if (style === 'latex') return `\\frac{${body}}{${L}}`
  return `${scaled.length > 1 ? `(${body})` : body}/${L}`
}

/** Textbook LaTeX that the formula field can read back: 2\sqrt{5}, \frac{1+\sqrt{5}}{2}. */
export function toLatex(a: Exact, opts: { mixed?: boolean } = {}): string {
  return render(a, 'latex', !!opts.mixed)
}

/** Unicode text for copying: 2√5, (1+√5)/2, π/3, 2∛2, e³. */
export function toPlain(a: Exact): string {
  return render(a, 'plain', false)
}

// ---- fractions behind decimals (used for answers from the symbolic engine) ----

/** A result as a fraction: −3½ (= −7/2) is { negative, whole: '3', num: '1', den: '2' }. */
export interface Fraction {
  negative: boolean
  whole: string
  num: string
  den: string
}

const MAX_DENOMINATOR = 1_000_000_000

/**
 * The exact fraction behind a result, if there is one. We compute with 64 digits,
 * so a true fraction matches its 64-digit value, while √2 or π never get that close.
 */
export function toFraction(value: unknown): Fraction | null {
  if (!math.isBigNumber(value)) return null
  // 9.999…9 from the last-digit noise of a 64-digit computation is 10, not 10/1
  const x = (value as BigNumber).toSignificantDigits(60)
  if (!x.isFinite() || x.isInteger()) return null
  const abs = x.abs()
  const [n, d] = abs.toFraction(MAX_DENOMINATOR)
  if (d.eq(1) || n.div(d).minus(abs).abs().gt(abs.times('1e-45'))) return null
  return {
    negative: x.isNegative(),
    whole: n.divToInt(d).toFixed(),
    num: n.mod(d).toFixed(),
    den: d.toFixed(),
  }
}

/** 7/2 as an improper fraction, or 3½ when `mixed`. */
export function fractionLatex(f: Fraction, mixed = false): string {
  const sign = f.negative ? '-' : ''
  if (!mixed || f.whole === '0') {
    const num = BigInt(f.whole) * BigInt(f.den) + BigInt(f.num)
    return `${sign}\\frac{${num}}{${f.den}}`
  }
  return `${sign}${f.whole}\\frac{${f.num}}{${f.den}}`
}

/** For copying: 7/2, which every program understands, rather than 3 1/2. */
export function fractionPlain(f: Fraction): string {
  const num = BigInt(f.whole) * BigInt(f.den) + BigInt(f.num)
  return `${f.negative ? '-' : ''}${num}/${f.den}`
}

/** The formula has a decimal number in it (1.5 or 1{,}5): the person is working in decimals. */
export function hasDecimalLiteral(latex: string): boolean {
  return /\d\.\d|\{,\}/.test(latex)
}

/**
 * Show the answer as a fraction when the problem is about fractions (it has a fraction or
 * a division and no decimals), as calculators with textbook display do; otherwise as a decimal.
 */
export function prefersFraction(latex: string): boolean {
  return /\\frac|\\div|:|\//.test(latex) && !hasDecimalLiteral(latex)
}
