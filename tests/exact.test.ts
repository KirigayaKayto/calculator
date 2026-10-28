import { describe, it, expect } from 'vitest'
import { calculateLatex, newScope, type CalcSettings } from '../src/engine/calc'
import { math } from '../src/engine/math'
import { exactOf } from '../src/engine/exact-eval'
import { toLatex, toPlain, kind, toFraction, agreesWith, fromInt, fromDecimal, root, mul, toBig } from '../src/engine/exact'

const BASE: CalcSettings = { angle: 'deg', decimal: '.', digits: 16 }

/** The exact answer as LaTeX, plain text and kind; null when there is none; "ERR: …" on errors. */
function ex(latex: string, settings: Partial<CalcSettings> = {}, scope = newScope(settings.angle ?? BASE.angle)) {
  const r = calculateLatex(latex, { ...BASE, ...settings }, scope)
  if (!r.ok) return `ERR: ${r.error}`
  if (!r.exact) return null
  return { latex: toLatex(r.exact, { mixed: settings.mixedNumbers }), plain: toPlain(r.exact), kind: kind(r.exact) }
}

const tex = (latex: string, settings: Partial<CalcSettings> = {}) => {
  const r = ex(latex, settings)
  return r && typeof r === 'object' ? r.latex : r
}

describe('exact answers', () => {
  it('simplifies square roots', () => {
    expect(ex('\\sqrt{20}')).toEqual({ latex: '2\\sqrt{5}', plain: '2√5', kind: 'irrational' })
    expect(tex('\\sqrt{8}+\\sqrt{2}')).toBe('3\\sqrt{2}')
    expect(tex('\\sqrt{2}\\cdot\\sqrt{3}')).toBe('\\sqrt{6}')
    expect(tex('\\left(\\sqrt{2}\\right)^2')).toBe('2')
    expect(tex('\\sqrt{\\frac{1}{2}}')).toBe('\\frac{\\sqrt{2}}{2}')
    expect(tex('\\sqrt{16}')).toBe('4')
    expect(tex('3\\sqrt{2}+1')).toBe('1+3\\sqrt{2}')
    expect(tex('\\sqrt{20}\\cdot\\sqrt{5}')).toBe('10')
  })
  it('rationalizes denominators', () => {
    expect(tex('\\frac{2}{\\sqrt{2}}')).toBe('\\sqrt{2}')
    expect(tex('\\frac{1}{1+\\sqrt{2}}')).toBe('\\sqrt{2}-1')
    expect(tex('\\frac{1}{\\sqrt{2}+\\sqrt{3}}')).toBe('\\sqrt{3}-\\sqrt{2}')
    expect(tex('\\frac{1}{1+\\sqrt[3]{2}}')).toBe(null)
  })
  it('keeps sums of radicals and fractions', () => {
    expect(ex('\\frac{1+\\sqrt{5}}{2}')).toEqual({ latex: '\\frac{1+\\sqrt{5}}{2}', plain: '(1+√5)/2', kind: 'irrational' })
    expect(tex('\\left(\\frac{1+\\sqrt{5}}{2}\\right)^{2}')).toBe('\\frac{3+\\sqrt{5}}{2}')
    expect(tex('\\left(1+\\sqrt{2}\\right)\\left(1-\\sqrt{2}\\right)')).toBe('-1')
    expect(tex('\\frac{1-\\sqrt{5}}{2}')).toBe('\\frac{1-\\sqrt{5}}{2}')
    expect(ex('-\\frac{1+\\sqrt{5}}{2}')).toEqual({ latex: '-\\frac{1+\\sqrt{5}}{2}', plain: '-(1+√5)/2', kind: 'irrational' })
    expect(tex('\\sqrt{3+2\\sqrt{2}}')).toBe('1+\\sqrt{2}')
    expect(tex('\\sqrt{1+\\sqrt{2}}')).toBe(null)
  })
  it('knows the special angles', () => {
    expect(tex('\\sin\\left(60\\right)')).toBe('\\frac{\\sqrt{3}}{2}')
    expect(tex('\\sin\\left(\\frac{\\pi}{4}\\right)', { angle: 'rad' })).toBe('\\frac{\\sqrt{2}}{2}')
    expect(tex('\\sin30^{\\circ}', { angle: 'rad' })).toBe('\\frac{1}{2}')
    expect(ex('\\tan\\left(45\\right)')).toEqual({ latex: '1', plain: '1', kind: 'integer' })
    expect(tex('\\cos\\left(180\\right)')).toBe('-1')
    expect(tex('\\cos\\left(36\\right)')).toBe('\\frac{1+\\sqrt{5}}{4}')
    expect(tex('\\tan\\left(15\\right)')).toBe('2-\\sqrt{3}')
    expect(tex('\\sin\\left(36\\right)')).toBe(null)
    expect(tex('\\sin\\left(20\\right)')).toBe(null)
    expect(tex('\\sin\\left(30\\right)', { angle: 'rad' })).toBe(null)
    expect(tex('\\tan\\left(90\\right)')).toMatch(/^ERR/)
    expect(tex('\\arcsin\\left(\\frac{1}{2}\\right)')).toBe('30')
    expect(tex('\\arcsin\\left(\\frac{1}{2}\\right)', { angle: 'rad' })).toBe('\\frac{\\pi}{6}')
    expect(tex('\\arctan\\left(1\\right)', { angle: 'rad' })).toBe('\\frac{\\pi}{4}')
  })
  it('keeps π and e', () => {
    expect(ex('\\frac{\\pi}{3}')).toEqual({ latex: '\\frac{\\pi}{3}', plain: 'π/3', kind: 'irrational' })
    expect(tex('2\\pi\\cdot3')).toBe('6\\pi')
    expect(ex('\\frac{\\pi^2}{6}')).toEqual({ latex: '\\frac{\\pi^{2}}{6}', plain: 'π²/6', kind: 'irrational' })
    expect(tex('\\exponentialE^{2}\\cdot\\exponentialE')).toBe('\\exponentialE^{3}')
    expect(tex('\\ln\\left(\\exponentialE^{2}\\right)')).toBe('2')
    expect(tex('\\ln\\left(2\\right)')).toBe(null)
    expect(tex('\\pi^{\\pi}')).toBe(null)
    expect(tex('\\frac{1}{\\pi}')).toBe('\\frac{1}{\\pi}')
  })
  it('takes roots and powers', () => {
    expect(ex('\\sqrt[3]{16}')).toEqual({ latex: '2\\sqrt[3]{2}', plain: '2∛2', kind: 'irrational' })
    expect(tex('8^{\\frac{1}{3}}')).toBe('2')
    expect(tex('2^{\\frac{1}{3}}')).toBe('\\sqrt[3]{2}')
    expect(tex('\\sqrt[3]{-8}')).toBe('-2')
    expect(tex('\\left(-8\\right)^{\\frac{1}{3}}')).toMatch(/^ERR/)
    expect(tex('\\log_{2}\\left(8\\right)')).toBe('3')
    expect(tex('\\log\\left(\\sqrt{10}\\right)')).toBe('\\frac{1}{2}')
    expect(tex('2^{10}')).toBe('1024')
  })
  it('does whole numbers and fractions', () => {
    expect(tex('\\frac{10!}{8!}')).toBe('90')
    expect(ex('0.5+\\frac{1}{3}')).toEqual({ latex: '\\frac{5}{6}', plain: '5/6', kind: 'rational' })
    expect(tex('200+10\\%')).toBe('220')
    expect(tex('2\\frac{1}{2}', { mixedNumbers: true })).toBe('2\\frac{1}{2}')
    expect(ex('\\frac{7}{2}')).toEqual({ latex: '\\frac{7}{2}', plain: '7/2', kind: 'rational' })
    expect(tex('-\\frac{7}{2}')).toBe('-\\frac{7}{2}')
    expect(tex('\\binom{5}{2}')).toBe('10')
    expect(tex('7\\bmod3')).toBe('1')
  })
  it('gives up outside its world', () => {
    expect(tex('\\sqrt{-4}')).toMatch(/^ERR/)
    expect(tex('\\frac{1}{0}')).toMatch(/^ERR/)
    expect(tex('2^{1000}')).toBe(null)
    expect(tex('50!')).toBe(null)
    expect(tex('5\\,\\mathrm{km}')).toBe(null)
    expect(tex('2.50\\pm0.02')).toBe(null)
    expect(tex('\\sqrt{20}', { format: 'lab' })).toBe(null)
    expect(tex('\\sqrt{-4}', { complex: 'rect' })).toBe(null)
    // decimals are exact fractions, but the calculator shows them as decimals
    expect(ex('0.1+0.2')).toEqual({ latex: '\\frac{3}{10}', plain: '3/10', kind: 'rational' })
  })
  it('continues exactly from the previous answer', () => {
    const scope = newScope('deg')
    const r = calculateLatex('\\sqrt{20}', BASE, scope)
    expect(r.ok && r.exact).toBeTruthy()
    if (!r.ok || !r.exact) return
    // "2√5" shown in the field, then "× √5" typed after it
    const cont = (latex: string) => {
      const c = calculateLatex(latex, BASE, scope, '_ans')
      return c.ok ? (c.exact ? toLatex(c.exact) : null) : `ERR: ${c.error}`
    }
    scope.set('_ans', r.value)
    scope.exact.set('_ans', r.exact)
    expect(cont('\\times\\sqrt{5}')).toBe('10')
    expect(cont('+1')).toBe('1+2\\sqrt{5}')
    // the Ans key, with and without the exact value in scope
    scope.set('Ans', r.value)
    expect(ex('\\operatorname{Ans}+1', {}, scope)).toBe(null)
    scope.exact.set('Ans', r.exact)
    const r2 = calculateLatex('\\operatorname{Ans}+1', BASE, scope)
    expect(r2.ok && r2.exact && toLatex(r2.exact)).toBe('1+2\\sqrt{5}')
    // a decimal answer without an exact form stays decimal
    scope.set('_ans', math.bignumber('0.70710678118654752440084436210484903928483593768847403658833987'))
    expect(cont('+1')).toBe(null)
  })
  it('never hangs on hard radicands', () => {
    const start = performance.now()
    const prime = tex('\\sqrt{999999999989}')
    const twoPrimes = tex('\\sqrt{1000000016000000063}')
    expect(performance.now() - start).toBeLessThan(1500)
    expect(prime === null || prime === '\\sqrt{999999999989}').toBe(true)
    expect(twoPrimes === null || twoPrimes === '\\sqrt{1000000016000000063}').toBe(true)
  })
  it('is fast enough for the live preview', () => {
    const node = math.parse('sqrt(20)+sin(60)/2')
    const scope = newScope('deg')
    const start = performance.now()
    for (let i = 0; i < 1000; i++) exactOf(node, { angle: 'deg', scope })
    expect(performance.now() - start).toBeLessThan(400)
  })
})

describe('exact helpers', () => {
  it('reads decimals exactly', () => {
    expect(toLatex(fromDecimal('0.1')!)).toBe('\\frac{1}{10}')
    expect(toLatex(fromDecimal('1.5e-3')!)).toBe('\\frac{3}{2000}')
    expect(toLatex(fromDecimal('-2')!)).toBe('-2')
  })
  it('checks its values against the numeric engine', () => {
    const twoRootFive = mul(fromInt(2n)!, root(fromInt(5n)!, 2n)!)!
    expect(agreesWith(twoRootFive, math.bignumber(20).sqrt())).toBe(true)
    expect(agreesWith(twoRootFive, math.bignumber('4.47'))).toBe(false)
    expect(toBig(twoRootFive).toFixed(10)).toBe('4.4721359550')
  })
  it('does not mistake rounding noise for a fraction', () => {
    expect(toFraction(math.bignumber('9.' + '9'.repeat(63)))).toBe(null)
    expect(toFraction(math.bignumber(1).div(3))).toEqual({ negative: false, whole: '0', num: '1', den: '3' })
  })
})
