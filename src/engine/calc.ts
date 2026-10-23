import { math, Scope, calculatorFunctions, type Angle } from './math'
import { normalize, closeParens, type DecimalMark } from './input'
import { formatValue } from './format'

export interface CalcSettings {
  angle: Angle
  decimal: DecimalMark
  digits: number
}

export type CalcResult =
  | { ok: true; value: unknown; text: string; plain: string }
  /** `unknown` is the name of an undefined symbol, if that is what failed. */
  | { ok: false; error: string; unknown?: string }

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
  [/^Undefined (?:symbol|function) (.+)$/, (m) => `Неизвестно: ${m[1]}`],
  [/^Unexpected end of expression/, () => 'Выражение не закончено'],
  [/^Units do not match|^Cannot convert|do not match/, () => 'Несовместимые единицы'],
  [/^Parenthesis \) expected/, () => 'Не хватает скобки'],
  [/^Value expected/, () => 'Пропущено число'],
  [/^Unexpected operator|^Syntax error|^Unexpected type of argument|^Invalid/, () => 'Ошибка в выражении'],
  [/^Too many arguments|^Too few arguments/, () => 'Неверное число аргументов'],
]

export function translateError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  for (const [re, make] of ERRORS) {
    const m = message.match(re)
    if (m) return make(m)
  }
  // our own errors are already in Russian
  return /^[А-ЯЁ]/.test(message) ? message : 'Ошибка в выражении'
}

export function format(value: unknown, settings: CalcSettings, plain = false): string {
  return formatValue(value, { decimal: settings.decimal, digits: settings.digits, plain })
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

/** Evaluate what the person typed in the calculator field. */
export function calculate(input: string, settings: CalcSettings, scope = newScope(settings.angle)): CalcResult {
  const expr = closeParens(normalize(input, { decimal: settings.decimal }))
  return evaluateNormalized(expr, settings, scope)
}
