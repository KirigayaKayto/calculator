/**
 * Textbook-style input (MathLive) produces LaTeX; this turns it into an expression mathjs understands.
 * Only what the calculator can produce or a person can type is supported.
 */
import { CalcError, IncompleteError } from './errors'

export interface LatexOptions {
  /** 2½ means 2 + ½ (school); by default a number before a fraction multiplies it (university). */
  mixedNumbers?: boolean
}

type Token = { t: 'cmd' | 'ch' | 'text' | 'op'; v: string }

/** Commands whose argument is plain text: \text{m}, \operatorname{nCr}. */
const TEXT_COMMANDS: Record<string, Token['t']> = {
  text: 'text',
  textrm: 'text',
  textit: 'text',
  mbox: 'text',
  mathrm: 'text',
  mathit: 'text',
  operatorname: 'op',
}

function readGroup(src: string, open: number): [string, number] {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '\\') i++
    else if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return [src.slice(open + 1, i), i + 1]
  }
  return [src.slice(open + 1), src.length]
}

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+|[^a-zA-Z])/.exec(src.slice(i))
      if (!m) break
      i += m[0].length
      const kind = TEXT_COMMANDS[m[1]]
      if (kind) {
        while (src[i] === ' ') i++
        if (src[i] === '{') {
          const [content, end] = readGroup(src, i)
          // MathLive nests styles: \operatorname{\mathrm{nCr}}
          const plain = content
            .replace(/\\(?:mathrm|mathit|text|textrm|textit|mbox|operatorname)\s*\{([^{}]*)\}/g, '$1')
            .replace(/\\[,;:! ]/g, ' ')
          out.push({ t: kind, v: plain })
          i = end
          continue
        }
      }
      out.push({ t: 'cmd', v: m[1] })
    } else if (/\s/.test(c)) {
      i++
    } else {
      const ch = String.fromCodePoint(src.codePointAt(i)!)
      out.push({ t: 'ch', v: ch })
      i += ch.length
    }
  }
  return out
}

/** LaTeX function names → calculator functions; tg, ctg, lg are the European spellings. */
const FUNCTIONS: Record<string, string> = {
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  tg: 'tan',
  cot: 'cot',
  ctg: 'cot',
  sec: 'sec',
  csc: 'csc',
  arcsin: 'asin',
  arccos: 'acos',
  arctan: 'atan',
  arctg: 'atan',
  arccot: 'acot',
  sinh: 'sinh',
  cosh: 'cosh',
  tanh: 'tanh',
  arsinh: 'asinh',
  arcosh: 'acosh',
  artanh: 'atanh',
  ln: 'ln',
  lg: 'lg',
  log: 'log',
  exp: 'exp',
  nCr: 'combinations',
  nPr: 'permutations',
  gcd: 'gcd',
  lcm: 'lcm',
  sign: 'sign',
  sgn: 'sign',
}

/** sin⁻¹ x is arcsin x, not 1/sin x. */
const INVERSE: Record<string, string> = {
  sin: 'asin',
  cos: 'acos',
  tan: 'atan',
  cot: 'acot',
  sinh: 'asinh',
  cosh: 'acosh',
  tanh: 'atanh',
}

const SYMBOLS: Record<string, string> = {
  cdot: '*',
  times: '*',
  ast: '*',
  div: '/',
  colon: '/',
  pi: ' pi ',
  exponentialE: ' e ',
  imaginaryI: ' i ',
  infty: ' Infinity ',
  degree: ' deg',
  circ: ' deg',
  '%': '%',
  bmod: ' mod ',
  mod: ' mod ',
  ',': ' ',
  ';': ' ',
  ':': ' ',
  '!': '',
  ' ': ' ',
  quad: ' ',
  qquad: ' ',
  '{': '(',
  '}': ')',
  lbrace: '(',
  rbrace: ')',
  lbrack: '(',
  rbrack: ')',
}

const LEFT = new Set(['left', 'mleft', 'bigl', 'Bigl', 'biggl', 'Biggl'])
const RIGHT = new Set(['right', 'mright', 'bigr', 'Bigr', 'biggr', 'Biggr'])
const FRACTIONS = new Set(['frac', 'dfrac', 'tfrac', 'cfrac'])
const IGNORED = new Set(['displaystyle', 'textstyle', 'mathbin', 'mathrel', 'mathord', 'mathop', 'limits', 'nolimits'])

/** "(a,b)" → "a,b" when the outer parentheses belong together, so f((a,b)) does not get one argument. */
function unwrap(s: string): string {
  if (!s.startsWith('(') || !s.endsWith(')')) return s
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')' && --depth === 0 && i < s.length - 1) return s
  }
  return s.slice(1, -1)
}

const INTEGER = /^\d+$/
/** A whole number right before a fraction makes a mixed number: 2½ = 2 + ½. */
const TRAILING_INTEGER = /(?<![\d.\p{L}_)])(\d+)$/u

class Parser {
  private i = 0
  /** Inside |…| written with bare bars. */
  private absOpen = false

  constructor(
    private toks: Token[],
    private options: LatexOptions,
  ) {}

  private peek(offset = 0): Token | undefined {
    return this.toks[this.i + offset]
  }

  private isCh(tok: Token | undefined, v: string) {
    return tok?.t === 'ch' && tok.v === v
  }

  private isCmd(tok: Token | undefined, set: Set<string>) {
    return tok?.t === 'cmd' && set.has(tok.v)
  }

  parse(): string {
    return this.seq()
  }

  private seq(stop?: (t: Token) => boolean): string {
    let out = ''
    while (this.i < this.toks.length) {
      if (stop?.(this.toks[this.i])) break
      out = this.item(out)
    }
    return out
  }

  /** Content of {…}, after the opening brace was consumed. */
  private groupRest(): string {
    const inner = this.seq((t) => this.isCh(t, '}'))
    this.i++ // the closing brace
    return inner
  }

  /** One argument: {group}, a command, or a single character (\frac12). */
  private arg(): string {
    const tok = this.toks[this.i]
    if (!tok) throw new IncompleteError()
    if (this.isCh(tok, '{')) {
      this.i++
      const inner = this.groupRest()
      if (!inner.trim()) throw new IncompleteError()
      return inner
    }
    if (tok.t === 'ch') {
      this.i++
      return tok.v
    }
    return this.item('')
  }

  private optionalArg(): string | null {
    if (!this.isCh(this.peek(), '[')) return null
    this.i++
    const inner = this.seq((t) => this.isCh(t, ']'))
    this.i++
    return inner
  }

  /** A delimiter after \left or \right: ( [ | . \{ \vert … */
  private delimiter(): string {
    const tok = this.toks[this.i++]
    if (!tok) return '.'
    if (tok.t === 'cmd') {
      if (['vert', 'lvert', 'rvert', '|', 'Vert'].includes(tok.v)) return '|'
      if (['{', 'lbrace', 'langle'].includes(tok.v)) return '('
      if (['}', 'rbrace', 'rangle', 'rfloor', 'rceil'].includes(tok.v)) return ')'
      if (tok.v === 'lfloor' || tok.v === 'lceil') return tok.v
      return '.'
    }
    return tok.v
  }

  private fenced(): string {
    const open = this.delimiter()
    const inner = this.seq((t) => this.isCmd(t, RIGHT))
    if (this.isCmd(this.peek(), RIGHT)) {
      this.i++
      this.delimiter()
    }
    if (open === '|') return `abs(${inner})`
    if (open === 'lfloor') return `floor(${inner})`
    if (open === 'lceil') return `ceil(${inner})`
    if (open === '.') return inner
    return `(${inner})`
  }

  /** ⌊x⌋ and ⌈x⌉ written without \left and \right. */
  private bracketed(fn: string, close: string): string {
    const inner = this.seq((t) => t.t === 'cmd' && t.v === close)
    this.i++ // the closing bracket
    return `${fn}(${inner})`
  }

  /** The argument of sin, lg…: (…) if it has one, otherwise the next number or symbol, as in "sin 30°". */
  private functionArgument(): string {
    const tok = this.peek()
    if (!tok) throw new IncompleteError()
    if (this.isCmd(tok, LEFT)) {
      this.i++
      return this.fenced()
    }
    if (this.isCh(tok, '(')) return this.item('')
    if (tok.t === 'ch' && /[\d.]/.test(tok.v)) {
      let num = ''
      for (;;) {
        const t = this.peek()
        if (t?.t === 'ch' && /[\d.]/.test(t.v)) {
          num += t.v
          this.i++
        } else if (this.isCh(t, '{') && this.isCh(this.peek(1), ',') && this.isCh(this.peek(2), '}')) {
          num += '.'
          this.i += 3
        } else break
      }
      // degrees belong to the argument: sin 30°
      if (this.isCh(this.peek(), '^')) {
        const save = this.i
        this.i++
        if (this.arg().trim() === 'deg') return num + ' deg'
        this.i = save
      }
      if (this.peek()?.t === 'cmd' && ['degree', 'circ'].includes(this.peek()!.v)) {
        this.i++
        return num + ' deg'
      }
      return num
    }
    return this.item('')
  }

  private func(name: string, out: string): string {
    let base: string | null = null
    let power: string | null = null
    for (;;) {
      if (this.isCh(this.peek(), '_')) {
        this.i++
        base = this.arg()
      } else if (this.isCh(this.peek(), '^')) {
        this.i++
        power = this.arg()
      } else break
    }
    if (power?.replace(/[\s()]/g, '') === '-1' && INVERSE[name]) {
      name = INVERSE[name]
      power = null
    }
    const x = unwrap(this.functionArgument())
    let call = base !== null && name === 'log' ? `log(${x},${base})` : `${name}(${x})`
    if (power !== null) call = `(${call})^(${power})`
    return `${out} ${call}`
  }

  private item(out: string): string {
    const tok = this.toks[this.i++]

    if (tok.t === 'text') return `${out} ${tok.v} `
    if (tok.t === 'op') {
      const fn = FUNCTIONS[tok.v]
      return fn ? this.func(fn, out) : `${out} ${tok.v} `
    }

    if (tok.t === 'ch') {
      switch (tok.v) {
        case '{': {
          const inner = this.groupRest()
          return out + (inner === ',' ? '.' : inner) // {,} is the decimal comma
        }
        case '}':
          return out
        case '(': {
          const inner = this.seq((t) => this.isCh(t, ')'))
          this.i++ // the closing parenthesis, if there is one
          return `${out}(${inner})`
        }
        case '^': {
          const exponent = this.arg()
          return exponent.trim() === 'deg' ? `${out} deg` : `${out}^(${exponent})`
        }
        case '_':
          return `${out}_${this.arg().trim()}`
        case '|':
          this.absOpen = !this.absOpen
          return out + (this.absOpen ? 'abs(' : ')')
        case ';':
          return `${out},`
        case '[':
          return `${out}(`
        case ']':
          return `${out})`
        default:
          return out + tok.v
      }
    }

    const cmd = tok.v
    if (FRACTIONS.has(cmd)) {
      const num = this.arg()
      const den = this.arg()
      const whole = this.options.mixedNumbers ? out.match(TRAILING_INTEGER) : null
      if (whole && INTEGER.test(num.trim()) && INTEGER.test(den.trim())) {
        return `${out.slice(0, out.length - whole[1].length)}(${whole[1]}+${num.trim()}/${den.trim()})`
      }
      return `${out}((${num})/(${den}))`
    }
    if (cmd === 'binom' || cmd === 'dbinom' || cmd === 'tbinom') {
      const n = this.arg()
      const k = this.arg()
      return `${out} combinations(${n},${k})`
    }
    if (cmd === 'lfloor') return out + this.bracketed('floor', 'rfloor')
    if (cmd === 'lceil') return out + this.bracketed('ceil', 'rceil')
    if (cmd === 'sqrt') {
      const n = this.optionalArg()
      const x = this.arg()
      return out + (n?.trim() ? `nthRoot(${x},${n})` : `sqrt(${x})`)
    }
    if (LEFT.has(cmd)) return out + this.fenced()
    if (RIGHT.has(cmd)) {
      this.delimiter()
      return out
    }
    if (cmd === 'placeholder') throw new IncompleteError()
    if (cmd in FUNCTIONS) return this.func(FUNCTIONS[cmd], out)
    if (cmd in SYMBOLS) return out + SYMBOLS[cmd]
    if (IGNORED.has(cmd)) return out
    throw new CalcError(`Not supported: \\${cmd}`)
  }
}

/** Convert LaTeX from the textbook-style field into a mathjs expression. */
export function latexToExpr(latex: string, options: LatexOptions = {}): string {
  return new Parser(tokenize(latex), options).parse().replace(/\s+/g, ' ').trim()
}
