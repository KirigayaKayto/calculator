import { math, Scope, calculatorFunctions, useComplexNumbers, type Angle } from './math'
import { normalize, closeParens, type DecimalMark } from './input'
import { formatValue, formatUnitName, type FormatMode } from './format'
import { latexToExpr } from './latex'
import { CalcError, IncompleteError } from './errors'
import { labSignificantFigures, evaluateUncertain, roundMeasurement } from './lab'
import { numberLatex } from './texout'

export interface CalcSettings {
  angle: Angle
  decimal: DecimalMark
  /** Digits for the number format: significant digits, or decimal places in `fix` mode. */
  digits: number
  format?: FormatMode
  /** 2½ means 2 + ½ (school); otherwise a number before a fraction multiplies it (university). */
  mixedNumbers?: boolean
  /** Off: √−1 is an error. Otherwise complex answers as a + bi or r∠θ. */
  complex?: 'off' | 'rect' | 'polar'
}

export type CalcResult =
  /**
   * `latex` is set when the answer needs more than a number to be shown (2.50 ± 0.02 m);
   * `note` is a remark to show next to it ("3 s.f.", "±1.2 %").
   */
  | { ok: true; value: unknown; text: string; plain: string; latex?: string; note?: string }
  /**
   * `unknown` is the name of an undefined symbol, if that is what failed;
   * `incomplete` means the formula still has empty boxes.
   */
  | { ok: false; error: string; unknown?: string; incomplete?: boolean }

const scopeBases = new Map<Angle, Map<string, unknown>>()

export function newScope(angle: Angle): Scope {
  let base = scopeBases.get(angle)
  if (!base) {
    base = calculatorFunctions(angle)
    scopeBases.set(angle, base)
  }
  return new Scope(base)
}

const ERRORS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Undefined symbol (.+)$/, (m) => `Undefined variable: ${m[1]}`],
  [/^Undefined function (.+)$/, (m) => `Undefined function: ${m[1]}`],
  [/^Unexpected end of expression/, () => 'Incomplete expression'],
  [/^Units do not match|^Cannot convert|do not match/, () => 'Units do not match'],
  [/^Parenthesis \) expected/, () => 'Missing parenthesis'],
  [/^Value expected/, () => 'Missing number'],
  [/^Too many arguments|^Too few arguments/, () => 'Wrong number of arguments'],
  [/^Dimension mismatch/, () => 'Sizes do not match'],
]

export function translateError(e: unknown): string {
  if (e instanceof CalcError) return e.message
  const message = e instanceof Error ? e.message : String(e)
  for (const [re, make] of ERRORS) {
    const m = message.match(re)
    if (m) return make(m)
  }
  return 'Syntax error'
}

export function format(value: unknown, settings: CalcSettings, plain = false): string {
  return formatValue(value, {
    decimal: settings.decimal,
    digits: settings.digits,
    mode: settings.format,
    plain,
    complex: settings.complex === 'polar' ? 'polar' : 'rect',
    angle: settings.angle,
  })
}

/** Evaluate one already-normalized expression and format the result. */
export function evaluateNormalized(expr: string, settings: CalcSettings, scope: Scope): CalcResult {
  if (!expr) return { ok: false, error: '' }
  useComplexNumbers(!!settings.complex && settings.complex !== 'off')
  try {
    const value = math.evaluate(expr, scope)
    if (value === undefined) return { ok: false, error: '' }
    return { ok: true, value, text: format(value, settings), plain: format(value, settings, true) }
  } catch (e) {
    const unknown = e instanceof Error ? e.message.match(/^Undefined symbol (.+)$/)?.[1] : undefined
    return { ok: false, error: translateError(e), unknown }
  }
}

/** Evaluate a line of text: the notes and the converter fields. */
export function calculate(input: string, settings: CalcSettings, scope = newScope(settings.angle)): CalcResult {
  const expr = closeParens(normalize(input, { decimal: settings.decimal }))
  return evaluateNormalized(expr, settings, scope)
}

/**
 * Evaluate the textbook-style calculator field (LaTeX). `prefix` is prepended to the converted
 * expression: the calculator uses it to continue from the exact previous answer.
 */
export function calculateLatex(
  latex: string,
  settings: CalcSettings,
  scope = newScope(settings.angle),
  prefix = '',
): CalcResult {
  let expr: string
  try {
    expr = prefix + latexToExpr(latex, { mixedNumbers: settings.mixedNumbers })
  } catch (e) {
    return { ok: false, error: translateError(e), incomplete: e instanceof IncompleteError }
  }
  // LaTeX already spells the decimal comma as {,}, so here "," only separates arguments
  const normalized = closeParens(normalize(expr, { decimal: '.' }))
  if (normalized.includes('±')) return evaluateMeasurement(normalized, settings, scope)
  const r = evaluateNormalized(normalized, settings, scope)
  if (!r.ok || settings.format !== 'lab') return r
  try {
    const sf = labSignificantFigures(normalized, scope)
    if (sf === null) return r
    const lab = { ...settings, format: 'sig' as const, digits: sf }
    return { ...r, text: format(r.value, lab), plain: format(r.value, lab, true), note: `${sf} s.f.` }
  } catch {
    return r
  }
}

/** "2.50 ± 0.02": the answer with its propagated uncertainty, rounded the usual way. */
function evaluateMeasurement(expr: string, settings: CalcSettings, scope: Scope): CalcResult {
  try {
    const u = evaluateUncertain(expr, scope)
    const r = roundMeasurement(u.center, u.sigma)
    const mark = (s: string) => s.replace('.', settings.decimal)
    const unit = u.unit ? formatUnitName(u.unit) : ''
    const plain = `${mark(r.center)}±${mark(r.sigma)}${u.unit ? ' ' + u.unit : ''}`
    const relative = u.center.isZero() ? null : u.sigma.div(u.center.abs()).times(100).toSignificantDigits(2)
    return {
      ok: true,
      value: u.value,
      text: unit ? `(${mark(r.center)} ± ${mark(r.sigma)}) ${unit}` : `${mark(r.center)} ± ${mark(r.sigma)}`,
      plain,
      latex: numberLatex(plain, settings.decimal),
      note: relative ? `±${mark(relative.toString())} %` : undefined,
    }
  } catch (e) {
    return { ok: false, error: translateError(e) }
  }
}
