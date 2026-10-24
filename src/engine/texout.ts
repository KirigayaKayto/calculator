import type { DecimalMark } from './input'

/** A unit as the engine writes it ("kg m / s^2", "degC", "kohm") in upright LaTeX. */
export function unitLatex(unit: string): string {
  const tex = unit
    .replace(/\bdegC\b/g, '°C')
    .replace(/\bdegF\b/g, '°F')
    .replace(/\bdeg\b/g, '°')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, '\\,')
    // mol^-1 → mol^{-1}
    .replace(/\^(-?\d+)/g, '^{$1}')
    .replace(/ohm\b/g, '\\Omega')
    // the micro prefix: um → µm
    .replace(/(?<![A-Za-z])u(?=[A-Za-z])/g, '\\mu ')
  return `\\mathrm{${tex}}`
}

function oneNumber(text: string, decimal: DecimalMark, grouped: boolean): string | null {
  const m = /^(-?)(\d+)(?:[.,](\d+))?(?:e(-?\d+))?$/.exec(text)
  if (!m) return null
  const [, sign, int, frac, exp] = m
  const whole = grouped ? int.replace(/\B(?=(\d{3})+(?!\d))/g, '\\,') : int
  const mark = decimal === ',' ? '{,}' : '.'
  return sign + whole + (frac ? mark + frac : '') + (exp ? `\\cdot10^{${exp}}` : '')
}

const NUM = String.raw`-?\d+(?:[.,]\d+)?(?:e-?\d+)?`

/** "3+4i", "-2i", "5∠53.13°" as LaTeX, or null when the answer is not complex. */
function complexLatex(plain: string, decimal: DecimalMark, grouped: boolean): string | null {
  const n = (s: string) => oneNumber(s, decimal, grouped)
  let m = new RegExp(`^(${NUM})∠(${NUM})(°)?$`).exec(plain)
  if (m) return `${n(m[1])}\\angle ${n(m[2])}${m[3] ? '^{\\circ}' : ''}`
  m = new RegExp(`^(?:(${NUM})([+-]))?(\\d+(?:[.,]\\d+)?(?:e-?\\d+)?)?i$`).exec(plain)
  if (m && (m[1] !== undefined || m[3] !== undefined || plain === 'i')) {
    const im = (m[3] ? n(m[3]) : '') + 'i'
    return m[1] !== undefined ? `${n(m[1])}${m[2]}${im}` : im
  }
  m = /^-(\d+(?:[.,]\d+)?(?:e-?\d+)?)?i$/.exec(plain)
  if (m) return `-${m[1] ? n(m[1]) : ''}i`
  return null
}

/**
 * A plain answer as LaTeX: "-1234.5", "1.8e19", "5000 m", "6.0±0.5", "10.44±0.05 m / s".
 * `grouped` sets thousands apart for display; the formula field gets them without, so the
 * cursor does not stop inside numbers.
 */
export function numberLatex(plain: string, decimal: DecimalMark, grouped = false): string {
  const complex = complexLatex(plain.trim(), decimal, grouped)
  if (complex) return complex
  const m = /^(\S+)(?:\s+(.+))?$/.exec(plain.trim())
  if (!m) return `\\text{${plain}}`
  const [, number, unit] = m
  const parts = number.split('±').map((n) => oneNumber(n, decimal, grouped))
  if (parts.some((p) => p === null)) return `\\text{${plain}}`
  const body = parts.join('\\pm')
  if (!unit) return body
  return parts.length > 1 ? `\\left(${body}\\right)\\,${unitLatex(unit)}` : `${body}\\,${unitLatex(unit)}`
}
