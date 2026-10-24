import { describe, it, expect } from 'vitest'
import { calculateLatex, type CalcSettings } from '../src/engine/calc'
import { literalPrecision, roundMeasurement } from '../src/engine/lab'
import { math } from '../src/engine/math'

const LAB: CalcSettings = { angle: 'deg', decimal: '.', digits: 12, format: 'lab' }

function lab(latex: string) {
  const r = calculateLatex(latex, LAB)
  return r.ok ? `${r.text}${r.note ? ` (${r.note})` : ''}` : `ERR: ${r.error}`
}

describe('significant figures of typed numbers', () => {
  it('counts them by the usual rules', () => {
    expect(literalPrecision('2.50')).toEqual({ sf: 3, lsd: -2 })
    expect(literalPrecision('0.00120')).toEqual({ sf: 3, lsd: -5 })
    expect(literalPrecision('120.')).toEqual({ sf: 3, lsd: 0 })
    expect(literalPrecision('3.1')).toEqual({ sf: 2, lsd: -1 })
    expect(literalPrecision('120').sf).toBe(Infinity)
  })
})

describe('lab rules', () => {
  it('multiplies and divides by the fewest significant figures', () => {
    expect(lab('2.50\\times3.1')).toBe('7.8 (2 s.f.)')
    expect(lab('\\frac{9.81}{3.0}')).toBe('3.3 (2 s.f.)')
  })
  it('adds and subtracts by the least precise decimal place', () => {
    expect(lab('12.11+18.0+1.013')).toBe('31.1 (3 s.f.)')
    expect(lab('100.0-99.85')).toBe('0.2 (1 s.f.)')
  })
  it('treats whole numbers and π as exact', () => {
    expect(lab('2\\pi\\cdot0.150')).toBe('0.942 (3 s.f.)')
    expect(lab('\\frac{1}{2}\\cdot2.0\\cdot3.00^{2}')).toBe('9.0 (2 s.f.)')
  })
  it('handles scientific notation and logarithms', () => {
    expect(lab('1.20\\times10^{3}\\times2.0')).toBe('2.4×10³ (2 s.f.)')
    expect(lab('\\log\\left(2.0\\right)')).toBe('0.30 (2 s.f.)')
  })
  it('falls back to the usual answer when every number is exact', () => {
    expect(lab('12\\times3')).toBe('36')
  })
})

describe('uncertainties', () => {
  const calc = (latex: string) => {
    const r = calculateLatex(latex, { ...LAB, format: 'auto' })
    return r.ok ? r.text : `ERR: ${r.error}`
  }
  it('propagates them through products and sums', () => {
    expect(calc('\\left(2.0\\pm0.1\\right)\\times\\left(3.0\\pm0.2\\right)')).toBe('6.0 ± 0.5')
    expect(calc('\\left(10.0\\pm0.3\\right)+\\left(5.0\\pm0.4\\right)')).toBe('15.0 ± 0.5')
  })
  it('keeps units', () => {
    expect(calc('\\frac{\\left(100.0\\pm0.5\\right)\\,\\mathrm{m}}{\\left(9.58\\pm0.01\\right)\\,\\mathrm{s}}')).toBe(
      // 100.0/9.58 = 10.438; relative σ = √(0.005² + 0.00104²) = 0.0051 → σ = 0.053
      '(10.44 ± 0.05) m / s',
    )
  })
  it('rounds by convention', () => {
    const r = (c: string, s: string) => roundMeasurement(math.bignumber(c), math.bignumber(s))
    expect(r('7.7500', '0.3132')).toEqual({ center: '7.8', sigma: '0.3' })
    expect(r('7.7500', '0.1432')).toEqual({ center: '7.75', sigma: '0.14' })
    expect(r('1234', '56')).toEqual({ center: '1230', sigma: '60' })
  })
  it('asks for the uncertainty right after a number', () => {
    expect(calc('\\left(1+2\\right)\\pm0.1')).toMatch(/^ERR: Write the uncertainty/)
  })
})
