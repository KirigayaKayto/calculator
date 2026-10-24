/**
 * Fast floating-point evaluation for the graph: thousands of samples per frame, so plain
 * numbers instead of the calculator's 64-digit ones. Angles are in radians, as in calculus.
 */
import { create, all, type MathNode } from 'mathjs'
import { CONSTANTS, constantVar } from '../engine/constants'

export const fmath = create(all, { number: 'number', predictable: true })

/** Anything mathjs accepts as a scope. */
export interface ScopeLike {
  get(key: string): unknown
  has(key: string): boolean
  set(key: string, value: unknown): unknown
  keys(): IterableIterator<string>
}

/** One extra variable on top of a scope: cheap to create for every function call. */
export class Layer implements ScopeLike {
  constructor(
    private parent: ScopeLike,
    private name: string,
    public value: unknown,
  ) {}
  get(key: string) {
    return key === this.name ? this.value : this.parent.get(key)
  }
  has(key: string) {
    return key === this.name || this.parent.has(key)
  }
  set(key: string, value: unknown) {
    if (key === this.name) this.value = value
    else this.parent.set(key, value)
    return this
  }
  keys() {
    return new Set([this.name, ...this.parent.keys()]).values()
  }
}

/** Physical constants as plain SI numbers. */
export function baseScope(): Map<string, unknown> {
  const s = new Map<string, unknown>()
  for (const c of CONSTANTS) s.set(constantVar(c.id), Number(c.value))
  return s
}

// ---- calculus ----

/** f′(x) by central differences. */
export function derivative(f: (x: number) => number, x: number): number {
  const h = 1e-5 * Math.max(1, Math.abs(x))
  return (f(x + h) - f(x - h)) / (2 * h)
}

export function secondDerivative(f: (x: number) => number, x: number): number {
  const h = 1e-4 * Math.max(1, Math.abs(x))
  return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h)
}

// Gauss–Kronrod 7/15 nodes and weights on [−1, 1]
const XK = [
  0.991455371120813, 0.949107912342759, 0.864864423359769, 0.741531185599394, 0.586087235467691,
  0.405845151377397, 0.207784955007898, 0,
]
const WK = [
  0.022935322010529, 0.063092092629979, 0.104790010322250, 0.140653259715525, 0.169004726639267,
  0.190350578064785, 0.204432940075298, 0.209482141084728,
]
const WG = [0.129484966168870, 0.279705391489277, 0.381830050505119, 0.417959183673469]

function kronrod(f: (x: number) => number, a: number, b: number): { value: number; error: number } {
  const c = (a + b) / 2
  const h = (b - a) / 2
  const fc = f(c)
  let k = WK[7] * fc
  let g = WG[3] * fc
  for (let i = 0; i < 7; i++) {
    const dx = h * XK[i]
    const s = f(c - dx) + f(c + dx)
    k += WK[i] * s
    if (i % 2 === 1) g += WG[(i - 1) / 2] * s
  }
  return { value: k * h, error: Math.abs((k - g) * h) }
}

function adaptive(f: (x: number) => number, a: number, b: number, tol: number, depth: number): number {
  const r = kronrod(f, a, b)
  if (depth > 40 || r.error <= Math.max(tol, 1e-14 * Math.abs(r.value))) return r.value
  const m = (a + b) / 2
  return adaptive(f, a, m, tol / 2, depth + 1) + adaptive(f, m, b, tol / 2, depth + 1)
}

/** ∫ₐᵇ f(x) dx, also over infinite intervals. NaN when it does not converge. */
export function integrate(f: (x: number) => number, a: number, b: number, tol = 1e-10): number {
  if (a === b) return 0
  if (a > b) return -integrate(f, b, a, tol)
  let g = f
  let lo = a
  let hi = b
  if (!Number.isFinite(a) && !Number.isFinite(b)) {
    // x = t / (1 − t²), t ∈ (−1, 1)
    g = (t) => f(t / (1 - t * t)) * ((1 + t * t) / (1 - t * t) ** 2)
    lo = -1
    hi = 1
  } else if (!Number.isFinite(b)) {
    // x = a + t / (1 − t), t ∈ [0, 1)
    g = (t) => f(a + t / (1 - t)) / (1 - t) ** 2
    lo = 0
    hi = 1
  } else if (!Number.isFinite(a)) {
    g = (t) => f(b - (1 - t) / t) / (t * t)
    lo = 0
    hi = 1
  }
  const safe = (x: number) => {
    const y = g(x)
    return Number.isFinite(y) ? y : 0
  }
  const value = adaptive(safe, lo, hi, tol, 0)
  return Number.isFinite(value) ? value : NaN
}

// ---- compiling ----

/** Names in the calculator's sense → mathjs's own: ln → log, lg and one-argument log → log10. */
function calculatorNames(node: MathNode): MathNode {
  if (node.type !== 'FunctionNode') return node
  const fn = node as unknown as { fn: { name: string }; args: MathNode[] }
  const name = fn.fn.name
  if (name === 'ln') return new fmath.FunctionNode(new fmath.SymbolNode('log'), fn.args)
  if (name === 'lg' || (name === 'log' && fn.args.length === 1)) return new fmath.FunctionNode(new fmath.SymbolNode('log10'), fn.args)
  return node
}

export interface Compiled {
  evaluate(scope: ScopeLike): unknown
  node: MathNode
}

/**
 * Compile an expression from the LaTeX converter for fast evaluation. d/dx becomes a symbolic
 * derivative (or a numeric one if mathjs cannot differentiate it); ∫ₐᵇ becomes a numeric integral.
 * `helpers` receives the functions this needs, to be put in the evaluation scope.
 */
export function compile(expr: string, helpers: Map<string, unknown>): Compiled {
  const lower = (node: MathNode): MathNode => {
    const mapped = calculatorNames(node.map((child) => lower(child)))
    if (mapped.type !== 'FunctionNode') return mapped
    const fn = mapped as unknown as { fn: { name: string }; args: MathNode[] }
    const name = fn.fn.name

    const d = /^__d([a-zA-Z])$/.exec(name)
    if (d) {
      const variable = d[1]
      try {
        return fmath.derivative(fn.args[0], variable)
      } catch {
        // a function mathjs does not know (one defined in the graph): differentiate numerically
        const inner = fn.args[0].compile()
        const id = `__nd${helpers.size}`
        helpers.set(id, (scope: ScopeLike) => (x: number) => {
          const layer = new Layer(scope, variable, x)
          return derivative((t) => {
            layer.value = t
            return Number(inner.evaluate(layer))
          }, x)
        })
        return new fmath.FunctionNode(new fmath.SymbolNode(id), [new fmath.SymbolNode(variable)])
      }
    }

    if (name === '__int') {
      const [a, b, integrand, v] = fn.args
      const variable = (v as unknown as { value: string }).value
      const body = integrand.compile()
      const id = `__ni${helpers.size}`
      helpers.set(id, (scope: ScopeLike) => (lo: number, hi: number) => {
        const layer = new Layer(scope, variable, 0)
        return integrate((t) => {
          layer.value = t
          return Number(body.evaluate(layer))
        }, lo, hi)
      })
      return new fmath.FunctionNode(new fmath.SymbolNode(id), [a, b])
    }
    return mapped
  }

  const node = lower(fmath.parse(expr))
  const code = node.compile()
  return { node, evaluate: (scope) => code.evaluate(scope) }
}

/** Free names an expression uses (not functions it calls): which variables it depends on. */
export function symbolsOf(expr: string): Set<string> {
  const names = new Set<string>()
  const callees = new Set<MathNode>()
  fmath.parse(expr).traverse((node) => {
    if (node.type === 'FunctionNode') callees.add((node as unknown as { fn: MathNode }).fn)
    else if (node.type === 'SymbolNode' && !callees.has(node)) names.add((node as unknown as { name: string }).name)
  })
  return names
}
