import { describe, it, expect } from 'vitest'
import { calculate, type CalcSettings } from '../src/engine/calc'
import { formatBig, type FormatMode } from '../src/engine/format'
import { math } from '../src/engine/math'

const BASE: CalcSettings = { angle: 'deg', decimal: '.', digits: 16 }

function calc(input: string, settings: Partial<CalcSettings> = {}) {
  const r = calculate(input, { ...BASE, ...settings })
  return r.ok ? r.text : `ERR: ${r.error}`
}

/** Answers group thousands with a narrow no-break space; tests write a normal space. */
const g = (s: string) => s.replace(/ /g, ' ')

describe('arithmetic', () => {
  it('is exact with decimals', () => {
    expect(calc('0.1+0.2')).toBe('0.3')
    expect(calc('1/3')).toBe('0.3333333333333333')
  })
  it('understands calculator symbols', () => {
    expect(calc('6 × 7')).toBe('42')
    expect(calc('10 ÷ 4')).toBe('2.5')
    expect(calc('2 − 5')).toBe('−3')
    expect(calc('√9')).toBe('3')
    expect(calc('√(16)+2²')).toBe('8')
    expect(calc('2π')).toBe('6.283185307179586')
    expect(calc('5!')).toBe('120')
  })
  it('handles percentages', () => {
    expect(calc('100 + 3%')).toBe('103')
    expect(calc('200 × 10%')).toBe('20')
  })
  it('groups thousands and accepts grouped input', () => {
    expect(calc('10^15')).toBe(g('1 000 000 000 000 000'))
    expect(calc('1 000 000 + 1')).toBe(g('1 000 001'))
  })
  it('switches to exponent for huge numbers', () => {
    expect(calc('2^64')).toBe('1.844674407370955×10¹⁹')
    expect(calc('1/10^12')).toBe('1×10⁻¹²')
  })
  it('closes parentheses automatically', () => {
    expect(calc('(2+3')).toBe('5')
    expect(calc('sin(30')).toBe('0.5')
  })
  it('reports errors in plain English', () => {
    expect(calc('1/0')).toBe('ERR: Division by zero')
    expect(calc('√(−4)')).toBe('ERR: Undefined')
    expect(calc('2+')).toMatch(/^ERR: /)
    expect(calc('abc')).toBe('ERR: Undefined variable: abc')
    expect(calc('tan(90)')).toBe('ERR: Undefined')
  })
  it('supports the decimal comma', () => {
    expect(calc('3,5 * 2', { decimal: ',' })).toBe('7')
    expect(calc('1/4', { decimal: ',' })).toBe('0,25')
    expect(calc('max(3; 5)', { decimal: ',' })).toBe('5')
    expect(calc('max(3, 5)')).toBe('5')
  })
})

describe('scientific', () => {
  it('uses degrees', () => {
    expect(calc('sin(30)')).toBe('0.5')
    expect(calc('sin(180)')).toBe('0')
    expect(calc('cos(90)')).toBe('0')
    expect(calc('tan(45)')).toBe('1')
    expect(calc('asin(0.5)')).toBe('30')
    expect(calc('acos(0)')).toBe('90')
    expect(calc('sec(60)')).toBe('2')
  })
  it('uses radians', () => {
    expect(calc('sin(π/6)', { angle: 'rad' })).toBe('0.5')
    expect(calc('sin(π)', { angle: 'rad' })).toBe('0')
    expect(calc('sin(30 deg)', { angle: 'rad' })).toBe('0.5')
  })
  it('has calculator logarithms', () => {
    expect(calc('log(100)')).toBe('2')
    expect(calc('ln(e)')).toBe('1')
    expect(calc('log(8, 2)')).toBe('3')
  })
})

describe('units', () => {
  it('converts', () => {
    expect(calc('5 km to m')).toBe(g('5 000') + ' m')
    expect(calc('90 km/h to m/s')).toBe('25 m / s')
    expect(calc('2 inch to cm')).toBe('5.08 cm')
    expect(calc('1 GiB to MiB')).toBe(g('1 024') + ' MiB')
    expect(calc('2 kg + 300 g')).toBe('2.3 kg')
  })
  it('converts temperature', () => {
    expect(calc('100 °C to °F')).toBe('212 °F')
    expect(calc('0 °C to K')).toBe('273.15 K')
  })
  it('knows the extra units', () => {
    expect(calc('1 kcal to J')).toBe(g('4 184') + ' J')
    expect(calc('10 knot to km/h')).toBe('18.52 km / h')
    expect(calc('1 au to km')).toBe(g('149 597 870.7') + ' km')
  })
})

describe('number formats', () => {
  const fmt = (x: string, mode: FormatMode, digits: number) =>
    formatBig(math.bignumber(x), { decimal: '.', digits, mode, plain: false })

  it('fixes decimal places', () => {
    expect(fmt('2.5', 'fix', 2)).toBe('2.50')
    expect(fmt('1234.5678', 'fix', 2)).toBe(g('1 234.57'))
    expect(fmt('0.0001', 'fix', 2)).toBe('1.00×10⁻⁴')
    expect(fmt('0', 'fix', 3)).toBe('0.000')
  })
  it('writes scientific notation', () => {
    expect(fmt('2500', 'sci', 3)).toBe('2.50×10³')
    expect(fmt('-0.000123456', 'sci', 2)).toBe('−1.2×10⁻⁴')
  })
  it('writes engineering notation', () => {
    expect(fmt('4700', 'eng', 2)).toBe('4.7×10³')
    expect(fmt('0.000033', 'eng', 2)).toBe('33×10⁻⁶')
    expect(fmt('999.96', 'eng', 3)).toBe('1.00×10³')
    expect(fmt('12.3', 'eng', 3)).toBe('12.3')
  })
  it('rounds to significant figures', () => {
    expect(fmt('7.8333', 'sig', 2)).toBe('7.8')
    expect(fmt('7.8', 'sig', 3)).toBe('7.80')
    expect(fmt('0.0012345', 'sig', 3)).toBe('0.00123')
    expect(fmt('4730', 'sig', 2)).toBe('4.7×10³')
    expect(fmt('4730', 'sig', 4)).toBe(g('4 730'))
  })
  it('applies to units too', () => {
    expect(calc('2 kg + 333 g', { format: 'fix', digits: 1 })).toBe('2.3 kg')
  })
})
