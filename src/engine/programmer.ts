import { CalcError } from './errors'

/**
 * The programmer's calculator: whole numbers in a machine word (8–64 bits, signed or not),
 * written in hex, decimal, octal or binary, with the bitwise operators.
 * Every operation wraps around the word, as the processor does.
 */

export type Radix = 2 | 8 | 10 | 16
export type WordSize = 8 | 16 | 32 | 64

export interface Word {
  bits: WordSize
  signed: boolean
}

export const RADIX_NAMES: Record<Radix, string> = { 16: 'HEX', 10: 'DEC', 8: 'OCT', 2: 'BIN' }

/** The value as the word holds it: the high bits dropped, read as signed or unsigned. */
export function wrap(n: bigint, w: Word): bigint {
  return w.signed ? BigInt.asIntN(w.bits, n) : BigInt.asUintN(w.bits, n)
}

/** Digits in the radix; hex, octal and binary show the word's bits (two's complement), decimal a sign. */
export function formatRadix(n: bigint, radix: Radix, w: Word): string {
  if (radix === 10) return n.toString()
  return BigInt.asUintN(w.bits, n).toString(radix).toUpperCase()
}

/** Digits in groups for reading: binary and hex by 4, octal and decimal by 3. */
export function groupDigits(digits: string, radix: Radix): string {
  const sign = digits.startsWith('-') ? '-' : ''
  let s = sign ? digits.slice(1) : digits
  const size = radix === 2 || radix === 16 ? 4 : 3
  if (radix === 2) s = s.padStart(Math.ceil(s.length / 4) * 4, '0')
  const groups: string[] = []
  for (let end = s.length; end > 0; end -= size) groups.unshift(s.slice(Math.max(0, end - size), end))
  return sign + groups.join(' ')
}

/** Can this digit be typed in the radix? */
export function isDigit(ch: string, radix: Radix): boolean {
  const d = parseInt(ch, 16)
  return !Number.isNaN(d) && /^[0-9a-f]$/i.test(ch) && d < radix
}

/** The character a code stands for, with names for the invisible ones. Null outside Unicode. */
export function characterOf(n: bigint): string | null {
  if (n < 0n || n > 0x10ffffn) return null
  const code = Number(n)
  if (code >= 0xd800 && code <= 0xdfff) return null
  if (code < 32) return CONTROL[code]
  if (code === 32) return 'space'
  if (code === 127) return 'DEL'
  if (code >= 0x80 && code < 0xa0) return 'control'
  return String.fromCodePoint(code)
}

const CONTROL = [
  'NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'TAB', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI',
  'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US',
]

// ---- reading an expression ----

type Token = { t: 'num'; v: bigint } | { t: 'op'; v: string }

/** Word operators; none of them is made of hex digits only, so "ADD" stays a number. */
const WORDS = new Set(['AND', 'OR', 'XOR', 'NOT', 'NAND', 'NOR', 'SHL', 'SHR', 'ROL', 'ROR', 'MOD'])
const SYMBOLS = ['<<', '>>', '&', '|', '^', '~', '+', '-', '−', '*', '×', '/', '÷', '%', '(', ')']
const ALIASES: Record<string, string> = {
  '<<': 'SHL', '>>': 'SHR', '&': 'AND', '|': 'OR', '^': 'XOR', '~': 'NOT', '%': 'MOD',
  '−': '-', '×': '*', '÷': '/',
}
const PREFIXES: Record<string, Radix> = { '0x': 16, '0b': 2, '0o': 8, '0d': 10 }

function tokenize(text: string, radix: Radix): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    const sym = SYMBOLS.find((s) => text.startsWith(s, i))
    if (sym) {
      tokens.push({ t: 'op', v: ALIASES[sym] ?? sym })
      i += sym.length
      continue
    }
    const m = /^[0-9A-Za-z_]+/.exec(text.slice(i))
    if (!m) throw new CalcError(`Unexpected “${ch}”`)
    const word = m[0]
    i += word.length
    if (WORDS.has(word.toUpperCase())) tokens.push({ t: 'op', v: word.toUpperCase() })
    else tokens.push({ t: 'num', v: parseNumber(word, radix) })
  }
  return tokens
}

function parseNumber(word: string, radix: Radix): bigint {
  let digits = word.replace(/_/g, '')
  const prefix = PREFIXES[digits.slice(0, 2).toLowerCase()]
  // in hex, 0B1 and 0D are numbers: only 0x and 0o work as prefixes there
  if (prefix && digits.length > 2 && !(radix === 16 && (prefix === 2 || prefix === 10))) {
    radix = prefix
    digits = digits.slice(2)
  }
  for (const ch of digits) {
    if (!isDigit(ch, radix)) throw new CalcError(`“${ch}” is not a ${RADIX_NAMES[radix]} digit`)
  }
  const literal = { 16: '0x', 8: '0o', 2: '0b', 10: '' }[radix] + digits
  return BigInt(literal)
}

/** Binding strength of each operator, loosest first, as in C. */
const LEVELS = [['OR', 'NOR'], ['XOR'], ['AND', 'NAND'], ['SHL', 'SHR', 'ROL', 'ROR'], ['+', '-'], ['*', '/', 'MOD']]

class Parser {
  private i = 0

  constructor(
    private tokens: Token[],
    private w: Word,
  ) {}

  parse(): bigint {
    const v = this.level(0)
    const rest = this.tokens[this.i]
    if (rest) throw new CalcError(rest.t === 'op' && rest.v === ')' ? 'Too many closing parentheses' : 'Missing operator')
    return v
  }

  private peekOp(): string | null {
    const tok = this.tokens[this.i]
    return tok?.t === 'op' ? tok.v : null
  }

  private level(n: number): bigint {
    if (n === LEVELS.length) return this.unary()
    let left = this.level(n + 1)
    for (;;) {
      const op = this.peekOp()
      if (!op || !LEVELS[n].includes(op)) return left
      this.i++
      left = this.apply(op, left, this.level(n + 1))
    }
  }

  private unary(): bigint {
    const op = this.peekOp()
    if (op === '-' || op === '+' || op === 'NOT') {
      this.i++
      const x = this.unary()
      return wrap(op === '-' ? -x : op === 'NOT' ? ~x : x, this.w)
    }
    return this.atom()
  }

  private atom(): bigint {
    const tok = this.tokens[this.i++]
    if (!tok) throw new CalcError('Incomplete expression')
    if (tok.t === 'num') return wrap(tok.v, this.w)
    if (tok.v === '(') {
      const v = this.level(0)
      // a missing closing parenthesis at the end is forgiven
      if (this.peekOp() === ')') this.i++
      else if (this.i < this.tokens.length) throw new CalcError('Missing operator')
      return v
    }
    throw new CalcError(tok.v === ')' ? 'Empty parentheses' : 'Incomplete expression')
  }

  private apply(op: string, a: bigint, b: bigint): bigint {
    const { bits } = this.w
    switch (op) {
      case '+':
        return wrap(a + b, this.w)
      case '-':
        return wrap(a - b, this.w)
      case '*':
        return wrap(a * b, this.w)
      case '/':
        if (b === 0n) throw new CalcError('Division by zero')
        return wrap(a / b, this.w) // rounds toward zero, as in C
      case 'MOD':
        if (b === 0n) throw new CalcError('Division by zero')
        return wrap(a % b, this.w)
      case 'AND':
        return wrap(a & b, this.w)
      case 'OR':
        return wrap(a | b, this.w)
      case 'XOR':
        return wrap(a ^ b, this.w)
      case 'NAND':
        return wrap(~(a & b), this.w)
      case 'NOR':
        return wrap(~(a | b), this.w)
    }
    // shifts and rotations: the count must be a small non-negative number
    if (b < 0n) throw new CalcError('Shift by a negative count')
    const k = b > BigInt(bits) ? BigInt(bits) : b
    switch (op) {
      case 'SHL':
        return wrap(a << k, this.w)
      case 'SHR':
        // signed: the sign bit is copied in (arithmetic shift); unsigned: zeros come in
        return wrap(a >> k, this.w)
      default: {
        const u = BigInt.asUintN(bits, a)
        const r = b % BigInt(bits)
        const turned = op === 'ROL' ? (u << r) | (u >> (BigInt(bits) - r)) : (u >> r) | (u << (BigInt(bits) - r))
        return wrap(turned, this.w)
      }
    }
  }
}

/** The value of an expression typed in the radix, or null when nothing is typed. */
export function evaluateProgrammer(text: string, radix: Radix, w: Word): bigint | null {
  const tokens = tokenize(text, radix)
  if (!tokens.length) return null
  return new Parser(tokens, w).parse()
}

/** The bit at a position (0 = the lowest) of the word, and the word with that bit flipped. */
export function bitAt(n: bigint, i: number, w: Word): boolean {
  return ((BigInt.asUintN(w.bits, n) >> BigInt(i)) & 1n) === 1n
}

export function flipBit(n: bigint, i: number, w: Word): bigint {
  return wrap(n ^ (1n << BigInt(i)), w)
}
