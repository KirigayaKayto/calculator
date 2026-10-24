import { math } from './math'
import { normalize, closeParens } from './input'
import { newScope, evaluateNormalized, type CalcSettings } from './calc'

export type LineResult =
  | { kind: 'empty' | 'text' }
  | { kind: 'value'; text: string; plain: string }
  | { kind: 'error'; error: string }

const SUM_NAMES = ['total', 'subtotal']
const PREV_NAMES = ['prev']

/** "Rent: 30 000" — the text before the colon is a label. */
const LABEL = /^\s*(\p{L}[^:=]*?):\s*(.*)$/u
const ASSIGNMENT = /^\s*([\p{L}_$][\p{L}\d_$]*)\s*=(?!=)/u
const OPERATOR = /[-+*/^=(,%!]/

function stripComment(line: string) {
  const i = line.search(/#|\/\//)
  return i >= 0 ? line.slice(0, i) : line
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function wordRegExp(name: string) {
  return new RegExp(`(?<![\\p{L}\\d_$])${escapeRegExp(name)}(?![\\p{L}\\d_$])`, 'u')
}

function mentions(expr: string, name: string) {
  return wordRegExp(name).test(expr)
}

/**
 * "5 apples", "Rent 30000": drop an unknown word if it is just text next to a number.
 * A word next to an operator ("x + 1") is a real operand, so it stays and the error is shown.
 */
function dropTextWord(expr: string, name: string): string | null {
  const m = wordRegExp(name).exec(expr)
  if (!m) return null
  const before = expr.slice(0, m.index).trimEnd()
  const after = expr.slice(m.index + name.length).trimStart()
  if (OPERATOR.test(before.slice(-1)) || OPERATOR.test(after.charAt(0)) || after.startsWith(')')) return null
  return `${before} ${after}`.trim()
}

function sum(values: unknown[]): unknown {
  if (!values.length) return math.bignumber(0)
  try {
    return values.reduce((a, b) => math.add(a as never, b as never))
  } catch {
    return undefined
  }
}

export function evaluateNotebook(src: string, settings: CalcSettings): LineResult[] {
  const scope = newScope(settings.angle)
  const userNames = new Set<string>()
  let block: unknown[] = []
  let prev: unknown

  return src.split('\n').map((line): LineResult => {
    let expr = stripComment(line).trim()
    const label = expr.match(LABEL)
    if (label) expr = label[2].trim()
    if (!expr) {
      // an empty line or a heading starts a new block for "total"
      if (!line.trim() || label) block = []
      return { kind: 'empty' }
    }

    const total = sum(block)
    for (const n of SUM_NAMES) {
      if (userNames.has(n)) continue
      if (total === undefined) scope.delete(n)
      else scope.set(n, total)
    }
    for (const n of PREV_NAMES) {
      if (userNames.has(n)) continue
      if (prev === undefined) scope.delete(n)
      else scope.set(n, prev)
    }

    let attempt = normalize(expr, { decimal: settings.decimal })
    let result = evaluateNormalized(closeParens(attempt), settings, scope)
    for (let i = 0; i < 8 && !result.ok && result.unknown; i++) {
      const next = dropTextWord(attempt, result.unknown)
      if (!next) break
      attempt = next
      result = evaluateNormalized(closeParens(attempt), settings, scope)
    }

    if (!result.ok) {
      // plain text without numbers is just a note
      return /\d/.test(expr) && result.error ? { kind: 'error', error: result.error } : { kind: 'text' }
    }
    const assigned = attempt.match(ASSIGNMENT)
    if (assigned) userNames.add(assigned[1])
    if (typeof result.value !== 'function') {
      // a line that uses "total" is itself a total and is not added to the next one
      const usesTotal = SUM_NAMES.some((n) => !userNames.has(n) && mentions(attempt, n))
      if (!usesTotal) block.push(result.value)
      prev = result.value
    }
    return { kind: 'value', text: result.text, plain: result.plain }
  })
}
