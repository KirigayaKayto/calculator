/**
 * The graph worksheet: each line is a formula, as in Desmos. This module works out what every
 * line is (a curve, a function, a slider…) and turns it into numbers and functions to draw.
 */
import { latexToExpr } from '../engine/latex'
import { closeParens, normalize } from '../engine/input'
import { translateError } from '../engine/calc'
import { compile, symbolsOf, baseScope, Layer, integrate, derivative, secondDerivative, fmath, type ScopeLike } from './numeric'

export interface Line {
  id: string
  latex: string
  color: string
  hidden?: boolean
  /** The range of a slider line (a = 1). */
  slider?: { min: number; max: number; step: number }
}

export type Relation = '<' | '>' | '<=' | '>='
type Fn = (t: number) => number

export type Item =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'value'; value: number }
  | { kind: 'variable'; name: string; value: number; slider: boolean }
  | { kind: 'function'; name: string; param: string; f: Fn | null }
  /** y = f(x), or x = f(y) when axis is 'x'; with a relation it is an inequality. */
  | { kind: 'curve'; axis: 'x' | 'y'; f: Fn; relation?: Relation }
  | { kind: 'implicit'; f: (x: number, y: number) => number }
  | { kind: 'point'; x: number; y: number }
  | { kind: 'parametric'; x: Fn; y: Fn; range: [number, number] }
  | { kind: 'polar'; r: Fn; range: [number, number] }
  /** ∫ₐᵇ f(x) dx: its value, and the area to shade. */
  | { kind: 'integral'; value: number; f: Fn; a: number; b: number }

export interface Worksheet {
  items: Item[]
  /** Letters used but never defined: the worksheet offers a slider for each. */
  missing: string[]
}

/** Built-in names that are never "missing". */
const KNOWN = new Set(['x', 'y', 't', 'theta', 'r', 'e', 'pi', 'i', 'Infinity', 'E', 'PI'])

interface Split {
  lhs: string
  op: '=' | Relation
  rhs: string
}

/** Split "lhs = rhs" (or <, >, ≤, ≥) at the top level, outside any parentheses. */
export function splitRelation(expr: string): Split | null {
  let depth = 0
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (depth === 0) {
      const two = expr.slice(i, i + 2)
      if (two === '<=' || two === '>=') return { lhs: expr.slice(0, i).trim(), op: two, rhs: expr.slice(i + 2).trim() }
      if (c === '=' && expr[i + 1] !== '=') return { lhs: expr.slice(0, i).trim(), op: '=', rhs: expr.slice(i + 1).trim() }
      if (c === '<' || c === '>') return { lhs: expr.slice(0, i).trim(), op: c, rhs: expr.slice(i + 1).trim() }
    }
  }
  return null
}

/** "(a, b)" → ["a", "b"], when the outer parentheses hold a pair. */
function splitPair(expr: string): [string, string] | null {
  const s = expr.trim()
  if (!s.startsWith('(') || !s.endsWith(')')) return null
  let depth = 0
  let comma = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') {
      depth--
      if (depth === 0 && i < s.length - 1) return null
    } else if (c === ',' && depth === 1) {
      if (comma >= 0) return null
      comma = i
    }
  }
  return comma < 0 ? null : [s.slice(1, comma).trim(), s.slice(comma + 1, -1).trim()]
}

const FUNCTION_DEF = /^([A-Za-z]\w*)\s*\(\s*([A-Za-z]\w*)\s*\)$/
const NAME = /^[A-Za-z]\w*$/
const FLIP: Record<Relation, Relation> = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' }

type Parsed = { expr: string; split: Split | null } | { error: string }

function parse(latex: string): Parsed {
  try {
    const expr = closeParens(normalize(latexToExpr(latex, { splitLetters: true }), { decimal: '.' }))
    return { expr, split: splitRelation(expr) }
  } catch (e) {
    return { error: translateError(e) }
  }
}

export function evaluateWorksheet(lines: Line[]): Worksheet {
  const parsed = lines.map((l) => (l.latex.trim() ? parse(l.latex) : null))
  const scope = baseScope()
  const helpers = new Map<string, unknown>()
  const defined = new Set<string>()
  const used = new Set<string>()

  // ---- definitions: functions first (they can be used anywhere), then variables ----

  const functions = new Map<number, { name: string; param: string; body: ReturnType<typeof compile> }>()
  const variables = new Map<number, { name: string; body: ReturnType<typeof compile>; literal: boolean }>()
  const errors = new Map<number, string>()

  parsed.forEach((p, i) => {
    if (!p || 'error' in p || p.split?.op !== '=') return
    const { lhs, rhs } = p.split
    try {
      const fd = FUNCTION_DEF.exec(lhs)
      if (fd && !['x', 'y', 'r'].includes(fd[1])) {
        functions.set(i, { name: fd[1], param: fd[2], body: compile(rhs, helpers) })
        defined.add(fd[1])
        symbolsOf(rhs).forEach((s) => s !== fd[2] && used.add(s))
      } else if (NAME.test(lhs) && !['x', 'y', 'r'].includes(lhs) && !symbolsOf(rhs).has(lhs)) {
        variables.set(i, { name: lhs, body: compile(rhs, helpers), literal: /^-?\d+(\.\d+)?$/.test(rhs) })
        defined.add(lhs)
        symbolsOf(rhs).forEach((s) => used.add(s))
      }
    } catch (e) {
      errors.set(i, translateError(e))
    }
  })

  for (const { name, param, body } of functions.values()) {
    const f = (v: number) => Number(body.evaluate(new Layer(scope, param, v)))
    scope.set(name, f)
    // f′ and f″, written f'(x) and f''(x)
    scope.set(`${name}__prime`, (v: number) => derivative(f, v))
    scope.set(`${name}__prime__prime`, (v: number) => secondDerivative(f, v))
    defined.add(`${name}__prime`).add(`${name}__prime__prime`)
  }

  // variables may depend on each other in any order: settle them in a few passes
  const values = new Map<number, number>()
  for (let pass = 0; pass <= variables.size; pass++) {
    let progress = false
    for (const [i, v] of variables) {
      if (values.has(i)) continue
      try {
        const value = Number(v.body.evaluate(scope))
        if (Number.isNaN(value)) continue
        values.set(i, value)
        scope.set(v.name, value)
        progress = true
      } catch {
        // depends on a variable not known yet
      }
    }
    if (!progress) break
  }

  for (const [id, make] of helpers) scope.set(id, (make as (s: ScopeLike) => unknown)(scope))

  // ---- what each line is ----

  const fnOf = (expr: string, variable: string): Fn => {
    const code = compile(expr, helpers)
    for (const [id, make] of helpers) if (!scope.has(id)) scope.set(id, (make as (s: ScopeLike) => unknown)(scope))
    const layer = new Layer(scope, variable, 0)
    return (t) => {
      layer.value = t
      return Number(code.evaluate(layer))
    }
  }
  const valueOf = (expr: string) => {
    const code = compile(expr, helpers)
    for (const [id, make] of helpers) if (!scope.has(id)) scope.set(id, (make as (s: ScopeLike) => unknown)(scope))
    return Number(code.evaluate(scope))
  }
  /** What is drawn gives no points, instead of failing, while a name has no value yet (y = kx before k). */
  const drawn = (f: Fn): Fn => (t) => {
    try {
      return f(t)
    } catch {
      return NaN
    }
  }

  const items = parsed.map((p, i): Item => {
    if (!p) return { kind: 'empty' }
    if ('error' in p) return { kind: 'error', message: p.error }
    if (errors.has(i)) return { kind: 'error', message: errors.get(i)! }
    try {
      const fd = functions.get(i)
      if (fd) {
        return { kind: 'function', name: fd.name, param: fd.param, f: fd.param === 'x' ? drawn(scope.get(fd.name) as Fn) : null }
      }
      const v = variables.get(i)
      if (v) {
        const value = values.get(i)
        if (value === undefined) return { kind: 'error', message: 'Depends on something undefined' }
        return { kind: 'variable', name: v.name, value, slider: v.literal }
      }

      const { expr, split } = p
      const note = (e: string) => symbolsOf(e).forEach((s) => used.add(s))
      if (split) {
        const { lhs, op, rhs } = split
        note(lhs)
        note(rhs)
        if (op === '=') {
          if (lhs === 'y' && !symbolsOf(rhs).has('y')) return { kind: 'curve', axis: 'y', f: drawn(fnOf(rhs, 'x')) }
          if (lhs === 'x' && !symbolsOf(rhs).has('x')) return { kind: 'curve', axis: 'x', f: drawn(fnOf(rhs, 'y')) }
          if (lhs === 'r') return { kind: 'polar', r: drawn(fnOf(rhs, 'theta')), range: [0, 2 * Math.PI] }
          // anything else with "=" is an implicit curve: F(x, y) = lhs − rhs = 0
          const code = compile(`(${lhs}) - (${rhs})`, helpers)
          const xLayer = new Layer(scope, 'x', 0)
          const yLayer = new Layer(xLayer, 'y', 0)
          return {
            kind: 'implicit',
            f: (x, y) => {
              xLayer.value = x
              yLayer.value = y
              try {
                return Number(code.evaluate(yLayer))
              } catch {
                return NaN
              }
            },
          }
        }
        if (lhs === 'y' && !symbolsOf(rhs).has('y')) return { kind: 'curve', axis: 'y', f: drawn(fnOf(rhs, 'x')), relation: op }
        if (rhs === 'y' && !symbolsOf(lhs).has('y')) return { kind: 'curve', axis: 'y', f: drawn(fnOf(lhs, 'x')), relation: FLIP[op] }
        return { kind: 'error', message: 'Write inequalities as y < f(x) or y > f(x)' }
      }

      const pair = splitPair(expr)
      if (pair) {
        note(pair[0])
        note(pair[1])
        const symbols = new Set([...symbolsOf(pair[0]), ...symbolsOf(pair[1])])
        if (symbols.has('t')) return { kind: 'parametric', x: drawn(fnOf(pair[0], 't')), y: drawn(fnOf(pair[1], 't')), range: [0, 2 * Math.PI] }
        return { kind: 'point', x: valueOf(pair[0]), y: valueOf(pair[1]) }
      }

      note(expr)
      const root = fmath.parse(expr)
      if (root.type === 'FunctionNode' && (root as unknown as { fn: { name: string } }).fn.name === '__int') {
        const [a, b, integrand, v] = (root as unknown as { args: { toString(): string; value?: string }[] }).args
        const f = fnOf(integrand.toString(), v.value ?? 'x')
        const lo = valueOf(a.toString())
        const hi = valueOf(b.toString())
        return { kind: 'integral', value: integrate(f, lo, hi), f, a: lo, b: hi }
      }
      if (symbolsOf(expr).has('x')) return { kind: 'curve', axis: 'y', f: drawn(fnOf(expr, 'x')) }
      return { kind: 'value', value: valueOf(expr) }
    } catch (e) {
      return { kind: 'error', message: translateError(e) }
    }
  })

  const missing = [...used].filter(
    (s) => !KNOWN.has(s) && !defined.has(s) && !scope.has(s) && !s.startsWith('const_') && !s.startsWith('__'),
  )
  return { items, missing }
}
