import { describe, it, expect } from 'vitest'
import { latexToExpr } from '../src/engine/latex'
import { calculateLatex, type CalcSettings } from '../src/engine/calc'
import { toFraction, fractionLatex, fractionPlain, prefersFraction } from '../src/engine/exact'

const BASE: CalcSettings = { angle: 'deg', decimal: '.', digits: 16 }

function calc(latex: string, settings: Partial<CalcSettings> = {}) {
  const r = calculateLatex(latex, { ...BASE, ...settings })
  return r.ok ? r.text : `ERR: ${r.error}`
}

function fraction(latex: string, mixed = false) {
  const r = calculateLatex(latex, BASE)
  if (!r.ok) return `ERR: ${r.error}`
  const f = toFraction(r.value)
  return f ? fractionLatex(f, mixed) : null
}

describe('latex to expression', () => {
  it('converts textbook structures', () => {
    expect(latexToExpr('\\frac{1}{2}+\\frac{1}{3}')).toBe('((1)/(2))+((1)/(3))')
    expect(latexToExpr('\\frac12')).toBe('((1)/(2))')
    expect(latexToExpr('\\sqrt{16+9}')).toBe('sqrt(16+9)')
    expect(latexToExpr('\\sqrt[3]{27}')).toBe('nthRoot(27,3)')
    expect(latexToExpr('2^{10}')).toBe('2^(10)')
    expect(latexToExpr('\\left|-5\\right|')).toBe('abs(-5)')
    expect(latexToExpr('6\\div2')).toBe('6/2')
    expect(latexToExpr('3\\times4')).toBe('3*4')
    expect(latexToExpr('2^{10}\\cdot1000')).toBe('2^(10)*1000')
  })
  it('reads functions with and without parentheses', () => {
    expect(latexToExpr('\\sin\\left(30\\right)')).toBe('sin(30)')
    expect(latexToExpr('\\sin30^{\\circ}')).toBe('sin(30 deg)')
    expect(latexToExpr('\\tan\\left(45\\right)')).toBe('tan(45)')
    expect(latexToExpr('\\operatorname{\\mathrm{tg}}45')).toBe('tan(45)')
    expect(latexToExpr('\\log_{2}\\left(8\\right)')).toBe('log(8,2)')
    expect(latexToExpr('\\sin^2\\left(30\\right)')).toBe('(sin(30))^(2)')
  })
  it('reads sin⁻¹ as arcsin', () => {
    expect(latexToExpr('\\sin^{-1}\\left(0.5\\right)')).toBe('asin(0.5)')
    expect(latexToExpr('\\tan^{-1}1')).toBe('atan(1)')
  })
  it('reads mixed numbers only when asked', () => {
    expect(latexToExpr('2\\frac{1}{2}')).toBe('2((1)/(2))')
    expect(latexToExpr('2\\frac{1}{2}', { mixedNumbers: true })).toBe('(2+1/2)')
    expect(latexToExpr('-3\\frac{1}{2}', { mixedNumbers: true })).toBe('-(3+1/2)')
    expect(latexToExpr('1{,}5')).toBe('1.5')
  })
  it('reads combinatorics, floor and ceiling', () => {
    expect(latexToExpr('\\binom{5}{2}')).toBe('combinations(5,2)')
    expect(latexToExpr('\\operatorname{nPr}\\left(5,2\\right)')).toBe('permutations(5,2)')
    expect(latexToExpr('\\lfloor2.7\\rfloor')).toBe('floor(2.7)')
    expect(latexToExpr('\\left\\lceil2.1\\right\\rceil')).toBe('ceil(2.1)')
  })
})

describe('textbook calculator', () => {
  it('evaluates fractions, roots and powers', () => {
    expect(calc('\\frac{1}{2}+\\frac{1}{3}')).toBe('0.8333333333333333')
    expect(calc('2\\times\\frac{1}{4}+\\sqrt{16+9}-3^{2}')).toBe('−3.5')
    expect(calc('\\sqrt[3]{27}')).toBe('3')
    expect(calc('\\sqrt[3]{-8}')).toBe('−2')
    expect(calc('2\\frac{1}{2}\\cdot2')).toBe('2')
    expect(calc('2\\frac{1}{2}\\cdot2', { mixedNumbers: true })).toBe('5')
    expect(calc('6\\div4')).toBe('1.5')
    expect(calc('1{,}5\\cdot2', { decimal: ',' })).toBe('3')
    expect(calc('\\left|-5\\right|')).toBe('5')
    expect(calc('5!')).toBe('120')
    expect(calc('200+10\\%')).toBe('220')
    expect(calc('2\\pi')).toBe('6.283185307179586')
    expect(calc('\\exponentialE^{1}')).toBe('2.718281828459045')
  })
  it('evaluates functions', () => {
    expect(calc('\\sin\\left(30\\right)')).toBe('0.5')
    expect(calc('\\sin^{-1}\\left(0.5\\right)')).toBe('30')
    expect(calc('\\tan\\left(45\\right)')).toBe('1')
    expect(calc('\\log\\left(1000\\right)')).toBe('3')
    expect(calc('\\ln\\left(\\exponentialE\\right)')).toBe('1')
    expect(calc('\\log_{2}\\left(8\\right)')).toBe('3')
    expect(calc('\\sin^2\\left(30\\right)+\\cos^2\\left(30\\right)')).toBe('1')
    expect(calc('\\sin\\left(\\frac{\\pi}{6}\\right)', { angle: 'rad' })).toBe('0.5')
    expect(calc('\\binom{5}{2}')).toBe('10')
    expect(calc('\\operatorname{nPr}\\left(5,2\\right)')).toBe('20')
    expect(calc('\\lfloor-2.5\\rfloor')).toBe('−3')
    expect(calc('7\\bmod3')).toBe('1')
  })
  it('asks to fill empty boxes', () => {
    expect(calc('\\frac{1}{\\placeholder{}}')).toBe('ERR: Fill in the empty boxes')
    expect(calc('\\sqrt{}')).toBe('ERR: Fill in the empty boxes')
  })
  it('closes parentheses that are still open', () => {
    expect(calc('\\left(2+3\\right.')).toBe('5')
    expect(calc('2\\cdot(3+4')).toBe('14')
  })
  it('keeps units working', () => {
    expect(calc('5\\text{ km to m}')).toBe('5\u202F000 m')
  })
})

describe('exact fractions', () => {
  it('finds the fraction behind a result', () => {
    expect(fraction('\\frac{1}{2}+\\frac{1}{3}')).toBe('\\frac{5}{6}')
    expect(fraction('2\\cdot\\frac{1}{4}+\\sqrt{16+9}-3^{2}')).toBe('-\\frac{7}{2}')
    expect(fraction('2\\cdot\\frac{1}{4}+\\sqrt{16+9}-3^{2}', true)).toBe('-3\\frac{1}{2}')
    expect(fraction('\\frac{2}{3}\\cdot\\frac{9}{4}')).toBe('\\frac{3}{2}')
    expect(fraction('1\\div3')).toBe('\\frac{1}{3}')
  })
  it('has no fraction for integers and irrational numbers', () => {
    expect(fraction('\\frac{4}{2}')).toBe(null)
    expect(fraction('\\sqrt{2}')).toBe(null)
    expect(fraction('\\pi')).toBe(null)
  })
  it('copies fractions in a form other programs understand', () => {
    expect(fractionPlain({ negative: true, whole: '3', num: '1', den: '2' })).toBe('-7/2')
  })
  it('prefers fractions only for fraction problems', () => {
    expect(prefersFraction('\\frac{1}{2}+\\frac{1}{3}')).toBe(true)
    expect(prefersFraction('7\\div2')).toBe(true)
    expect(prefersFraction('0.5+\\frac{1}{2}')).toBe(false)
    expect(prefersFraction('\\sin\\left(30\\right)')).toBe(false)
  })
})
