import { CalcError } from './errors'

/**
 * Whole numbers of any size: primality, factorization, divisors, GCD and LCM,
 * Euler's φ and modular arithmetic, for number theory and discrete math courses.
 */

const SMALL_PRIMES: number[] = (() => {
  const limit = 1000
  const sieve = new Uint8Array(limit + 1)
  const primes: number[] = []
  for (let i = 2; i <= limit; i++) {
    if (sieve[i]) continue
    primes.push(i)
    for (let j = i * i; j <= limit; j += i) sieve[j] = 1
  }
  return primes
})()

const abs = (n: bigint) => (n < 0n ? -n : n)

export function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  if (m === 0n) throw new CalcError('The modulus can’t be 0')
  if (exp < 0n) return modPow(modInverse(base, m), -exp, m)
  m = abs(m)
  let result = 1n % m
  let b = ((base % m) + m) % m
  let e = exp
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m
    b = (b * b) % m
    e >>= 1n
  }
  return result
}

export function gcd(a: bigint, b: bigint): bigint {
  a = abs(a)
  b = abs(b)
  while (b) [a, b] = [b, a % b]
  return a
}

export function lcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n
  return abs((a / gcd(a, b)) * b)
}

/** x with a·x ≡ 1 (mod m), by the extended Euclidean algorithm. */
export function modInverse(a: bigint, m: bigint): bigint {
  m = abs(m)
  if (m === 0n) throw new CalcError('The modulus can’t be 0')
  let [r0, r1] = [((a % m) + m) % m, m]
  let [s0, s1] = [1n, 0n]
  while (r1) {
    const q = r0 / r1
    ;[r0, r1] = [r1, r0 - q * r1]
    ;[s0, s1] = [s1, s0 - q * s1]
  }
  if (r0 !== 1n) throw new CalcError(`No inverse: the numbers share the factor ${r0}`)
  return ((s0 % m) + m) % m
}

/** The first 13 primes as Miller–Rabin bases give a sure answer below 3.3·10²⁴. */
const SURE_BELOW = 3317044064679887385961981n
const BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n]

/** true (prime), false (composite); above 3.3·10²⁴ "prime" means "prime with near certainty". */
export function isPrime(n: bigint): boolean {
  if (n < 2n) return false
  for (const p of SMALL_PRIMES) {
    const bp = BigInt(p)
    if (n === bp) return true
    if (n % bp === 0n) return false
  }
  let d = n - 1n
  let s = 0
  while ((d & 1n) === 0n) {
    d >>= 1n
    s++
  }
  const bases = n < SURE_BELOW ? BASES : [...BASES, 43n, 47n, 53n, 59n, 61n, 67n, 71n]
  outer: for (const a of bases) {
    let x = modPow(a, d, n)
    if (x === 1n || x === n - 1n) continue
    for (let i = 1; i < s; i++) {
      x = (x * x) % n
      if (x === n - 1n) continue outer
    }
    return false
  }
  return true
}

/** A factor of a composite n by Pollard's rho (Brent's variant), or null within the step budget. */
function rho(n: bigint, budget: { steps: number }): bigint | null {
  if ((n & 1n) === 0n) return 2n
  for (let c = 1n; c < 50n; c++) {
    const f = (x: bigint) => (x * x + c) % n
    let y = 2n
    let r = 1
    let q = 1n
    let g = 1n
    let x = y
    let ys = y
    const m = 128
    while (g === 1n) {
      x = y
      for (let i = 0; i < r; i++) y = f(y)
      for (let k = 0; k < r && g === 1n; k += m) {
        ys = y
        for (let i = 0; i < Math.min(m, r - k); i++) {
          y = f(y)
          q = (q * abs(x - y)) % n
        }
        g = gcd(q, n)
        budget.steps -= m
        if (budget.steps < 0) return null
      }
      r *= 2
    }
    if (g === n) {
      // the batch overshot: step back one at a time
      do {
        ys = f(ys)
        g = gcd(abs(x - ys), n)
      } while (g === 1n)
    }
    if (g !== n) return g
  }
  return null
}

export interface Factorization {
  /** Prime factors in increasing order with their powers. */
  factors: [bigint, number][]
  /** A composite part too hard to split in time (very large numbers), or null. */
  unfactored: bigint | null
}

export function factorize(n: bigint, steps = 2_000_000): Factorization {
  n = abs(n)
  if (n < 2n) return { factors: [], unfactored: null }
  const found = new Map<bigint, number>()
  const add = (p: bigint) => found.set(p, (found.get(p) ?? 0) + 1)
  let unfactored: bigint | null = null
  for (const p of SMALL_PRIMES) {
    const bp = BigInt(p)
    if (bp * bp > n) break
    while (n % bp === 0n) {
      add(bp)
      n /= bp
    }
  }
  const budget = { steps }
  const stack = n > 1n ? [n] : []
  while (stack.length) {
    const m = stack.pop()!
    if (isPrime(m)) {
      add(m)
      continue
    }
    const d = rho(m, budget)
    if (d === null) {
      unfactored = (unfactored ?? 1n) * m
      continue
    }
    stack.push(d, m / d)
  }
  const factors = [...found].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  return { factors, unfactored }
}

/** All divisors in increasing order; null when there are more than `limit`. */
export function divisors(f: Factorization, limit = 2000): bigint[] | null {
  if (f.unfactored) return null
  if (divisorCount(f) > BigInt(limit)) return null
  let list = [1n]
  for (const [p, k] of f.factors) {
    const next: bigint[] = []
    for (const d of list) {
      let pk = 1n
      for (let i = 0; i <= k; i++, pk *= p) next.push(d * pk)
    }
    list = next
  }
  return list.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

export function divisorCount(f: Factorization): bigint {
  return f.factors.reduce((c, [, k]) => c * BigInt(k + 1), 1n)
}

export function divisorSum(f: Factorization): bigint {
  return f.factors.reduce((s, [p, k]) => s * ((p ** BigInt(k + 1) - 1n) / (p - 1n)), 1n)
}

/** Euler's φ: how many numbers up to n are coprime to it. */
export function totient(n: bigint, f: Factorization): bigint {
  return f.factors.reduce((t, [p]) => (t / p) * (p - 1n), abs(n))
}

export function nextPrime(n: bigint): bigint {
  let c = n < 2n ? 2n : n + 1n
  while (!isPrime(c)) c++
  return c
}

export function previousPrime(n: bigint): bigint | null {
  for (let c = n - 1n; c >= 2n; c--) if (isPrime(c)) return c
  return null
}

// ---- reading whole numbers: 2^64 − 1, 20!, (3·10^20 + 7) ----

const MAX_BITS = 100_000

/** Whole numbers separated by commas, semicolons or new lines; plain numbers also by spaces. */
export function parseIntegers(text: string): bigint[] {
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => (/^\d+(\s+\d+)+$/.test(s) ? s.split(/\s+/) : [s]))
    .map(evaluateInteger)
}

export function evaluateInteger(text: string): bigint {
  const src = text.replace(/[\s_]/g, '').replace(/[−–]/g, '-').replace(/[×·]/g, '*')
  let i = 0
  const peek = () => src[i]

  function expr(): bigint {
    let v = term()
    while (peek() === '+' || peek() === '-') v = src[i++] === '+' ? v + term() : v - term()
    return v
  }
  function term(): bigint {
    let v = unary()
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = src[i++]
      const d = unary()
      if (op === '*') v *= d
      else if (d === 0n) throw new CalcError('Division by zero')
      else if (op === '%') v %= d
      else {
        if (v % d) throw new CalcError('The division is not exact: whole numbers only')
        v /= d
      }
    }
    return v
  }
  function unary(): bigint {
    if (peek() === '-') {
      i++
      return -unary()
    }
    if (peek() === '+') i++
    return power()
  }
  function power(): bigint {
    const base = postfix()
    if (peek() !== '^') return base
    i++
    const exp = unary()
    if (exp < 0n) throw new CalcError('A negative power is not a whole number')
    if (abs(base) > 1n && BigInt(abs(base).toString(2).length) * exp > BigInt(MAX_BITS)) throw new CalcError('That number is too large')
    return base ** exp
  }
  function postfix(): bigint {
    let v = atom()
    while (peek() === '!') {
      i++
      if (v < 0n) throw new CalcError('No factorial of a negative number')
      if (v > 5000n) throw new CalcError('That number is too large')
      let f = 1n
      for (let k = 2n; k <= v; k++) f *= k
      v = f
    }
    return v
  }
  function atom(): bigint {
    if (peek() === '(') {
      i++
      const v = expr()
      if (peek() !== ')') throw new CalcError('Missing closing parenthesis')
      i++
      return v
    }
    const m = /^(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+)/i.exec(src.slice(i))
    if (!m) throw new CalcError(i < src.length ? `Unexpected “${src[i]}”` : 'Incomplete expression')
    i += m[0].length
    return BigInt(m[0])
  }

  const v = expr()
  if (i < src.length) throw new CalcError(`Unexpected “${src[i]}”`)
  return v
}
