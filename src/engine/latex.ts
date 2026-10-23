/**
 * Textbook-style input (MathLive) produces LaTeX; this turns it into an expression mathjs understands.
 * Only what the calculator can produce or a person can type is supported.
 */

/** The formula still has empty boxes (placeholders) to fill. */
export class IncompleteError extends Error {
  constructor() {
    super('Заполните пустые места')
  }
}

type Token = { t: 'cmd' | 'ch' | 'text' | 'op'; v: string }

/** Commands whose argument is plain text: \text{км}, \operatorname{tg}. */
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
          // MathLive nests styles: \operatorname{\mathrm{tg}}
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

/** Russian textbook names included: tg, ctg, arctg. */
const FUNCTIONS: Record<string, string> = {
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  tg: 'tan',
  cot: 'cot',
  ctg: 'cot',
  arcsin: 'asin',
  arccos: 'acos',
  arctan: 'atan',
  arctg: 'atan',
  sinh: 'sinh',
  cosh: 'cosh',
  tanh: 'tanh',
  ln: 'ln',
  lg: 'lg',
  log: 'log',
  exp: 'exp',
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

const INTEGER = /^\d+$/
/** A whole number right before a fraction makes a mixed number: 2½ = 2 + ½. */
const TRAILING_INTEGER = /(?<![\d.\p{L}_)])(\d+)$/u

class Parser {
  private i = 0
  /** Inside |…| written with bare bars. */
  private absOpen = false

  constructor(private toks: Token[]) {}

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
      if (['}', 'rbrace', 'rangle'].includes(tok.v)) return ')'
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
    if (open === '.') return inner
    return `(${inner})`
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
    const x = this.functionArgument()
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
      const whole = out.match(TRAILING_INTEGER)
      if (whole && INTEGER.test(num.trim()) && INTEGER.test(den.trim())) {
        return `${out.slice(0, out.length - whole[1].length)}(${whole[1]}+${num.trim()}/${den.trim()})`
      }
      return `${out}((${num})/(${den}))`
    }
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
    throw new Error(`Не поддерживается: \\${cmd}`)
  }
}

/** Convert LaTeX from the textbook-style field into a mathjs expression. */
export function latexToExpr(latex: string): string {
  return new Parser(tokenize(latex)).parse().replace(/\s+/g, ' ').trim()
}
