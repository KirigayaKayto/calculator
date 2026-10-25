import { describe, it, expect } from 'vitest'
import { readPasted, cleanNumber, pastedForInput, polishLatex } from '../src/engine/paste'

const read = (text: string, decimal: ',' | '.' = '.') => readPasted(text, decimal)?.text ?? null

describe('pasted numbers', () => {
  it('drop thousands separators of every kind', () => {
    expect(read('1 234 567')).toBe('1234567')
    expect(read('1 234 567,89')).toBe('1234567.89')
    expect(read('1 234,5')).toBe('1234.5')
    expect(read("1'234.56")).toBe('1234.56')
    expect(read('1’234.56')).toBe('1234.56')
    expect(read('1,234,567')).toBe('1234567')
    expect(read('1.234.567')).toBe('1234567')
  })

  it('find the decimal mark', () => {
    expect(read('1234.56')).toBe('1234.56')
    expect(read('1234,56')).toBe('1234.56')
    expect(read('1,234.56')).toBe('1234.56')
    expect(read('1.234,56')).toBe('1234.56')
    expect(read('0,125')).toBe('0.125')
    // "1,234" is a thousand in an app with a decimal point, and 1.234 with a decimal comma
    expect(cleanNumber('1,234', '.')).toBe('1234')
    expect(cleanNumber('1,234', ',')).toBe('1.234')
    expect(cleanNumber('1,5', '.')).toBe('1.5')
  })

  it('remove currency signs and read words around a number', () => {
    expect(read('$1,299.99')).toBe('1299.99')
    expect(read('1 234 567,8 ₽')).toBe('1234567.8')
    expect(read('€ 15,50')).toBe('15.50')
    expect(readPasted('Итого: 1 234,56 руб.', '.')).toEqual({ text: '1234.56', extracted: true })
    expect(read('Temperature −15 °C today')).toBe('-15')
    expect(read('Order A-15 costs 20')).toBe('15')
    expect(read('no numbers here')).toBeNull()
    expect(read('   ')).toBeNull()
  })

  it('read signs, powers and scientific notation', () => {
    expect(read('−15')).toBe('-15')
    expect(read('2×3 − 4÷2')).toBe('2*3 - 4/2')
    expect(read('1.5×10⁻³')).toBe('1.5*10^(-3)')
    expect(read('1,5·10^-3')).toBe('1.5*10^(-3)')
    expect(read('3.2e-5')).toBe('3.2*10^(-5)')
    expect(read('6.022E23')).toBe('6.022*10^(23)')
    expect(read('x² + 2x')).toBe('x^2 + 2x')
    expect(read('πr²')).toBe('pi r^2')
    expect(read('2π')).toBe('2 pi')
    expect(read('√2')).toBe('sqrt2')
    expect(read('Δx = 0,5')).toBe('Δx = 0.5')
    expect(read('2+2=')).toBe('2+2')
    expect(read('sin(30) + 5 km')).toBe('sin(30) + 5 km')
  })

  it('write the text for a field of the app', () => {
    expect(pastedForInput({ text: '1234.56*2', extracted: false }, ',')).toBe('1234,56*2')
    expect(pastedForInput({ text: '1234.56', extracted: false }, '.')).toBe('1234.56')
    expect(polishLatex('1.5\\cdot 10^{-3}', '.')).toBe('1.5\\times10^{-3}')
    expect(polishLatex('1.5\\cdot 10^{-3}', ',')).toBe('1{,}5\\times10^{-3}')
    expect(polishLatex('2\\cdot 3', '.')).toBe('2\\cdot 3')
  })
})
