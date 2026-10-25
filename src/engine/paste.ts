import type { DecimalMark } from './input'

/**
 * Text pasted from another app (a bank, a messenger, a spreadsheet, a web page), made into
 * something the calculator reads: numbers lose their thousands separators and get a decimal
 * point (1 234,56 · 1,234.56 · 1.234,56 · 1’234.56 → 1234.56), currency signs go, and
 * × − ² ⁻³ 1e-5 become * - ^2 ^(-3) 1*10^(-5). The result is ASCII math with decimal points.
 */
export interface Pasted {
  text: string
  /** The text was words around a number ("Total: 1 234,56 ₽"): only the number was kept. */
  extracted: boolean
}

/** What people put between thousands: spaces of every width, apostrophes (Swiss style). */
const GROUP = "[ \\u00a0\\u202f\\u2009'’]"
const NUMBER_SOURCE = `(?:\\d{1,3}(?:${GROUP}\\d{3})+|\\d+)(?:[.,]\\d+)*(?:[eE][+\\-−]?\\d+)?`
const NUMBER = new RegExp(NUMBER_SOURCE, 'g')
/** A number in prose, with its minus when the minus stands right before it ("−15 °C", not "A-15"). */
const SIGNED_NUMBER = new RegExp(`(?:(?<![\\p{L}\\d])[-−–](?=\\d))?${NUMBER_SOURCE}`, 'u')

const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+',
}

/** Words a formula may contain; any other word means the text is prose around a number. */
const MATH_WORDS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan',
  'arcsin', 'arccos', 'arctan', 'ln', 'log', 'lg', 'exp', 'sqrt', 'abs', 'mod', 'pi', 'floor', 'ceil',
  'deg', 'rad', 'mol', 'min', 'atm', 'bar', 'psi', 'rpm', 'cal', 'kcal', 'inch', 'mph', 'kwh',
])

/**
 * One number as written somewhere, with a decimal point and no grouping.
 * A lone comma is the decimal mark, except in "1,234" when the app itself uses a point.
 */
export function cleanNumber(token: string, decimal: DecimalMark): string {
  const m = /^(.*?)(?:[eE]([+\-−]?\d+))?$/.exec(token)!
  const mantissa = m[1]
  const spaced = new RegExp(GROUP).test(mantissa)
  const s = mantissa.replace(new RegExp(GROUP, 'g'), '')
  const separators = s.replace(/\d/g, '')
  let point = -1
  if (separators) {
    const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
    const digitsAfter = s.length - last - 1
    if (new Set(separators).size === 2) point = last // 1,234.56 and 1.234,56
    else if (separators.length > 1) point = digitsAfter === 3 ? -1 : last // 1,234,567
    else if (s[last] === '.') point = last
    else point = !spaced && digitsAfter === 3 && decimal === '.' && /^[1-9]\d{0,2},/.test(s) ? -1 : last
  }
  const digits = (from: number, to?: number) => s.slice(from, to).replace(/[.,]/g, '')
  const number = point < 0 ? digits(0) : `${digits(0, point) || '0'}.${digits(point + 1)}`
  return m[2] ? `${number}*10^(${m[2].replace('−', '-')})` : number
}

export function readPasted(raw: string, decimal: DecimalMark): Pasted | null {
  let s = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[$€£¥₽₸₴₹¢]/g, '')
    .trim()
  if (!s) return null

  // prose around a number: keep the first number (Greek letters are symbols, not words)
  const words = s.replace(/[Ͱ-Ͽ]/g, ' ').match(/\p{L}{2,}/gu) ?? []
  const prose = words.some((w) => /[^\p{ASCII}]/u.test(w) || (w.length > 2 && !MATH_WORDS.has(w.toLowerCase())))
  if (prose) {
    const first = SIGNED_NUMBER.exec(s)?.[0]
    if (!first) return null
    const negative = /^[-−–]/.test(first)
    return { text: (negative ? '-' : '') + cleanNumber(first.replace(/^[-−–]/, ''), decimal), extracted: true }
  }

  s = s
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (run) => {
      const plain = [...run].map((c) => SUPERSCRIPTS[c]).join('')
      return /^\d$/.test(plain) ? `^${plain}` : `^(${plain})`
    })
    .replace(/[×·⋅∙✕]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/π/g, ' pi ')
    .replace(/√/g, ' sqrt')
    .replace(/[=≈]\s*$/, '')
    .replace(NUMBER, (token) => cleanNumber(token, decimal))
    // 10^-3 → 10^(-3): a signed power keeps its sign
    .replace(/\^\s*([+-]\d+(?:\.\d+)?)/g, '^($1)')
    .replace(/\s+/g, ' ')
    .trim()
  return s ? { text: s, extracted: false } : null
}

/** The pasted text for a plain input field of the app (the converter): its decimal mark. */
export function pastedForInput(p: Pasted, decimal: DecimalMark): string {
  return decimal === ',' ? p.text.replace(/(\d)\.(\d)/g, '$1,$2') : p.text
}

/** Finish LaTeX made from the pasted text: ×10ⁿ as the key writes it, and the app's decimal mark. */
export function polishLatex(latex: string, decimal: DecimalMark): string {
  const s = latex.replace(/(\d)\s*\\cdot\s*10\^\{/g, '$1\\times10^{')
  return decimal === ',' ? s.replace(/(\d)\.(\d)/g, '$1{,}$2') : s
}
