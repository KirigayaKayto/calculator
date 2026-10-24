import { describe, it, expect } from 'vitest'
import { evaluateWorksheet, splitRelation, type Item, type Line } from '../src/graph/model'
import { integrate } from '../src/graph/numeric'
import { findRoots, findExtrema, findIntersections, sampleFunction, sampleImplicit, gridStep } from '../src/graph/sample'

describe('points of interest', () => {
  it('finds roots, not asymptotes', () => {
    const r = findRoots((x) => x * x - 2, -5, 5)
    expect(r).toHaveLength(2)
    expect(r[1]).toBeCloseTo(Math.SQRT2, 10)
    const t = findRoots(Math.tan, -4, 4)
    expect(t.map((x) => Math.round(x / Math.PI))).toEqual([-1, 0, 1])
  })
  it('finds maxima and minima', () => {
    const e = findExtrema(Math.sin, 0, 2 * Math.PI)
    expect(e.map((p) => p.kind)).toEqual(['max', 'min'])
    expect(e[0].x).toBeCloseTo(Math.PI / 2, 6)
  })
  it('finds intersections', () => {
    const p = findIntersections((x) => x, (x) => x * x, -3, 3)
    expect(p.map(([x]) => Math.round(x * 1e9) / 1e9)).toEqual([0, 1])
  })
})

describe('sampling', () => {
  it('breaks curves at asymptotes', () => {
    const segments = sampleFunction(Math.tan, -4, 4, 400, 10)
    expect(segments.length).toBe(3)
  })
  it('draws implicit curves', () => {
    const pieces = sampleImplicit((x, y) => x * x + y * y - 4, { cx: 0, cy: 0, scale: 50, width: 400, height: 400 }, 8)
    expect(pieces.length).toBeGreaterThan(20)
    for (const [[x, y]] of pieces) expect(Math.hypot(x, y)).toBeCloseTo(2, 1)
  })
  it('chooses round grid steps', () => {
    expect(gridStep(90)).toBe(1)
    expect(gridStep(20)).toBe(5)
    expect(gridStep(300)).toBe(0.2)
  })
})

const lines = (...latex: string[]): Line[] => latex.map((l, i) => ({ id: String(i), latex: l, color: '#000' }))
const sheet = (...latex: string[]) => evaluateWorksheet(lines(...latex))

function only<K extends Item['kind']>(item: Item, kind: K): Extract<Item, { kind: K }> {
  expect(item.kind).toBe(kind)
  return item as Extract<Item, { kind: K }>
}

describe('numeric calculus', () => {
  it('integrates, also to infinity', () => {
    expect(integrate((x) => x * x, 0, 1)).toBeCloseTo(1 / 3, 12)
    expect(integrate(Math.sin, 0, Math.PI)).toBeCloseTo(2, 12)
    expect(integrate((x) => Math.exp(-x), 0, Infinity)).toBeCloseTo(1, 9)
    expect(integrate((x) => Math.exp(-x * x), -Infinity, Infinity)).toBeCloseTo(Math.sqrt(Math.PI), 9)
  })
})

describe('relations', () => {
  it('splits at the top level only', () => {
    expect(splitRelation('y=x^2')).toEqual({ lhs: 'y', op: '=', rhs: 'x^2' })
    expect(splitRelation('y<=f(x=1)')).toEqual({ lhs: 'y', op: '<=', rhs: 'f(x=1)' })
    expect(splitRelation('x^2+1')).toBe(null)
  })
})

describe('worksheet lines', () => {
  it('plots y = f(x) and bare expressions in x', () => {
    const [a, b] = sheet('y=x^2', '\\sin\\left(x\\right)').items
    expect(only(a, 'curve').f(3)).toBe(9)
    expect(only(b, 'curve').f(Math.PI / 2)).toBeCloseTo(1, 12)
  })
  it('defines functions and their derivatives', () => {
    const [, g, h] = sheet('f(x)=x^3', 'f^{\\prime}(x)', 'f\\left(2\\right)').items
    expect(only(g, 'curve').f(2)).toBeCloseTo(12, 6)
    expect(only(h, 'value').value).toBe(8)
  })
  it('differentiates symbolically with d/dx', () => {
    const [d] = sheet('\\frac{d}{dx}\\left(x^2\\sin\\left(x\\right)\\right)').items
    const x = 1.3
    expect(only(d, 'curve').f(x)).toBeCloseTo(2 * x * Math.sin(x) + x * x * Math.cos(x), 12)
  })
  it('makes sliders and uses them', () => {
    const [, , c] = sheet('a=2', 'b=3a', 'y=ax+b').items
    expect(only(c, 'curve').f(1)).toBe(8)
    const [slider] = sheet('a=2').items
    expect(only(slider, 'variable').slider).toBe(true)
  })
  it('offers sliders for letters never defined', () => {
    const { items, missing } = sheet('y=kx+m')
    expect(missing.sort()).toEqual(['k', 'm'])
    // until they get values, the curve has no points (and does not fail)
    expect(only(items[0], 'curve').f(1)).toBeNaN()
    expect(sheet('y=\\omega_{0}x').missing).toEqual(['omega_0'])
  })
  it('understands implicit curves, inequalities, points, parametric and polar curves', () => {
    const [circle, below, point, param, polar] = sheet(
      'x^2+y^2=4',
      'y<x+1',
      '\\left(1,2\\right)',
      '\\left(\\cos t,\\sin t\\right)',
      'r=1+\\cos\\theta',
    ).items
    expect(only(circle, 'implicit').f(2, 0)).toBe(0)
    expect(only(below, 'curve').relation).toBe('<')
    expect(only(point, 'point')).toMatchObject({ x: 1, y: 2 })
    expect(only(param, 'parametric').x(0)).toBe(1)
    expect(only(polar, 'polar').r(0)).toBe(2)
  })
  it('computes and shades definite integrals', () => {
    const [, i] = sheet('f(x)=x^2', '\\int_0^3f(x)\\,dx').items
    const integral = only(i, 'integral')
    expect(integral.value).toBeCloseTo(9, 10)
    expect(integral).toMatchObject({ a: 0, b: 3 })
  })
  it('shows values of plain expressions', () => {
    const [, v] = sheet('a=5', '\\sqrt{a^2+144}').items
    expect(only(v, 'value').value).toBe(13)
  })
  it('reports problems per line', () => {
    expect(sheet('y<x^2+y').items[0].kind).toBe('error')
  })
})
