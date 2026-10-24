import { describe, it, expect } from 'vitest'
import { parseNumbers, parsePairs, summary, linearFit, quantile } from '../src/engine/stats'
import {
  isPrime,
  factorize,
  divisors,
  divisorCount,
  divisorSum,
  totient,
  gcd,
  lcm,
  modPow,
  modInverse,
  nextPrime,
  previousPrime,
  parseIntegers,
  evaluateInteger,
} from '../src/engine/integers'

const close = (a: number | null, b: number, digits = 9) => expect(a).toBeCloseTo(b, digits)

describe('statistics', () => {
  it('reads lists with either decimal mark', () => {
    expect(parseNumbers('1, 2.5; 3\n4', '.')).toEqual([1, 2.5, 3, 4])
    expect(parseNumbers('1,5 2,5\t3', ',')).toEqual([1.5, 2.5, 3])
    expect(() => parseNumbers('1 two', '.')).toThrow('“two” is not a number')
    expect(parsePairs('1 2\n3\t4\n\n5;6', '.')).toEqual({ xs: [1, 3, 5], ys: [2, 4, 6] })
    expect(() => parsePairs('1 2 3', '.')).toThrow('Line 1')
  })

  it('summarizes a list', () => {
    const s = summary([2, 4, 4, 4, 5, 5, 7, 9])
    expect(s).toMatchObject({ n: 8, sum: 40, mean: 5, median: 4.5, min: 2, max: 9, sigma: 2, modes: [4] })
    close(s.s, Math.sqrt(32 / 7))
    close(s.sem, Math.sqrt(32 / 7) / Math.sqrt(8))
    expect(s.sumSquares).toBe(232)
    // quartiles as R (type 7) and Excel's QUARTILE.INC
    expect(s.q1).toBe(4)
    expect(s.q3).toBe(5.5)
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75)
    expect(summary([1, 2, 3]).modes).toEqual([])
    expect(summary([1, 1, 2, 2]).modes).toEqual([])
    expect(summary([5]).s).toBeNull()
  })

  it('fits a line with the errors of slope and intercept', () => {
    const f = linearFit([1, 2, 3, 4, 5], [2.1, 3.9, 6.2, 7.8, 10.1])
    close(f.slope, 1.99, 9)
    close(f.intercept, 0.05, 9)
    close(f.r2, 39.601 / 39.708, 9)
    // s_yx = √(SSE/(n−2)), SE(m) = s_yx/√Sxx, SE(b) = s_yx·√(1/n + x̄²/Sxx)
    const syx = Math.sqrt(0.107 / 3)
    close(f.slopeError, syx / Math.sqrt(10), 6)
    close(f.interceptError, syx * Math.sqrt(1 / 5 + 9 / 10), 6)
    expect(linearFit([0, 1], [1, 3])).toMatchObject({ slope: 2, intercept: 1, slopeError: null })
    expect(() => linearFit([1, 1], [1, 2])).toThrow('vertical')
  })
})

describe('whole numbers', () => {
  it('tells primes', () => {
    expect([1n, 2n, 3n, 4n, 97n, 561n].map(isPrime)).toEqual([false, true, true, false, true, false])
    expect(isPrime(2n ** 61n - 1n)).toBe(true)
    expect(isPrime(2n ** 67n - 1n)).toBe(false)
    expect(isPrime(3317044064679887385961981n)).toBe(false) // strong pseudoprime to the first 13 bases
    expect(nextPrime(100n)).toBe(101n)
    expect(previousPrime(100n)).toBe(97n)
    expect(previousPrime(2n)).toBeNull()
  })

  it('factors numbers', () => {
    expect(factorize(360n).factors).toEqual([[2n, 3], [3n, 2], [5n, 1]])
    expect(factorize(2n ** 67n - 1n).factors).toEqual([[193707721n, 1], [761838257287n, 1]])
    expect(factorize(1n).factors).toEqual([])
    expect(factorize(0n).factors).toEqual([])
    expect(factorize(-12n).factors).toEqual([[2n, 2], [3n, 1]])
  })

  it('counts divisors and φ', () => {
    const f = factorize(36n)
    expect(divisors(f)).toEqual([1n, 2n, 3n, 4n, 6n, 9n, 12n, 18n, 36n])
    expect(divisorCount(f)).toBe(9n)
    expect(divisorSum(f)).toBe(91n)
    expect(totient(36n, f)).toBe(12n)
    expect(totient(1n, factorize(1n))).toBe(1n)
  })

  it('does GCD, LCM and modular arithmetic', () => {
    expect(gcd(84n, -36n)).toBe(12n)
    expect(lcm(4n, 6n)).toBe(12n)
    expect(modPow(4n, 13n, 497n)).toBe(445n)
    expect(modPow(3n, -1n, 7n)).toBe(5n)
    expect(modInverse(3n, 7n)).toBe(5n)
    expect(() => modInverse(4n, 8n)).toThrow('share the factor 4')
  })

  it('reads whole-number expressions', () => {
    expect(evaluateInteger('2^64 − 1')).toBe(18446744073709551615n)
    expect(evaluateInteger('20!')).toBe(2432902008176640000n)
    expect(evaluateInteger('(3·10^2 + 7) / 307')).toBe(1n)
    expect(evaluateInteger('0xFF')).toBe(255n)
    expect(evaluateInteger('-2^2')).toBe(-4n)
    expect(() => evaluateInteger('7/2')).toThrow('not exact')
    expect(() => evaluateInteger('2^10000000')).toThrow('too large')
    expect(parseIntegers('12 18, 2^3; 30')).toEqual([12n, 18n, 8n, 30n])
  })
})
