import { describe, it, expect } from 'vitest'
import { calculate, type CalcSettings } from '../src/engine/calc'
import { evaluateNotebook } from '../src/engine/notebook'
import { applyRates } from '../src/engine/currency'

const BASE: CalcSettings = { angle: 'deg', decimal: ',', digits: 16 }

function calc(input: string, settings: Partial<CalcSettings> = {}) {
  const r = calculate(input, { ...BASE, ...settings })
  return r.ok ? r.text : `ERR: ${r.error}`
}

/** Results group thousands with a narrow no-break space; tests write a normal space. */
const g = (s: string) => s.replace(/ /g, ' ')

describe('arithmetic', () => {
  it('is exact with decimals', () => {
    expect(calc('0.1+0.2')).toBe('0,3')
    expect(calc('0,1+0,2')).toBe('0,3')
    expect(calc('1/3')).toBe('0,3333333333333333')
  })
  it('understands calculator symbols', () => {
    expect(calc('6 × 7')).toBe('42')
    expect(calc('10 ÷ 4')).toBe('2,5')
    expect(calc('10 : 4')).toBe('2,5')
    expect(calc('2 − 5')).toBe('−3')
    expect(calc('√9')).toBe('3')
    expect(calc('√(16)+2²')).toBe('8')
    expect(calc('2π')).toBe('6,283185307179586')
    expect(calc('5!')).toBe('120')
  })
  it('handles percentages', () => {
    expect(calc('100 + 3%')).toBe('103')
    expect(calc('100 − 3%')).toBe('97')
    expect(calc('200 × 10%')).toBe('20')
  })
  it('groups thousands and accepts grouped input', () => {
    expect(calc('10^15')).toBe(g('1 000 000 000 000 000'))
    expect(calc('1 000 000 + 1')).toBe(g('1 000 001'))
  })
  it('switches to exponent for huge numbers', () => {
    expect(calc('2^64')).toBe('1,844674407370955×10¹⁹')
    expect(calc('1/10^12')).toBe('1×10⁻¹²')
  })
  it('closes parentheses automatically', () => {
    expect(calc('(2+3')).toBe('5')
    expect(calc('sin(30')).toBe('0,5')
  })
  it('reports errors in Russian', () => {
    expect(calc('1/0')).toBe('ERR: Деление на ноль')
    expect(calc('√(−4)')).toBe('ERR: Не определено')
    expect(calc('2+')).toMatch(/^ERR: /)
    expect(calc('абв')).toBe('ERR: Неизвестно: абв')
  })
  it('supports the dot as decimal mark', () => {
    expect(calc('3.5 * 2', { decimal: '.' })).toBe('7')
    expect(calc('1/4', { decimal: '.' })).toBe('0.25')
    expect(calc('max(3, 5)', { decimal: '.' })).toBe('5')
    expect(calc('max(3; 5)')).toBe('5')
  })
})

describe('scientific', () => {
  it('uses degrees', () => {
    expect(calc('sin(30)')).toBe('0,5')
    expect(calc('sin(180)')).toBe('0')
    expect(calc('cos(90)')).toBe('0')
    expect(calc('tan(45)')).toBe('1')
    expect(calc('tan(90)')).toBe('ERR: Не определено')
    expect(calc('asin(0,5)')).toBe('30')
    expect(calc('acos(0)')).toBe('90')
  })
  it('uses radians', () => {
    expect(calc('sin(π/6)', { angle: 'rad' })).toBe('0,5')
    expect(calc('sin(π)', { angle: 'rad' })).toBe('0')
    expect(calc('sin(30 deg)', { angle: 'rad' })).toBe('0,5')
  })
  it('has calculator logarithms', () => {
    expect(calc('log(100)')).toBe('2')
    expect(calc('lg(1000)')).toBe('3')
    expect(calc('ln(e)')).toBe('1')
    expect(calc('log(8; 2)')).toBe('3')
  })
})

describe('units', () => {
  it('converts with Russian names', () => {
    expect(calc('5 км в м')).toBe(g('5 000') + ' м')
    expect(calc('90 км/ч в м/с')).toBe('25 м / с')
    expect(calc('1 ГБ в МБ')).toBe(g('1 024') + ' МБ')
    expect(calc('6 соток в м^2')).toBe('600 м²')
    expect(calc('2 кг + 300 г')).toBe('2,3 кг')
  })
  it('converts with English names', () => {
    expect(calc('2 inch to cm')).toBe('5,08 cm')
  })
  it('converts temperature', () => {
    expect(calc('100 °C в °F')).toBe('212 °F')
    expect(calc('0 °C в K')).toBe('273,15 K')
  })
})

describe('currency', () => {
  it('converts with loaded rates', () => {
    applyRates({ rates: { USD: 1, EUR: 0.5, RUB: 100 }, updated: 0, fetched: 0 })
    expect(calc('10 EUR в USD')).toBe('20 USD')
    expect(calc('1 $ в руб')).toBe('100 руб')
    expect(calc('$2 в рублях')).toBe('200 рублях')
    expect(calc('50 евро в rub')).toBe(g('10 000') + ' rub')
  })
  it('rounds money to cents', () => {
    expect(calc('1 EUR в RUB')).toBe('200 RUB')
    expect(calc('1 руб в USD')).toBe('0,01 USD')
    expect(calc('7 руб в USD')).toBe('0,07 USD')
  })
  it('updates rates', () => {
    applyRates({ rates: { USD: 1, EUR: 0.25, RUB: 100 }, updated: 0, fetched: 0 })
    expect(calc('10 EUR в USD')).toBe('40 USD')
  })
})

describe('notebook', () => {
  const lines = (src: string[]) =>
    evaluateNotebook(src.join('\n'), BASE).map((r) =>
      r.kind === 'value' ? r.text : r.kind === 'error' ? `ERR: ${r.error}` : r.kind,
    )

  it('keeps variables, totals and labels', () => {
    expect(
      lines([
        'Аренда: 30 000',
        'еда = 15 000',
        'итого',
        'итого * 12',
        '',
        'пред / 2',
        'аренда = 25 000',
        'аренда * 12',
      ]),
    ).toEqual([g('30 000'), g('15 000'), g('45 000'), g('540 000'), 'empty', g('270 000'), g('25 000'), g('300 000')])
  })
  it('treats words as text', () => {
    expect(lines(['5 яблок', 'Привет мир', '# заметка', 'x + 1', '2 кг яблок'])).toEqual([
      '5',
      'text',
      'empty',
      'ERR: Неизвестно: x',
      '2 кг',
    ])
  })
  it('starts a new block after a heading', () => {
    expect(lines(['10', '20', 'Еда:', '5', 'сумма'])).toEqual(['10', '20', 'empty', '5', '5'])
  })
  it('lets a user variable shadow a total name', () => {
    expect(lines(['сумма = 7', '1', 'сумма + 1'])).toEqual(['7', '1', '8'])
  })
})
