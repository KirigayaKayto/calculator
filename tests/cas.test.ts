import { describe, it, expect } from 'vitest'
import { casEvaluate, exponentials } from '../src/cas/engine'
import type { Angle } from '../src/cas/protocol'

function exact(latex: string, angle: Angle = 'rad', solveFor?: string) {
  const r = casEvaluate({ latex, angle, solveFor })
  if (!r.ok) return `ERR: ${r.error}`
  const a = r.answer
  if (a.kind === 'value') return a.exact
  if (a.kind === 'choose') return `choose: ${a.variables.join(' ')}`
  return a.solutions.map((s) => s.exact).join(', ')
}

function approx(latex: string, angle: Angle = 'rad') {
  const r = casEvaluate({ latex, angle })
  return r.ok && r.answer.kind === 'value' ? Number(r.answer.approx) : NaN
}

describe('calculus', () => {
  it('differentiates', () => {
    expect(exact('\\frac{d}{dx}\\left(\\sin\\left(x^2\\right)\\right)')).toBe('2x\\cos(x^2)')
    expect(exact('\\frac{d}{dx}\\left(x^3\\right)')).toBe('3x^2')
  })
  it('differentiates at a point', () => {
    expect(exact('\\left.\\frac{d}{dx}\\left(x^3\\right)\\right|_{x=2}')).toBe('12')
  })
  it('integrates', () => {
    expect(exact('\\int x\\cos x\\,dx')).toBe('x\\sin(x)+\\cos(x)')
    expect(exact('\\int e^{2x}\\,dx')).toBe('\\frac{\\exponentialE^{2x}}{2}')
    expect(exact('\\int_0^1x^2\\,dx')).toBe('\\frac{1}{3}')
    expect(approx('\\int_0^1e^{-x^2}\\,dx')).toBeCloseTo(0.746824132812427, 12)
    expect(approx('\\int_0^1x^x\\,dx')).toBeCloseTo(0.783430510712134, 9)
  })
  it('takes limits and sums', () => {
    expect(exact('\\lim_{x\\to0}\\frac{\\sin x}{x}')).toBe('1')
    expect(exact('\\sum_{k=1}^{\\infty}\\frac{1}{k^2}')).toBe('\\frac{\\pi^2}{6}')
    expect(approx('\\sum_{k=1}^{\\infty}\\frac{1}{k^2}')).toBeCloseTo(Math.PI ** 2 / 6, 14)
  })
})

describe('solving', () => {
  it('solves equations for the unknown', () => {
    expect(exact('x^2-5x+6=0')).toBe('3, 2')
    expect(exact('e^x=5')).toBe('\\ln(5)')
  })
  it('asks which letter to solve for', () => {
    expect(exact('v=v_0+at')).toMatch(/^choose: /)
    expect(exact('v=v_0+at', 'rad', 't')).toBe('\\frac{v-v_0}{a}')
  })
})

describe('exact values', () => {
  it('simplifies numbers', () => {
    expect(exact('\\sqrt{12}')).toBe('2\\sqrt{3}')
    expect(exact('\\sin\\left(\\frac{\\pi}{3}\\right)')).toBe('\\frac{\\sqrt{3}}{2}')
  })
  it('follows the angle unit', () => {
    expect(exact('\\sin\\left(30\\right)', 'deg')).toBe('\\frac{1}{2}')
    expect(exact('\\sin^{-1}\\left(\\frac{1}{2}\\right)', 'deg')).toBe('30')
  })
  it('reports empty boxes', () => {
    expect(exact('\\frac{1}{\\placeholder{}}')).toBe('ERR: Fill in the empty boxes')
  })
})

describe('output', () => {
  it('writes exponentials as powers of e', () => {
    expect(exponentials('\\frac{\\exp(2x)}{2}+\\exp(x(1+x))')).toBe('\\frac{\\exponentialE^{2x}}{2}+\\exponentialE^{x(1+x)}')
  })
})
