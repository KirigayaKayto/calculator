import { describe, it, expect } from 'vitest'
import { numberLatex, unitLatex } from '../src/engine/texout'
import { calculateLatex } from '../src/engine/calc'

describe('answers as LaTeX', () => {
  it('writes numbers', () => {
    expect(numberLatex('-1234.5', '.', true)).toBe('-1\\,234.5')
    expect(numberLatex('1.8e19', ',')).toBe('1{,}8\\cdot10^{19}')
  })
  it('writes units upright after a thin space', () => {
    expect(numberLatex('5000 m', '.')).toBe('5000\\,\\mathrm{m}')
    expect(numberLatex('25 m / s', '.')).toBe('25\\,\\mathrm{m/s}')
    expect(unitLatex('kg m / s^2')).toBe('\\mathrm{kg\\,m/s^{2}}')
    expect(unitLatex('mol^-1')).toBe('\\mathrm{mol^{-1}}')
    expect(unitLatex('kohm')).toBe('\\mathrm{k\\Omega}')
    expect(unitLatex('um')).toBe('\\mathrm{\\mu m}')
    expect(unitLatex('degC')).toBe('\\mathrm{°C}')
  })
  it('writes measurements', () => {
    expect(numberLatex('6.0±0.5', '.')).toBe('6.0\\pm0.5')
    expect(numberLatex('10.44±0.05 m / s', '.')).toBe('\\left(10.44\\pm0.05\\right)\\,\\mathrm{m/s}')
  })
  it('writes complex numbers', () => {
    expect(numberLatex('3+4i', '.')).toBe('3+4i')
    expect(numberLatex('-2i', '.')).toBe('-2i')
    expect(numberLatex('i', '.')).toBe('i')
    expect(numberLatex('5∠53.13°', '.')).toBe('5\\angle 53.13^{\\circ}')
  })
  it('round-trips through the calculator', () => {
    const r = calculateLatex(numberLatex('5000 m', '.') + '\\to\\mathrm{km}', { angle: 'deg', decimal: '.', digits: 12 })
    expect(r.ok && r.text).toBe('5 km')
  })
})
