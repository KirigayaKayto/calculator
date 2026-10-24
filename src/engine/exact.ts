import type { BigNumber } from 'mathjs'
import { math } from './math'

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
  const x = value as BigNumber
  if (!x.isFinite() || x.isInteger()) return null
  const abs = x.abs()
  const [n, d] = abs.toFraction(MAX_DENOMINATOR)
  if (n.div(d).minus(abs).abs().gt(abs.times('1e-45'))) return null
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

/**
 * Show the answer as a fraction when the problem is about fractions (it has a fraction or
 * a division and no decimals), as calculators with textbook display do; otherwise as a decimal.
 */
export function prefersFraction(latex: string): boolean {
  return /\\frac|\\div|:|\//.test(latex) && !/\d\.\d|\{,\}/.test(latex)
}
