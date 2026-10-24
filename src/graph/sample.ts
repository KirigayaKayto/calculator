/** Turning functions into points to draw, and finding the points worth showing on a curve. */

export interface View {
  /** The world point at the centre of the canvas. */
  cx: number
  cy: number
  /** Pixels per unit. */
  scale: number
  width: number
  height: number
}

export type Pt = [number, number]

export const toPx = (v: View, x: number, y: number): Pt => [
  (x - v.cx) * v.scale + v.width / 2,
  v.height / 2 - (y - v.cy) * v.scale,
]
export const fromPx = (v: View, px: number, py: number): Pt => [
  v.cx + (px - v.width / 2) / v.scale,
  v.cy - (py - v.height / 2) / v.scale,
]

export function visibleRange(v: View): { x0: number; x1: number; y0: number; y1: number } {
  const [x0, y1] = fromPx(v, 0, 0)
  const [x1, y0] = fromPx(v, v.width, v.height)
  return { x0, x1, y0, y1 }
}

const finite = (y: number) => Number.isFinite(y)

/**
 * y = f(x) for x in [x0, x1] as polylines in world coordinates: broken where the function is
 * undefined or jumps (tan at π/2), refined where it is steep.
 */
export function sampleFunction(f: (x: number) => number, x0: number, x1: number, n: number, yRange: number): Pt[][] {
  const segments: Pt[][] = []
  let current: Pt[] = []
  const flush = () => {
    if (current.length > 1) segments.push(current)
    current = []
  }
  const jump = yRange * 0.5

  const refine = (xa: number, ya: number, xb: number, yb: number, depth: number) => {
    // steep stretch: look in the middle, and either fill in points or break at an asymptote
    const xm = (xa + xb) / 2
    const ym = f(xm)
    if (!finite(ym)) {
      flush()
      return
    }
    const between = (ym - ya) * (yb - ym) >= 0
    if (depth > 6) {
      if (!between && Math.abs(yb - ya) > jump) flush()
      current.push([xm, ym])
      return
    }
    if (Math.abs(ym - ya) > yRange / 60) refine(xa, ya, xm, ym, depth + 1)
    current.push([xm, ym])
    if (Math.abs(yb - ym) > yRange / 60) refine(xm, ym, xb, yb, depth + 1)
  }

  let prevX = x0
  let prevY = f(x0)
  if (finite(prevY)) current.push([prevX, prevY])
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    const y = f(x)
    if (!finite(y)) {
      flush()
    } else if (!finite(prevY)) {
      current.push([x, y])
    } else {
      if (Math.abs(y - prevY) > yRange / 60) refine(prevX, prevY, x, y, 0)
      current.push([x, y])
    }
    prevX = x
    prevY = y
  }
  flush()
  return segments
}

/** A curve given by a parameter: (x(t), y(t)), or polar r(θ). Broken where undefined. */
export function sampleParametric(x: (t: number) => number, y: (t: number) => number, t0: number, t1: number, n: number): Pt[][] {
  const segments: Pt[][] = []
  let current: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n
    const px = x(t)
    const py = y(t)
    if (finite(px) && finite(py)) current.push([px, py])
    else {
      if (current.length > 1) segments.push(current)
      current = []
    }
  }
  if (current.length > 1) segments.push(current)
  return segments
}

/** F(x, y) = 0 by marching squares over the visible area: a list of line pieces. */
export function sampleImplicit(F: (x: number, y: number) => number, v: View, cell: number): [Pt, Pt][] {
  const { x0, x1, y0, y1 } = visibleRange(v)
  const cols = Math.ceil(v.width / cell)
  const rows = Math.ceil(v.height / cell)
  const dx = (x1 - x0) / cols
  const dy = (y1 - y0) / rows
  const grid = new Float64Array((cols + 1) * (rows + 1))
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) grid[j * (cols + 1) + i] = F(x0 + i * dx, y0 + j * dy)

  const pieces: [Pt, Pt][] = []
  const at = (i: number, j: number) => grid[j * (cols + 1) + i]
  const lerp = (a: number, b: number) => a / (a - b)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i + 1, j + 1)
      const d = at(i, j + 1)
      if (![a, b, c, d].every(finite)) continue
      const x = x0 + i * dx
      const y = y0 + j * dy
      const edges: Pt[] = []
      if (a > 0 !== b > 0) edges.push([x + lerp(a, b) * dx, y])
      if (b > 0 !== c > 0) edges.push([x + dx, y + lerp(b, c) * dy])
      if (d > 0 !== c > 0) edges.push([x + lerp(d, c) * dx, y + dy])
      if (a > 0 !== d > 0) edges.push([x, y + lerp(a, d) * dy])
      // a sign change across a pole (1/(x·y) = 1) is not a curve: the values must be small
      const limit = 4 * Math.max(Math.abs(a - b), Math.abs(b - c), Math.abs(c - d), Math.abs(d - a))
      if (Math.min(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) > limit) continue
      if (edges.length === 2) pieces.push([edges[0], edges[1]])
      else if (edges.length === 4) {
        pieces.push([edges[0], edges[1]])
        pieces.push([edges[2], edges[3]])
      }
    }
  }
  return pieces
}

// ---- points of interest ----

function bisect(f: (x: number) => number, a: number, b: number): number {
  let fa = f(a)
  for (let k = 0; k < 80; k++) {
    const m = (a + b) / 2
    const fm = f(m)
    if (fm === 0) return m
    if (fa > 0 === fm > 0) {
      a = m
      fa = fm
    } else b = m
  }
  return (a + b) / 2
}

/** Where f crosses zero in [x0, x1]; a jump through infinity (tan at π/2) is not a root. */
export function findRoots(f: (x: number) => number, x0: number, x1: number, n = 600): number[] {
  const roots: number[] = []
  const step = (x1 - x0) / n
  let xa = x0
  let ya = f(xa)
  for (let i = 1; i <= n; i++) {
    const xb = x0 + step * i
    const yb = f(xb)
    if (finite(ya) && finite(yb)) {
      if (ya === 0) roots.push(xa)
      else if (ya > 0 !== yb > 0 && yb !== 0) {
        const r = bisect(f, xa, xb)
        // a real root: the value there is tiny compared with the values around it
        if (Math.abs(f(r)) <= 1e-6 * Math.max(1, Math.abs(ya), Math.abs(yb))) roots.push(r)
      }
    }
    xa = xb
    ya = yb
  }
  return dedupe(roots, step)
}

/** Local maxima and minima of f in [x0, x1]. */
export function findExtrema(f: (x: number) => number, x0: number, x1: number, n = 600): { x: number; y: number; kind: 'max' | 'min' }[] {
  const step = (x1 - x0) / n
  const ys = Array.from({ length: n + 1 }, (_, i) => f(x0 + step * i))
  const out: { x: number; y: number; kind: 'max' | 'min' }[] = []
  for (let i = 1; i < n; i++) {
    const [a, b, c] = [ys[i - 1], ys[i], ys[i + 1]]
    if (![a, b, c].every(finite)) continue
    const kind = b > a && b >= c ? 'max' : b < a && b <= c ? 'min' : null
    if (!kind) continue
    // golden-section search between the neighbours
    let lo = x0 + step * (i - 1)
    let hi = x0 + step * (i + 1)
    const sign = kind === 'max' ? -1 : 1
    const g = (x: number) => sign * f(x)
    const phi = (Math.sqrt(5) - 1) / 2
    for (let k = 0; k < 60; k++) {
      const m1 = hi - phi * (hi - lo)
      const m2 = lo + phi * (hi - lo)
      if (g(m1) < g(m2)) hi = m2
      else lo = m1
    }
    const x = (lo + hi) / 2
    out.push({ x, y: f(x), kind })
  }
  return out
}

/** Where two curves y = f(x) and y = g(x) meet in [x0, x1]. */
export function findIntersections(f: (x: number) => number, g: (x: number) => number, x0: number, x1: number): Pt[] {
  return findRoots((x) => f(x) - g(x), x0, x1).map((x) => [x, f(x)])
}

function dedupe(xs: number[], tolerance: number): number[] {
  const out: number[] = []
  for (const x of xs.sort((a, b) => a - b)) if (!out.length || x - out[out.length - 1] > tolerance) out.push(x)
  return out
}

/** A "nice" grid step: 1, 2 or 5 × 10ⁿ, about `target` pixels apart. */
export function gridStep(scale: number, target = 90): number {
  const raw = target / scale
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}
