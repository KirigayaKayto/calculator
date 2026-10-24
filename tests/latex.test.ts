import { describe, it, expect } from 'vitest'
import { latexToExpr, balanceParens, identifierLatex } from '../src/engine/latex'
import { calculateLatex, newScope, type CalcSettings } from '../src/engine/calc'
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
  it('reads Greek letters and subscripts as names', () => {
    expect(latexToExpr('\\alpha+\\beta').replace(/\s+/g, '')).toBe('alpha+beta')
    // gamma, zeta, tau and phi are also mathjs functions or constants: the letters get their own names
    expect(latexToExpr('\\gamma\\cdot2').replace(/\s+/g, '')).toBe('gamma_*2')
    expect(latexToExpr('v_0+v_{max}').replace(/\s+/g, '')).toBe('v_0+v_max')
    expect(latexToExpr('\\gamma_{0}').replace(/\s+/g, '')).toBe('gamma_0')
    expect(latexToExpr('ax_1', { splitLetters: true }).replace(/\s+/g, ' ').trim()).toBe('a x_1')
  })
  it('writes names back as LaTeX', () => {
    expect(identifierLatex('alpha')).toBe('\\alpha')
    expect(identifierLatex('gamma_')).toBe('\\gamma')
    expect(identifierLatex('gamma')).toBe('\\gamma')
    expect(identifierLatex('gamma_0')).toBe('\\gamma_{0}')
    expect(identifierLatex('v_max')).toBe('v_{max}')
    expect(identifierLatex('x')).toBe('x')
  })
  it('computes with Greek variables', () => {
    const scope = newScope('deg')
    calculateLatex('\\alpha=3', BASE, scope)
    calculateLatex('\\tau=2', BASE, scope)
    expect(calculateLatex('2\\alpha+\\tau', BASE, scope)).toMatchObject({ ok: true, text: '8' })
  })
})

describe('balancing parentheses', () => {
  it('closes them where they belong', () => {
    expect(balanceParens('\\sin(x^2')).toBe('\\sin(x^2)')
    expect(balanceParens('\\frac{d}{dx}\\left(\\sin(x^2\\right)')).toBe('\\frac{d}{dx}\\left(\\sin(x^2)\\right)')
    expect(balanceParens('\\int x\\cdot\\cos(x\\,dx')).toBe('\\int x\\cdot\\cos(x)\\,dx')
    expect(balanceParens('\\frac{(1+2}{3}')).toBe('\\frac{(1+2)}{3}')
    expect(balanceParens('(1+2)\\cdot3')).toBe('(1+2)\\cdot3')
    expect(balanceParens('\\left\\{x\\right\\}')).toBe('\\left\\{x\\right\\}')
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
    expect(calc('5\\,\\mathrm{km}\\to\\mathrm{m}')).toBe('5\u202F000 m')
    expect(calc('2\\,\\mathrm{k\\Omega}\\times3\\,\\mathrm{mA}\\to\\mathrm{V}')).toBe('6 V')
    expect(calc('500\\,\\mathrm{\\mu m}\\to\\mathrm{mm}')).toBe('0.5 mm')
  })
})

describe('complex numbers', () => {
  const on = (latex: string, complex: 'rect' | 'polar' = 'rect') => calc(latex, { complex })
  it('are an error unless turned on', () => {
    expect(calc('\\sqrt{-4}')).toBe('ERR: Undefined')
    expect(on('\\sqrt{-4}')).toBe('2i')
    expect(calc('\\sqrt{-4}')).toBe('ERR: Undefined')
  })
  it('compute in rectangular and polar form', () => {
    expect(on('\\left(1+2i\\right)\\left(3-i\\right)')).toBe('5 + 5i')
    expect(on('3+4i', 'polar')).toBe('5∠53.13010235415598°')
    expect(on('2\\angle90^{\\circ}')).toBe('2i')
    expect(on('2\\angle90')).toBe('2i')
    expect(on('\\frac{1}{i}')).toBe('−i')
  })
})

describe('physics', () => {
  it('uses constants with their units', () => {
    expect(calc('\\ConstC')).toBe('299\u202F792\u202F458 m / s')
    expect(calc('\\ConstMe\\cdot\\ConstC^2\\to\\mathrm{MeV}', { format: 'sig', digits: 6 })).toBe('0.510999 MeV')
    expect(calc('\\ConstH\\cdot\\ConstC\\div\\left(500\\,\\mathrm{nm}\\right)\\to\\mathrm{eV}', { format: 'sig', digits: 4 })).toBe(
      '2.480 eV',
    )
  })
  it('works with vectors and matrices', () => {
    expect(calc('\\left|\\begin{pmatrix}3\\\\4\\end{pmatrix}\\right|')).toBe('5')
    expect(calc('\\operatorname{dot}\\left(\\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix},\\begin{pmatrix}4\\\\5\\\\6\\end{pmatrix}\\right)')).toBe('32')
    expect(calc('\\operatorname{cross}\\left(\\begin{pmatrix}1\\\\0\\\\0\\end{pmatrix},\\begin{pmatrix}0\\\\1\\\\0\\end{pmatrix}\\right)')).toBe(
      '[0, 0, 1]',
    )
    expect(calc('\\det\\left(\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}\\right)')).toBe('\u22122')
    expect(calc('\\begin{vmatrix}1&2\\\\3&4\\end{vmatrix}')).toBe('\u22122')
    expect(calc('\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}^{T}')).toBe('[[1, 3], [2, 4]]')
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
