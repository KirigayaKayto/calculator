import { ComputeEngine } from '@cortex-js/compute-engine'
import type { CasAnswer, CasRequest, CasValue } from './protocol'

const ce = new ComputeEngine()
// digits of the decimal approximations we hand back; the calculator rounds them for display
ce.precision = 40

/** An error whose message the person should see as is. */
class UserError extends Error {}

/** d/dx … evaluated at a point: \left. … \right|_{x=2} */
const AT_POINT = /^\\left\.(.*)\\right\|_\{\s*([a-zA-Z])\s*=\s*(.+)\}$/s

/** Compute Engine writes e^{2x} as \exp(2x); textbooks do not. */
export function exponentials(latex: string): string {
  let out = ''
  let i = 0
  while (i < latex.length) {
    const at = latex.indexOf('\\exp(', i)
    if (at < 0) break
    let depth = 0
    let end = at + 4
    for (; end < latex.length; end++) {
      if (latex[end] === '(') depth++
      else if (latex[end] === ')' && --depth === 0) break
    }
    out += latex.slice(i, at) + `\\exponentialE^{${latex.slice(at + 5, end)}}`
    i = end + 1
  }
  return out + latex.slice(i)
}

/** "0.(3)" — Compute Engine's repeating decimals — written out to 40 digits. */
function expandRepeating(num: string): string {
  const m = /^(-?\d*\.?\d*)\((\d+)\)$/.exec(num)
  if (!m) return num
  let s = m[1].includes('.') ? m[1] : m[1] + '.'
  while (s.length < 44) s += m[2]
  return s
}

type Boxed = NonNullable<ReturnType<typeof ce.parse>>

/** The decimal value of an expression, or null when it is not a plain real number. */
function approx(expr: Boxed): string | null {
  const n = expr.N()
  let json = n.json as unknown
  // numeric integrals come back as value ± error estimate
  if (Array.isArray(json) && (json[0] === 'Measurement' || json[0] === 'PlusMinus')) json = json[1]
  if (typeof json === 'number') return Number.isFinite(json) ? String(json) : null
  if (json && typeof json === 'object' && 'num' in json) return expandRepeating(String((json as { num: string }).num))
  return null
}

function value(expr: Boxed): CasValue {
  return { exact: exponentials(expr.latex), approx: approx(expr) }
}

function valueAnswer(expr: Boxed): CasAnswer {
  const v = value(expr)
  return { kind: 'value', symbolic: v.approx === null && expr.unknowns.length > 0, ...v }
}

function solve(equation: Boxed, solveFor?: string): CasAnswer {
  const unknowns = [...equation.unknowns]
  const variable = solveFor ?? (unknowns.length === 1 ? unknowns[0] : null)
  if (!variable) return { kind: 'choose', variables: unknowns }
  const roots = equation.solve(variable)
  if (!roots || !Array.isArray(roots)) return { kind: 'solutions', variable, solutions: [] }
  // one equation in one unknown gives expressions (systems give records, not handled here)
  const values = (roots as unknown[]).filter((r): r is Boxed => typeof (r as Boxed)?.latex === 'string')
  return { kind: 'solutions', variable, solutions: values.map(value) }
}

function evaluate({ latex, angle, vars, solveFor }: Omit<CasRequest, 'id'>): CasAnswer {
  if (latex.includes('\\placeholder')) throw new UserError('Fill in the empty boxes')
  ce.angularUnit = angle
  for (const [name, v] of Object.entries(vars ?? {})) ce.assign(name, ce.parse(v))

  const at = AT_POINT.exec(latex)
  if (at) {
    const inner = ce.parse(at[1]).evaluate()
    return valueAnswer(inner.subs({ [at[2]]: ce.parse(at[3]) }).evaluate())
  }

  const parsed = ce.parse(latex)
  if (!parsed.isValid) throw new UserError('Syntax error')
  if (parsed.operator === 'Equal' && parsed.unknowns.length) return solve(parsed, solveFor)

  let result = parsed.evaluate()
  // tidy symbolic answers: x + x → 2x
  if (result.unknowns.length) result = result.simplify()
  return valueAnswer(result)
}

export type CasResult = { ok: true; answer: CasAnswer } | { ok: false; error: string }

/** Evaluate, differentiate, integrate, solve … whatever the LaTeX asks for. Never throws. */
export function casEvaluate(request: Omit<CasRequest, 'id'>): CasResult {
  try {
    return { ok: true, answer: evaluate(request) }
  } catch (err) {
    return { ok: false, error: err instanceof UserError ? err.message : 'Could not solve this' }
  }
}
