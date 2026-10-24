import type { IconName } from './Icon.svelte'
import { CONSTANTS } from '../engine/constants'

export interface Key {
  id: string
  kind: 'num' | 'fn' | 'op' | 'eq' | 'sci'
  aria: string
  /** Plain label, or a label drawn as a formula, or an icon. */
  label?: string
  labelLatex?: string
  icon?: IconName
  /** Typed as if from the keyboard: digits, + − ( ) ! */
  typed?: string
  /** A LaTeX template inserted at the cursor: #@ takes what is before it, #? and #0 are empty boxes. */
  latex?: string
  /** After "=", the key continues from the answer instead of starting anew. */
  continues?: boolean
  /** What the key does while INV is on. */
  inv?: Omit<Key, 'id' | 'inv'>
}

export interface Page {
  id: string
  label: string
  /** Key ids, row by row, 5 per row. */
  keys: string[]
}

const BOX = '\\square'

const digit = (d: string): Key => ({ id: d, kind: 'num', label: d, typed: d, aria: d })

const fn = (id: string, name: string, aria: string, inverse?: string): Key => ({
  id,
  kind: 'sci',
  labelLatex: `\\${name}`,
  latex: `\\${name}\\left(#0\\right)`,
  aria,
  inv: inverse
    ? { kind: 'sci', labelLatex: `\\${name}^{-1}`, latex: `\\${name}^{-1}\\left(#0\\right)`, aria: inverse }
    : undefined,
})

/**
 * Every key by id. Keys that only act (clear, back, equals, paren, decimal, left, right,
 * inv, angle) are handled by the calculator; the rest insert `typed` or `latex`.
 */
export const KEYS: Record<string, Key> = Object.fromEntries(
  [
    ...'0123456789'.split('').map(digit),
    { id: 'decimal', kind: 'num', label: '.', aria: 'Decimal point' },
    { id: 'add', kind: 'op', label: '+', typed: '+', aria: 'Plus', continues: true },
    { id: 'sub', kind: 'op', label: '−', typed: '-', aria: 'Minus', continues: true },
    { id: 'mul', kind: 'op', label: '×', latex: '\\times', aria: 'Times', continues: true },
    { id: 'div', kind: 'op', label: '÷', latex: '\\div', aria: 'Divide', continues: true },
    { id: 'equals', kind: 'eq', label: '=', aria: 'Equals' },
    { id: 'clear', kind: 'fn', label: 'AC', aria: 'Clear all' },
    { id: 'back', kind: 'fn', icon: 'backspace', aria: 'Delete' },
    { id: 'paren', kind: 'fn', label: '( )', aria: 'Parenthesis' },
    { id: 'ans', kind: 'fn', label: 'Ans', latex: '\\operatorname{Ans}', aria: 'Previous answer', continues: true },
    {
      id: 'exp10',
      kind: 'fn',
      labelLatex: `\\times10^{${BOX}}`,
      latex: '\\times10^{#?}',
      aria: 'Times ten to the power',
      continues: true,
    },
    { id: 'frac', kind: 'sci', labelLatex: `\\frac{${BOX}}{${BOX}}`, latex: '\\frac{#@}{#?}', aria: 'Fraction', continues: true },
    { id: 'sqrt', kind: 'sci', labelLatex: `\\sqrt{${BOX}}`, latex: '\\sqrt{#0}', aria: 'Square root' },
    { id: 'square', kind: 'sci', labelLatex: `${BOX}^2`, latex: '#@^{2}', aria: 'Square', continues: true },
    { id: 'pow', kind: 'sci', labelLatex: `${BOX}^{${BOX}}`, latex: '#@^{#?}', aria: 'Power', continues: true },
    { id: 'left', kind: 'sci', icon: 'chevron-left', aria: 'Move cursor left' },
    { id: 'right', kind: 'sci', icon: 'chevron-right', aria: 'Move cursor right' },
    { id: 'inv', kind: 'sci', label: 'INV', aria: 'Inverse functions' },
    { id: 'angle', kind: 'sci', label: 'DEG', aria: 'Angle unit' },
    fn('sin', 'sin', 'Sine', 'Inverse sine'),
    fn('cos', 'cos', 'Cosine', 'Inverse cosine'),
    fn('tan', 'tan', 'Tangent', 'Inverse tangent'),
    fn('ln', 'ln', 'Natural logarithm'),
    fn('log', 'log', 'Logarithm base 10'),
    { id: 'logb', kind: 'sci', labelLatex: `\\log_{${BOX}}`, latex: '\\log_{#?}\\left(#?\\right)', aria: 'Logarithm with base' },
    { id: 'ex', kind: 'sci', labelLatex: `e^{${BOX}}`, latex: '\\exponentialE^{#?}', aria: 'e to the power' },
    { id: 'tenx', kind: 'sci', labelLatex: `10^{${BOX}}`, latex: '10^{#?}', aria: 'Ten to the power' },
    { id: 'pi', kind: 'sci', labelLatex: '\\pi', latex: '\\pi', aria: 'Pi' },
    { id: 'e', kind: 'sci', labelLatex: 'e', latex: '\\exponentialE', aria: 'Euler’s number' },
    { id: 'nroot', kind: 'sci', labelLatex: `\\sqrt[n]{${BOX}}`, latex: '\\sqrt[#?]{#0}', aria: 'Nth root' },
    { id: 'cbrt', kind: 'sci', labelLatex: `\\sqrt[3]{${BOX}}`, latex: '\\sqrt[3]{#0}', aria: 'Cube root' },
    { id: 'abs', kind: 'sci', labelLatex: `\\left|${BOX}\\right|`, latex: '\\left|#0\\right|', aria: 'Absolute value' },
    { id: 'open', kind: 'sci', label: '(', typed: '(', aria: 'Open parenthesis' },
    { id: 'close', kind: 'sci', label: ')', typed: ')', aria: 'Close parenthesis', continues: true },
    { id: 'fact', kind: 'sci', labelLatex: 'x!', typed: '!', aria: 'Factorial', continues: true },
    { id: 'recip', kind: 'sci', labelLatex: `\\frac{1}{${BOX}}`, latex: '\\frac{1}{#@}', aria: 'Reciprocal', continues: true },
    { id: 'percent', kind: 'sci', label: '%', latex: '\\%', aria: 'Percent', continues: true },
    { id: 'ncr', kind: 'sci', label: 'nCr', latex: '\\binom{#?}{#?}', aria: 'Combinations' },
    { id: 'npr', kind: 'sci', label: 'nPr', latex: '\\operatorname{nPr}\\left(#?,#?\\right)', aria: 'Permutations' },
    { id: 'mod', kind: 'sci', label: 'mod', latex: '\\bmod', aria: 'Remainder', continues: true },
    { id: 'floor', kind: 'sci', labelLatex: `\\lfloor${BOX}\\rfloor`, latex: '\\lfloor#0\\rfloor', aria: 'Round down' },
    { id: 'degree', kind: 'sci', labelLatex: `${BOX}^{\\circ}`, latex: '\\degree', aria: 'Degrees', continues: true },
    // calculus and algebra: answered by the symbolic engine
    { id: 'ddx', kind: 'sci', labelLatex: '\\frac{d}{dx}', latex: '\\frac{d}{dx}\\left(#0\\right)', aria: 'Derivative' },
    {
      id: 'ddx2',
      kind: 'sci',
      labelLatex: '\\frac{d^2}{dx^2}',
      latex: '\\frac{d^2}{dx^2}\\left(#0\\right)',
      aria: 'Second derivative',
    },
    {
      id: 'ddxat',
      kind: 'sci',
      labelLatex: `\\left.\\frac{d}{dx}\\right|_{a}`,
      latex: '\\left.\\frac{d}{dx}\\left(#0\\right)\\right|_{x=#?}',
      aria: 'Derivative at a point',
    },
    { id: 'int', kind: 'sci', labelLatex: `\\int${BOX}\\,dx`, latex: '\\int #0\\,dx', aria: 'Integral' },
    {
      id: 'intab',
      kind: 'sci',
      labelLatex: `\\int_{a}^{b}${BOX}`,
      latex: '\\int_{#?}^{#?}#0\\,dx',
      aria: 'Definite integral',
    },
    { id: 'lim', kind: 'sci', labelLatex: '\\lim_{x\\to a}', latex: '\\lim_{x\\to#?}#0', aria: 'Limit' },
    { id: 'sum', kind: 'sci', labelLatex: '\\sum', latex: '\\sum_{n=#?}^{#?}#0', aria: 'Sum' },
    { id: 'prod', kind: 'sci', labelLatex: '\\prod', latex: '\\prod_{n=#?}^{#?}#0', aria: 'Product' },
    {
      id: 'taylor',
      kind: 'sci',
      label: 'Taylor',
      latex: '\\operatorname{Series}\\left(#0,x,0,5\\right)',
      aria: 'Taylor series around 0, up to the 5th power',
    },
    { id: 'eqsign', kind: 'sci', labelLatex: `${BOX}=${BOX}`, typed: '=', aria: 'Equals sign, to write an equation' },
    { id: 'x', kind: 'sci', labelLatex: 'x', typed: 'x', aria: 'x' },
    { id: 'y', kind: 'sci', labelLatex: 'y', typed: 'y', aria: 'y' },
    { id: 't', kind: 'sci', labelLatex: 't', typed: 't', aria: 't' },
    { id: 'n', kind: 'sci', labelLatex: 'n', typed: 'n', aria: 'n' },
    { id: 'infty', kind: 'sci', labelLatex: '\\infty', latex: '\\infty', aria: 'Infinity' },
    { id: 'factor', kind: 'sci', label: 'Factor', latex: '\\operatorname{Factor}\\left(#0\\right)', aria: 'Factor' },
    { id: 'expand', kind: 'sci', label: 'Expand', latex: '\\operatorname{Expand}\\left(#0\\right)', aria: 'Expand' },
    { id: 'comma', kind: 'sci', label: ',', typed: ',', aria: 'Comma' },
    // physics
    ...CONSTANTS.map((c) => ({ id: c.id, kind: 'sci', labelLatex: c.symbol, latex: `\\${c.id}`, aria: c.name })),
    { id: 'pm', kind: 'sci', labelLatex: '\\pm', latex: '\\pm', aria: 'Plus or minus: a measurement and its uncertainty', continues: true },
    {
      id: 'vec2',
      kind: 'sci',
      labelLatex: `\\begin{pmatrix}${BOX}\\\\${BOX}\\end{pmatrix}`,
      latex: '\\begin{pmatrix}#?\\\\#?\\end{pmatrix}',
      aria: 'Vector in 2D',
    },
    {
      id: 'vec3',
      kind: 'sci',
      labelLatex: `\\begin{pmatrix}${BOX}\\\\${BOX}\\\\${BOX}\\end{pmatrix}`,
      latex: '\\begin{pmatrix}#?\\\\#?\\\\#?\\end{pmatrix}',
      aria: 'Vector in 3D',
    },
    {
      id: 'mat2',
      kind: 'sci',
      labelLatex: `\\begin{pmatrix}${BOX}&${BOX}\\\\${BOX}&${BOX}\\end{pmatrix}`,
      latex: '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}',
      aria: '2 by 2 matrix',
    },
    { id: 'dot', kind: 'sci', labelLatex: '\\vec{u}\\cdot\\vec{v}', latex: '\\operatorname{dot}\\left(#?,#?\\right)', aria: 'Dot product' },
    { id: 'cross', kind: 'sci', labelLatex: '\\vec{u}\\times\\vec{v}', latex: '\\operatorname{cross}\\left(#?,#?\\right)', aria: 'Cross product' },
    { id: 'det', kind: 'sci', label: 'det', latex: '\\det\\left(#0\\right)', aria: 'Determinant' },
    { id: 'imag', kind: 'sci', labelLatex: 'i', typed: 'i', aria: 'Imaginary unit i' },
    { id: 'angleSign', kind: 'sci', labelLatex: `r\\angle\\theta`, latex: '\\angle', aria: 'Polar form: length, angle sign, angle' },
    // units: upright, after a thin space, as printed in physics books
    ...(
      [
        ['m', 'm', 'Metres'], ['km', 'km', 'Kilometres'], ['cm', 'cm', 'Centimetres'], ['mm', 'mm', 'Millimetres'],
        ['um', '\\mu m', 'Micrometres'], ['s', 's', 'Seconds'], ['ms', 'ms', 'Milliseconds'], ['min', 'min', 'Minutes'],
        ['h', 'h', 'Hours'], ['Hz', 'Hz', 'Hertz'], ['kg', 'kg', 'Kilograms'], ['g', 'g', 'Grams'], ['N', 'N', 'Newtons'],
        ['J', 'J', 'Joules'], ['W', 'W', 'Watts'], ['Pa', 'Pa', 'Pascals'], ['V', 'V', 'Volts'], ['A', 'A', 'Amperes'],
        ['ohm', '\\Omega', 'Ohms'], ['C', 'C', 'Coulombs'], ['K', 'K', 'Kelvin'], ['degC', '°C', 'Degrees Celsius'],
        ['eV', 'eV', 'Electronvolts'], ['mol', 'mol', 'Moles'],
      ] as const
    ).map(([id, tex, aria]) => ({
      id: `unit-${id}`,
      kind: 'sci',
      labelLatex: `\\mathrm{${tex}}`,
      latex: `\\,\\mathrm{${tex}}`,
      aria,
    })),
    { id: 'convert', kind: 'sci', labelLatex: '\\to', latex: '\\to', aria: 'Convert to the unit', continues: true },
  ].map((k) => [k.id, k as Key]),
)

export const PAGES: Page[] = [
  {
    id: 'main',
    label: '123',
    keys: [
      'frac', 'sqrt', 'square', 'pow', 'paren',
      '7', '8', '9', 'back', 'clear',
      '4', '5', '6', 'mul', 'div',
      '1', '2', '3', 'add', 'sub',
      '0', 'decimal', 'exp10', 'ans', 'equals',
    ],
  },
  {
    id: 'func',
    label: 'f(x)',
    keys: [
      'inv', 'angle', 'sin', 'cos', 'tan',
      'ln', 'log', 'logb', 'ex', 'tenx',
      'pi', 'e', 'nroot', 'cbrt', 'abs',
      'open', 'close', 'fact', 'recip', 'percent',
      'ncr', 'npr', 'mod', 'floor', 'degree',
    ],
  },
  {
    id: 'calc',
    label: 'Calc',
    keys: [
      'ddx', 'ddx2', 'ddxat', 'int', 'intab',
      'lim', 'sum', 'prod', 'taylor', 'eqsign',
      'x', 'y', 't', 'n', 'infty',
      'factor', 'expand', 'comma', 'open', 'close',
      'pi', 'e', 'sqrt', 'pow', 'frac',
    ],
  },
  {
    id: 'phys',
    label: 'Phys',
    keys: [
      'ConstC', 'ConstG', 'ConstH', 'ConstHbar', 'ConstE',
      'ConstKB', 'ConstNA', 'ConstR', 'ConstEps', 'ConstMu',
      'ConstMe', 'ConstMp', 'ConstGn', 'ConstKe', 'pm',
      'vec2', 'vec3', 'mat2', 'abs', 'det',
      'dot', 'cross', 'imag', 'angleSign', 'comma',
    ],
  },
  {
    id: 'units',
    label: 'Units',
    keys: [
      'unit-m', 'unit-km', 'unit-cm', 'unit-mm', 'unit-um',
      'unit-s', 'unit-ms', 'unit-min', 'unit-h', 'unit-Hz',
      'unit-kg', 'unit-g', 'unit-N', 'unit-J', 'unit-W',
      'unit-Pa', 'unit-V', 'unit-A', 'unit-ohm', 'unit-C',
      'unit-K', 'unit-degC', 'unit-eV', 'unit-mol', 'convert',
    ],
  },
]
