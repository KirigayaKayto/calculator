export type DecimalMark = ',' | '.'

const LETTER = '[\\p{L}\\d_$€₽]'

/** Regex matching a whole word (\b does not work for Cyrillic). */
function word(source: string, flags = 'gu') {
  return new RegExp(`(?<!${LETTER})(?:${source})(?!${LETTER})`, flags)
}

const REPLACEMENTS: [RegExp, string][] = [
  // "1 000 000" — thousands separated by spaces, as we write them and as results are shown
  [/(\d)[    ](?=\d{3}(?!\d))/g, '$1'],
  // "$100" → "100 $"
  [/([$€₽])\s*(\d+(?:[.,]\d+)?)/g, '$2 $1'],
  [/[×·∙⋅]/g, '*'],
  [/÷/g, '/'],
  [/[−–—]/g, '-'],
  [/π/g, 'pi'],
  [/²/g, '^2'],
  [/³/g, '^3'],
  [/√\s*(\d+(?:[.,]\d+)?|[\p{L}_$][\p{L}\d_$]*)/gu, 'sqrt($1)'],
  [/√/g, 'sqrt'],
  // temperatures: °C (also with Cyrillic С), ℃, words
  [/°\s*[CС]|℃/g, ' degC'],
  [/°\s*F|℉/g, ' degF'],
  [/°/g, ' deg'],
  [word('цельси[йяюе]\\p{L}*'), 'degC'],
  [word('фаренгейт\\p{L}*'), 'degF'],
  [word('кельвин\\p{L}*'), 'K'],
  // "5 км в м" → "5 км to м"
  [/(?<=\S)\s+в\s+(?=\S)/g, ' to '],
]

export interface NormalizeOptions {
  decimal: DecimalMark
  /** Treat ":" as division, the way it is written at school. Off in the notebook, where ":" ends a label. */
  colonDivides?: boolean
}

/** Turn what a person typed into an expression mathjs understands. */
export function normalize(src: string, { decimal, colonDivides = true }: NormalizeOptions): string {
  let s = src
  for (const [re, to] of REPLACEMENTS) s = s.replace(re, to)
  if (colonDivides) s = s.replace(/:/g, '/')
  // with a decimal comma, function arguments are separated by ";", as in Russian Excel
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
