export type DecimalMark = ',' | '.'

const REPLACEMENTS: [RegExp, string][] = [
  // "1 000 000" — thousands separated by spaces, as answers are shown
  [/(\d)[    ](?=\d{3}(?!\d))/g, '$1'],
  [/[×·∙⋅]/g, '*'],
  [/÷/g, '/'],
  [/[−–—]/g, '-'],
  [/π/g, 'pi'],
  [/²/g, '^2'],
  [/³/g, '^3'],
  [/√\s*(\d+(?:[.,]\d+)?|[\p{L}_$][\p{L}\d_$]*)/gu, 'sqrt($1)'],
  [/√/g, 'sqrt'],
  [/°\s*C|℃/g, ' degC'],
  [/°\s*F|℉/g, ' degF'],
  [/°/g, ' deg'],
  // a ratio a : b is a division
  [/:/g, '/'],
]

export interface NormalizeOptions {
  decimal: DecimalMark
}

/** Turn what a person typed into an expression mathjs understands. */
export function normalize(src: string, { decimal }: NormalizeOptions): string {
  let s = src
  for (const [re, to] of REPLACEMENTS) s = s.replace(re, to)
  // with a decimal comma, function arguments are separated by ";"
  if (decimal === ',') s = s.replace(/,/g, '.').replace(/;/g, ',')
  return s.trim()
}

/** Close parentheses the person has not closed yet, so "sin(30" already shows a result. */
export function closeParens(s: string): string {
  let depth = 0
  for (const c of s) {
    if (c === '(') depth++
    else if (c === ')' && depth > 0) depth--
  }
  return s + ')'.repeat(depth)
}
