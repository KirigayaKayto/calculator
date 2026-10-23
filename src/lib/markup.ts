import { convertLatexToMarkup } from 'mathlive'
import type { DecimalMark } from '../engine/input'

const cache = new Map<string, string>()

/** A formula drawn the textbook way (static HTML; fonts come from mathlive/fonts.css). */
export function latexMarkup(latex: string): string {
  let html = cache.get(latex)
  if (html === undefined) {
    html = convertLatexToMarkup(latex)
    if (cache.size > 500) cache.clear()
    cache.set(latex, html)
  }
  return html
}

/**
 * A plain answer ("-1234.5", "1,8e19", "5000 м") as LaTeX. `grouped` sets thousands apart
 * for display; the formula field gets them without, so the cursor does not stop inside numbers.
 */
export function numberLatex(plain: string, decimal: DecimalMark, grouped = false): string {
  const m = /^(-?)(\d+)(?:[.,](\d+))?(?:e(-?\d+))?$/.exec(plain)
  if (!m) return `\\text{${plain}}`
  const [, sign, int, frac, exp] = m
  const whole = grouped ? int.replace(/\B(?=(\d{3})+(?!\d))/g, '\\,') : int
  const mark = decimal === ',' ? '{,}' : '.'
  return sign + whole + (frac ? mark + frac : '') + (exp ? `\\cdot10^{${exp}}` : '')
}
