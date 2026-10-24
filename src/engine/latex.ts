/**
 * Textbook-style input (MathLive) produces LaTeX; this turns it into an expression mathjs understands.
 * Only what the calculator can produce or a person can type is supported.
 */
import { CalcError, IncompleteError } from './errors'
import { CONSTANT_BY_ID, constantVar } from './constants'

export interface LatexOptions {
  /** 2½ means 2 + ½ (school); by default a number before a fraction multiplies it (university). */
  mixedNumbers?: boolean
  /**
   * Letters side by side are separate variables: ax = a·x (the graph). Otherwise they make a
   * word, so units typed as letters keep working in the calculator: 5 km.
   */
  splitLetters?: boolean
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
          // MathLive nests styles: \operatorname{\mathrm{nCr}}; units use Ω and µ: \mathrm{k\Omega}, \mathrm{\mu m}
          const plain = content
            .replace(/\\(?:mathrm|mathit|text|textrm|textit|mbox|operatorname)\s*\{([^{}]*)\}/g, '$1')
            .replace(/\\Omega\s*/g, 'ohm')
            .replace(/\\mu\s*/g, 'u')
            .replace(/\\degree\s*/g, '°')
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
  max: 'max',
  min: 'min',
  sign: 'sign',
  sgn: 'sign',
  det: 'det',
  dot: 'dot',
  cross: 'cross',
  norm: 'norm',
  tr: 'trace',
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
  // unit conversion: 5 km → m
  to: ' to ',
  rightarrow: ' to ',
  // a measurement with its uncertainty, 2.50 ± 0.02; see lab.ts
  pm: ' ± ',
  // relations, for equations and inequalities in the graph
  le: '<=',
  leq: '<=',
  ge: '>=',
  geq: '>=',
  lt: '<',
  gt: '>',
  // f′(x): the derivative of a function defined in the graph
  prime: '__prime',
  // Greek letters used as variables
  alpha: ' alpha ',
  beta: ' beta ',
  gamma: ' gamma ',
  delta: ' delta ',
  theta: ' theta ',
  lambda: ' lambda ',
  mu: ' mu ',
  rho: ' rho ',
  tau: ' tau ',
  phi: ' phi ',
  varphi: ' phi ',
  omega: ' omega ',
  Delta: ' Delta ',
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
      const tok = this.toks[this.i]
      if (stop?.(tok)) break
      // r∠θ: everything before the angle sign is the length, everything after it the angle
      if (tok.t === 'cmd' && tok.v === 'angle') {
        this.i++
        const theta = this.seq(stop)
        if (!out.trim() || !theta.trim()) throw new IncompleteError()
        return `polar(${out},${theta})`
      }
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

  /**
   * \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix} → [[1,2],[3,4]]. A single row or column is a
   * vector [1,2,3]; vmatrix is the determinant.
   */
  private environment(): string {
    const env = this.arg().trim()
    const rows: string[][] = [[]]
    let cell = ''
    while (this.i < this.toks.length) {
      const t = this.toks[this.i]
      if (t.t === 'cmd' && t.v === 'end') {
        this.i++
        this.arg()
        break
      }
      if (t.t === 'cmd' && t.v === '\\') {
        this.i++
        rows[rows.length - 1].push(cell)
        rows.push([])
        cell = ''
      } else if (t.t === 'ch' && t.v === '&') {
        this.i++
        rows[rows.length - 1].push(cell)
        cell = ''
      } else {
        cell = this.item(cell)
      }
    }
    rows[rows.length - 1].push(cell)
    const filled = rows.filter((r) => r.some((c) => c.trim()))
    if (!filled.length || filled.some((r) => r.some((c) => !c.trim()))) throw new IncompleteError()
    if (!/matrix$/.test(env)) throw new CalcError(`Not supported: ${env}`)
    const matrix =
      filled.length === 1
        ? `[${filled[0].join(',')}]`
        : filled.every((r) => r.length === 1)
          ? `[${filled.map((r) => r[0]).join(',')}]`
          : `[${filled.map((r) => `[${r.join(',')}]`).join(',')}]`
    return env === 'vmatrix' ? `det(${matrix})` : matrix
  }

  /** "d" over "dx" is d/dx; "d^(2)" over "dx^(2)" is d²/dx². */
  private derivativeOrder(num: string, den: string): { order: number; variable: string } | null {
    const n = num.replace(/\s+/g, '')
    const m = /^d([a-zA-Z])(?:\^\((\d)\))?$/.exec(den.replace(/\s+/g, ''))
    if (!m) return null
    const order = n === 'd' ? 1 : Number(/^d\^\((\d)\)$/.exec(n)?.[1] ?? 0)
    return order && order === Number(m[2] ?? 1) ? { order, variable: m[1] } : null
  }

  /**
   * ∫ₐᵇ f(x) dx → __int(a, b, f(x), "x"), which the graph integrates numerically.
   * The differential "dx" closes the integrand.
   */
  private integral(): string {
    let lower: string | null = null
    let upper: string | null = null
    for (;;) {
      if (this.isCh(this.peek(), '_')) {
        this.i++
        lower = this.arg()
      } else if (this.isCh(this.peek(), '^')) {
        this.i++
        upper = this.arg()
      } else break
    }
    let end = -1
    let depth = 0
    for (let j = this.i; j < this.toks.length; j++) {
      const t = this.toks[j]
      if (this.isCh(t, '{') || this.isCmd(t, LEFT)) depth++
      else if (this.isCh(t, '}') || this.isCmd(t, RIGHT)) {
        if (depth === 0) break
        depth--
      } else if (depth === 0 && this.isCh(t, 'd') && /^[a-zA-Z]$/.test(this.toks[j + 1]?.v ?? '') && this.toks[j + 1].t === 'ch') {
        const after = this.toks[j + 2]
        if (!after || this.isCh(after, '}') || this.isCmd(after, RIGHT) || (after.t === 'ch' && /[-+=<>,)]/.test(after.v))) {
          end = j
          break
        }
      }
    }
    if (end < 0) throw new CalcError('End the integral with dx')
    const variable = this.toks[end + 1].v
    const integrand = this.seq(() => this.i === end)
    this.i = end + 2
    if (!integrand.trim()) throw new IncompleteError()
    if (lower === null || upper === null) throw new CalcError('Indefinite integrals: use the Calculator')
    return ` __int(${lower},${upper},${integrand},"${variable}")`
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
          const exponent = this.arg().trim()
          if (exponent === 'deg') return `${out} deg`
          // Aᵀ, the transpose
          if (exponent === 'T') return `${out}'`
          // f′ and f″ become the names f__prime and f__prime__prime
          if (/^(?:__prime)+$/.test(exponent.replace(/\s+/g, ''))) return out.trimEnd() + exponent.replace(/\s+/g, '')
          return `${out}^(${exponent})`
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
          if (this.options.splitLetters && /^[A-Za-z]$/.test(tok.v) && /\w$/.test(out)) return `${out} ${tok.v}`
          return out + tok.v
      }
    }

    const cmd = tok.v
    if (FRACTIONS.has(cmd)) {
      const num = this.arg()
      const den = this.arg()
      // d/dx (…), d²/dx² (…): numerically evaluable only in the graph, symbolically by the CAS
      const d = this.derivativeOrder(num, den)
      if (d) {
        let inner = unwrap(this.functionArgument())
        for (let k = 0; k < d.order; k++) inner = `__d${d.variable}(${inner})`
        return `${out} ${inner}`
      }
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
    if (cmd === 'begin') return out + this.environment()
    if (cmd === 'int') return out + this.integral()
    if (CONSTANT_BY_ID[cmd]) return `${out} ${constantVar(cmd)} `
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

/**
 * Close parentheses the person left open, where they belong: at the end of their group
 * (a fraction's numerator, a \left…\right pair) and before the "dx" of an integral.
 * "\sin(x^2" → "\sin(x^2)", "\int\cos(x\,dx" → "\int\cos(x)\,dx".
 */
export function balanceParens(latex: string): string {
  let out = ''
  const open = [0] // unclosed "(" in each nested group
  const closeGroup = () => {
    out += ')'.repeat(open[open.length - 1])
    open[open.length - 1] = 0
  }
  let i = 0
  while (i < latex.length) {
    const rest = latex.slice(i)
    let m: RegExpExecArray | null
    if ((m = /^\\left(?:\\[a-zA-Z]+|\\.|.)/.exec(rest))) {
      open.push(0)
    } else if ((m = /^\\right(?:\\[a-zA-Z]+|\\.|.)/.exec(rest))) {
      closeGroup()
      if (open.length > 1) open.pop()
    } else if ((m = /^\\,\s*d(?=[a-zA-Z](?![a-zA-Z]))/.exec(rest)) && out.includes('\\int')) {
      closeGroup() // the differential ends the integrand
    } else if ((m = /^\\[a-zA-Z]+|^\\./.exec(rest))) {
      // a command, or an escaped \{ \}
    } else {
      const c = latex[i]
      if (c === '{') open.push(0)
      else if (c === '}') {
        closeGroup()
        if (open.length > 1) open.pop()
      } else if (c === '(') open[open.length - 1]++
      else if (c === ')' && open[open.length - 1] > 0) open[open.length - 1]--
      out += c
      i++
      continue
    }
    out += m[0]
    i += m[0].length
  }
  return out + ')'.repeat(open.reduce((a, b) => a + b, 0))
}

/** Convert LaTeX from the textbook-style field into a mathjs expression. */
export function latexToExpr(latex: string, options: LatexOptions = {}): string {
  return new Parser(tokenize(latex), options).parse().replace(/\s+/g, ' ').trim()
}
