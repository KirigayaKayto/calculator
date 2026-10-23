import type { BigNumber } from 'mathjs'
import { math } from './math'
import type { DecimalMark } from './input'

export interface FormatOptions {
  decimal: DecimalMark
  /** Significant digits shown. */
  digits: number
  /** For copying and inserting back: no digit grouping, ASCII minus, no superscripts. */
  plain?: boolean
}

const GROUP = ' ' // narrow no-break space, "1 000 000"
const MINUS = '−'
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
}

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP)
}

export function formatBig(x: BigNumber, { decimal, digits, plain }: FormatOptions): string {
  if (x.isNaN()) throw new Error('Не определено')
  if (!x.isFinite()) throw new Error('Деление на ноль')
  if (x.isZero()) return '0'
  const minus = x.isNegative() ? (plain ? '-' : MINUS) : ''
  const r = x.abs().toSignificantDigits(digits)
  const exp = r.e
  let body: string
  if (exp >= digits || exp < -9) {
    const [mantissa, power] = r.toExponential().split('e')
    const p = String(Number(power))
    const m = mantissa.replace('.', decimal)
    body = plain ? `${m}e${p}` : `${m}×10${[...p].map((c) => SUPERSCRIPT[c]).join('')}`
  } else {
    const [int, frac] = r.toFixed().split('.')
    body = (plain ? int : groupThousands(int)) + (frac ? decimal + frac : '')
  }
  return minus + body
}

const UNIT_NAMES: [RegExp, string][] = [
  [/\bdegC\b/g, '°C'],
  [/\bdegF\b/g, '°F'],
  [/\bdeg\b/g, '°'],
  [/\^2\b/g, '²'],
  [/\^3\b/g, '³'],
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
  units: { unit: { base?: { key: string } } }[]
}

/** Currencies share one dimension whose base is USD (see currency.ts). */
function isMoney(u: UnitLike) {
  return u.units.length === 1 && u.units[0].unit.base?.key === 'USD_STUFF'
}

function formatUnit(u: UnitLike, opts: FormatOptions): string {
  const units = u.formatUnits()
  if (u.value === null) return formatUnitName(units, opts.plain)
  let value = math.bignumber(u.toNumeric(units) as BigNumber)
  if (isMoney(u)) value = value.toDecimalPlaces(2)
  const num = formatBig(value, opts)
  const name = formatUnitName(units, opts.plain)
  return name.startsWith('°') && name !== '°C' && name !== '°F' ? num + name : `${num} ${name}`
}

export function formatValue(v: unknown, opts: FormatOptions): string {
  if (v === undefined || v === null) return ''
  if (math.isBigNumber(v)) return formatBig(v, opts)
  if (typeof v === 'number') return formatBig(math.bignumber(v), opts)
  if (math.isUnit(v)) return formatUnit(v as unknown as UnitLike, opts)
  if (typeof v === 'boolean') return v ? 'истина' : 'ложь'
  if (typeof v === 'function') return 'ƒ'
  if (typeof v === 'string') return v
  if (math.isResultSet(v)) {
    const entries = (v as unknown as { entries: unknown[] }).entries
    return formatValue(entries[entries.length - 1], opts)
  }
  if (math.isMatrix(v) || Array.isArray(v)) {
    const items = (math.isMatrix(v) ? v.toArray() : v) as unknown[]
    return '[' + items.map((i) => formatValue(i, opts)).join('; ') + ']'
  }
  if (math.isComplex(v) || math.isFraction(v)) {
    return math.format(v, { precision: opts.digits }).replace(/\./g, opts.decimal)
  }
  return String(v)
}
