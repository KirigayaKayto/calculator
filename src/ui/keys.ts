import type { IconName } from './Icon.svelte'

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
]
