import { create, all, type BigNumber, type MathJsInstance } from 'mathjs'

export type Angle = 'deg' | 'rad'

// predictable: sqrt(-1), asin(2), log(-1) give NaN ("не определено") instead of complex numbers,
// which is what people expect from a calculator.
export const math: MathJsInstance = create(all, {
  number: 'BigNumber',
  precision: 64,
  predictable: true,
})

// ---- Cyrillic and currency symbols in variable and unit names ----

const CYRILLIC = /^[Ѐ-ӿ]$/
const CURRENCY_SIGNS = /^[$€₽]$/

const parser = math.parse as unknown as {
  isAlpha: (c: string, cPrev: string, cNext: string) => boolean
}
const isAlphaOriginal = parser.isAlpha
parser.isAlpha = (c, cPrev, cNext) =>
  isAlphaOriginal(c, cPrev, cNext) || CYRILLIC.test(c) || CURRENCY_SIGNS.test(c)

interface UnitStatic {
  isValidAlpha: (c: string) => boolean
  isValuelessUnit: (name: string) => boolean
}
export const UnitClass = (math as unknown as { Unit: UnitStatic }).Unit
const isValidAlphaOriginal = UnitClass.isValidAlpha
UnitClass.isValidAlpha = (c) => isValidAlphaOriginal(c) || CYRILLIC.test(c) || CURRENCY_SIGNS.test(c)

const ownUnits = new Set<string>()

/** Create a unit; with `override`, redefine only units created here, never the built-in ones. */
export function defineUnit(name: string, definition: string | undefined, aliases: string[] = [], override = false) {
  const isFree = (n: string) => !UnitClass.isValuelessUnit(n) || (override && ownUnits.has(n))
  if (!isFree(name)) return
  const free = aliases.filter(isFree)
  math.createUnit(name, { definition, aliases: free }, { override })
  for (const n of [name, ...free]) ownUnits.add(n)
}

// ---- Russian unit names ----

const RU_UNITS: [string, string, string[]?][] = [
  // длина
  ['мкм', '1 um'],
  ['мм', '1 mm'],
  ['см', '1 cm'],
  ['дм', '1 dm'],
  ['м', '1 m', ['метр', 'метра', 'метров']],
  ['км', '1 km'],
  ['дюйм', '1 inch', ['дюйма', 'дюймов']],
  ['фут', '1 ft', ['фута', 'футов']],
  ['ярд', '1 yd', ['ярда', 'ярдов']],
  ['миля', '1 mi', ['мили', 'миль']],
  ['мормиля', '1852 m'],
  // масса
  ['мг', '1 mg'],
  ['г', '1 g', ['грамм', 'грамма', 'граммов']],
  ['кг', '1 kg'],
  ['ц', '100 kg'],
  ['т', '1000 kg', ['тонна', 'тонны', 'тонн']],
  ['фунт', '1 lbm', ['фунта', 'фунтов']],
  ['унция', '1 oz', ['унции', 'унций']],
  ['карат', '0.2 g'],
  // время
  ['мс', '1 ms'],
  ['с', '1 s', ['сек']],
  ['мин', '1 min'],
  ['ч', '1 h', ['час', 'часа', 'часов']],
  ['сут', '1 day', ['день', 'дня', 'дней', 'дн']],
  ['нед', '1 week', ['неделя', 'недели', 'недель']],
  ['мес', '1 month', ['месяц', 'месяца', 'месяцев']],
  ['год', '1 year', ['года', 'лет']],
  // площадь
  ['ар', '100 m^2', ['сотка', 'сотки', 'соток']],
  ['га', '10000 m^2'],
  ['акр', '1 acre'],
  // объём
  ['мл', '1 ml'],
  ['л', '1 l', ['литр', 'литра', 'литров']],
  ['галлон', '1 gal'],
  // скорость
  ['узел', '1852 m/h', ['узла', 'узлов']],
  // данные: как в Проводнике Windows, 1 КБ = 1024 Б
  ['бит', '1 b'],
  ['Б', '1 B', ['байт']],
  ['КБ', '1024 B'],
  ['МБ', '1048576 B'],
  ['ГБ', '1073741824 B'],
  ['ТБ', '1099511627776 B'],
  // энергия и мощность
  ['Дж', '1 J'],
  ['кДж', '1 kJ'],
  ['кал', '4.184 J'],
  ['ккал', '4184 J'],
  ['Вт', '1 W'],
  ['кВт', '1 kW'],
  ['МВт', '1 MW'],
  ['лс', '735.49875 W'],
  // давление
  ['Па', '1 Pa'],
  ['кПа', '1 kPa'],
  ['МПа', '1 MPa'],
  ['бар', '1 bar'],
  ['атм', '1 atm'],
  ['ммртст', '1 mmHg'],
  // углы
  ['градус', '1 deg', ['градуса', 'градусов', 'град']],
  ['рад', '1 rad'],
]

for (const [name, definition, aliases] of RU_UNITS) {
  try {
    defineUnit(name, definition, aliases)
  } catch (e) {
    console.warn(`unit ${name}:`, e)
  }
}

// ---- functions that behave like a regular calculator ----

const PI = math.pi as unknown as BigNumber

function isBig(x: unknown): x is BigNumber {
  return math.isBigNumber(x)
}

/** Remove the last-digit noise of 64-digit trig, so sin(30°) is exactly 0.5 and sin(180°) is 0. */
function snap(x: unknown, places = 58): unknown {
  return isBig(x) && x.isFinite() ? x.toDecimalPlaces(places) : x
}

function toRadians(x: unknown, angle: Angle): unknown {
  if (angle === 'rad' || math.isUnit(x)) return x
  return math.multiply(x as BigNumber, math.divide(PI, 180) as BigNumber)
}

function fromRadians(x: unknown, angle: Angle): unknown {
  if (angle === 'rad') return snap(x)
  return snap(math.multiply(x as BigNumber, math.divide(180, PI) as BigNumber), 50)
}

function undefinedResult(): never {
  throw new Error('Не определено')
}

/** Functions placed in the evaluation scope; mathjs resolves scope before its built-ins. */
export function calculatorFunctions(angle: Angle): Map<string, unknown> {
  const sin = (x: unknown) => snap(math.sin(toRadians(x, angle) as BigNumber))
  const cos = (x: unknown) => snap(math.cos(toRadians(x, angle) as BigNumber))
  const tan = (x: unknown) => {
    // tan(90°) must be an error, not 10^63
    if (angle === 'deg' && isBig(x) && x.minus(90).mod(180).isZero()) undefinedResult()
    const r = snap(math.tan(toRadians(x, angle) as BigNumber))
    if (isBig(r) && r.abs().gt(1e40)) undefinedResult()
    return r
  }
  const cot = (x: unknown) => {
    const t = tan(x)
    if (isBig(t) && t.isZero()) undefinedResult()
    return math.divide(1, t as BigNumber)
  }
  const log10 = (x: unknown) => math.log10(x as BigNumber)
  const fns: Record<string, unknown> = {
    sin,
    cos,
    tan,
    tg: tan,
    cot,
    ctg: cot,
    asin: (x: unknown) => fromRadians(math.asin(x as BigNumber), angle),
    acos: (x: unknown) => fromRadians(math.acos(x as BigNumber), angle),
    atan: (x: unknown) => fromRadians(math.atan(x as BigNumber), angle),
    arcsin: (x: unknown) => fromRadians(math.asin(x as BigNumber), angle),
    arccos: (x: unknown) => fromRadians(math.acos(x as BigNumber), angle),
    arctg: (x: unknown) => fromRadians(math.atan(x as BigNumber), angle),
    // as on any calculator: log is base 10, ln is natural
    log: (x: unknown, base?: unknown) =>
      base === undefined ? log10(x) : math.log(x as BigNumber, base as BigNumber),
    lg: log10,
    ln: (x: unknown) => math.log(x as BigNumber),
  }
  return new Map(Object.entries(fns))
}

/**
 * Scope for mathjs: built-in calculator functions underneath, user variables on top.
 * Assignments always land in `vars`.
 */
export class Scope {
  constructor(
    private base: Map<string, unknown>,
    readonly vars: Map<string, unknown> = new Map(),
  ) {}
  get(key: string) {
    return this.vars.has(key) ? this.vars.get(key) : this.base.get(key)
  }
  set(key: string, value: unknown) {
    this.vars.set(key, value)
    return this
  }
  has(key: string) {
    return this.vars.has(key) || this.base.has(key)
  }
  keys() {
    return new Set([...this.base.keys(), ...this.vars.keys()]).values()
  }
  delete(key: string) {
    return this.vars.delete(key)
  }
  clear() {
    this.vars.clear()
  }
  forEach(cb: (value: unknown, key: string) => void) {
    for (const key of this.keys()) cb(this.get(key), key)
  }
  [Symbol.iterator]() {
    return [...this.keys()].map((k) => [k, this.get(k)] as [string, unknown])[Symbol.iterator]()
  }
}
