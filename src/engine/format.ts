import type { BigNumber } from 'mathjs'
import { math } from './math'
import { CalcError } from './errors'
import type { DecimalMark } from './input'

/**
 * auto — up to `digits` significant digits, scientific only for huge or tiny numbers;
 * fix — `digits` decimal places; sci — scientific with `digits` significant figures;
 * eng — like sci but the exponent is a multiple of 3; sig — `digits` significant figures;
 * lab — significant figures by the lab rules (see lab.ts), written like sig.
 */
export type FormatMode = 'auto' | 'fix' | 'sci' | 'eng' | 'sig' | 'lab'

export interface FormatOptions {
  decimal: DecimalMark
  digits: number
  mode?: FormatMode
  /** For copying and inserting back: no digit grouping, ASCII minus, "e" exponent. */
  plain?: boolean
  /** Complex answers as a + bi or r∠θ (θ in `angle`). */
  complex?: 'rect' | 'polar'
  angle?: 'deg' | 'rad'
}

const GROUP = ' ' // narrow no-break space, "1 000 000"
const MINUS = '−'
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
}

/** Digits and a minus sign raised: "-12" → "⁻¹²". */
export function superscript(text: string): string {
  return [...text].map((c) => SUPERSCRIPT[c] ?? c).join('')
}

function fixedText(s: string, { decimal, plain }: FormatOptions): string {
  const [int, frac] = s.split('.')
  const whole = plain ? int : int.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP)
  return whole + (frac ? decimal + frac : '')
}

function scientificText(mantissa: string, power: number, opts: FormatOptions): string {
  const m = mantissa.replace('.', opts.decimal)
  if (opts.plain) return `${m}e${power}`
  return `${m}×10${superscript(String(power))}`
}

/** Scientific notation with `sig` significant figures, trailing zeros kept: 2.50×10³. */
function scientific(a: BigNumber, sig: number, opts: FormatOptions): string {
  const [mantissa, power] = a.toExponential(Math.max(0, sig - 1)).split('e')
  return scientificText(mantissa, Number(power), opts)
}

function engineering(a: BigNumber, sig: number, opts: FormatOptions): string {
  let power = Math.floor(a.e / 3) * 3
  let m = a.div(math.bignumber(10).pow(power)).toSignificantDigits(sig)
  if (m.gte(1000)) {
    power += 3
    m = m.div(1000).toSignificantDigits(sig)
  }
  const intDigits = m.e + 1
  const mantissa = m.toFixed(Math.max(0, sig - intDigits))
  return power === 0 ? fixedText(mantissa, opts) : scientificText(mantissa, power, opts)
}

function auto(a: BigNumber, digits: number, opts: FormatOptions): string {
  const r = a.toSignificantDigits(digits)
  if (r.e >= digits || r.e < -9) return scientificText(r.toExponential().split('e')[0], r.e, opts)
  return fixedText(r.toFixed(), opts)
}

export function formatBig(x: BigNumber, opts: FormatOptions): string {
  if (x.isNaN()) throw new CalcError('Undefined')
  if (!x.isFinite()) throw new CalcError('Division by zero')
  const { digits, mode = 'auto' } = opts
  const minus = x.isNegative() && !x.isZero() ? (opts.plain ? '-' : MINUS) : ''
  const a = x.abs()
  if (a.isZero()) return mode === 'fix' ? fixedText((0).toFixed(digits), opts) : '0'
  switch (mode) {
    case 'fix': {
      const r = a.toDecimalPlaces(digits)
      // like any calculator: what would show as 0.00 or need 16+ digits goes scientific
      if (r.isZero() || a.gte(1e15)) return minus + scientific(a, Math.max(digits, 3), opts)
      return minus + fixedText(r.toFixed(digits), opts)
    }
    case 'sci':
      return minus + scientific(a, digits, opts)
    case 'eng':
      return minus + engineering(a, digits, opts)
    case 'sig': {
      const r = a.toSignificantDigits(digits)
      // more whole digits than significant ones (4700 at 2 s.f.) would hide which zeros count
      if (r.e >= digits || r.e < -4) return minus + scientific(a, digits, opts)
      return minus + fixedText(r.toFixed(Math.max(0, digits - 1 - r.e)), opts)
    }
    default:
      return minus + auto(a, digits, opts)
  }
}

const UNIT_NAMES: [RegExp, string][] = [
  [/\bdegC\b/g, '°C'],
  [/\bdegF\b/g, '°F'],
  [/\bdeg\b/g, '°'],
  [/\^2\b/g, '²'],
  [/\^3\b/g, '³'],
  [/\*/g, '·'],
  // micro: um, us, uT, uSv → µm, µs, µT, µSv (u alone is the atomic mass unit)
  [/\bu(?=[A-Z]|[msgL]\b)/g, 'µ'],
]

export function formatUnitName(name: string, plain?: boolean): string {
  if (plain) return name
  let s = name
  for (const [re, to] of UNIT_NAMES) s = s.replace(re, to)
  return s
}

interface UnitLike {
  formatUnits(): string
  toNumeric(unit?: string): unknown
  value: unknown
}

function formatUnit(u: UnitLike, opts: FormatOptions): string {
  const units = u.formatUnits()
  if (u.value === null) return formatUnitName(units, opts.plain)
  const num = formatBig(math.bignumber(u.toNumeric(units) as BigNumber), opts)
  const name = formatUnitName(units, opts.plain)
  return name.startsWith('°') && name !== '°C' && name !== '°F' ? num + name : `${num} ${name}`
}

export function formatValue(v: unknown, opts: FormatOptions): string {
  if (v === undefined || v === null) return ''
  if (math.isBigNumber(v)) return formatBig(v, opts)
  if (typeof v === 'number') return formatBig(math.bignumber(v), opts)
  if (math.isUnit(v)) return formatUnit(v as unknown as UnitLike, opts)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'function') return 'ƒ'
  if (typeof v === 'string') return v
  if (math.isResultSet(v)) {
    const entries = (v as unknown as { entries: unknown[] }).entries
    return formatValue(entries[entries.length - 1], opts)
  }
  if (math.isMatrix(v) || Array.isArray(v)) {
    const items = (math.isMatrix(v) ? v.toArray() : v) as unknown[]
    return '[' + items.map((i) => formatValue(i, opts)).join(', ') + ']'
  }
  if (math.isComplex(v)) return formatComplex(v as unknown as { re: number; im: number }, opts)
  if (math.isFraction(v)) return math.format(v, { precision: opts.digits }).replace(/\./g, opts.decimal)
  return String(v)
}

/** 3 + 4i, or 5∠53.13° in polar form. Rounding noise (1e-16 i) is dropped. */
function formatComplex(z: { re: number; im: number }, opts: FormatOptions): string {
  const size = Math.hypot(z.re, z.im)
  const clean = (x: number) => (Math.abs(x) < size * 1e-14 ? 0 : x)
  const re = clean(z.re)
  const im = clean(z.im)
  const num = (x: number) => formatBig(math.bignumber(x), opts)
  if (opts.complex === 'polar') {
    const deg = opts.angle !== 'rad'
    const theta = Math.atan2(im, re) * (deg ? 180 / Math.PI : 1)
    return `${num(size)}∠${num(theta)}${deg ? '°' : ''}`
  }
  if (im === 0) return num(re)
  const minus = opts.plain ? '-' : '−'
  const imPart = Math.abs(im) === 1 ? 'i' : `${num(Math.abs(im))}i`
  if (re === 0) return (im < 0 ? minus : '') + imPart
  return opts.plain ? `${num(re)}${im < 0 ? '-' : '+'}${imPart}` : `${num(re)} ${im < 0 ? minus : '+'} ${imPart}`
}
