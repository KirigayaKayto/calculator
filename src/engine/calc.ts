import { math, Scope, calculatorFunctions, type Angle } from './math'
import { normalize, closeParens, type DecimalMark } from './input'
import { formatValue, type FormatMode } from './format'
import { latexToExpr } from './latex'
import { CalcError, IncompleteError } from './errors'

export interface CalcSettings {
  angle: Angle
  decimal: DecimalMark
  /** Digits for the number format: significant digits, or decimal places in `fix` mode. */
  digits: number
  format?: FormatMode
  /** 2½ means 2 + ½ (school); otherwise a number before a fraction multiplies it (university). */
  mixedNumbers?: boolean
}

export type CalcResult =
  | { ok: true; value: unknown; text: string; plain: string }
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
  return formatValue(value, { decimal: settings.decimal, digits: settings.digits, mode: settings.format, plain })
}

/** Evaluate one already-normalized expression and format the result. */
export function evaluateNormalized(expr: string, settings: CalcSettings, scope: Scope): CalcResult {
  if (!expr) return { ok: false, error: '' }
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
  return evaluateNormalized(closeParens(normalize(expr, { decimal: '.' })), settings, scope)
}
