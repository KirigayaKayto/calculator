import { math, defineUnit } from './math'

export interface Currency {
  code: string
  name: string
  aliases: string[]
}

export const CURRENCIES: Currency[] = [
  { code: 'RUB', name: 'Российский рубль', aliases: ['₽', 'руб', 'рубль', 'рубля', 'рублей', 'рублях'] },
  { code: 'USD', name: 'Доллар США', aliases: ['$', 'долл', 'доллар', 'доллара', 'долларов', 'долларах'] },
  { code: 'EUR', name: 'Евро', aliases: ['€', 'евро'] },
  { code: 'CNY', name: 'Китайский юань', aliases: ['юань', 'юаня', 'юаней'] },
  { code: 'KZT', name: 'Казахстанский тенге', aliases: ['тенге'] },
  { code: 'UZS', name: 'Узбекский сум', aliases: ['сум', 'сума', 'сумов'] },
  { code: 'BYN', name: 'Белорусский рубль', aliases: [] },
  { code: 'KGS', name: 'Киргизский сом', aliases: ['сом', 'сома', 'сомов'] },
  { code: 'TJS', name: 'Таджикский сомони', aliases: ['сомони'] },
  { code: 'AMD', name: 'Армянский драм', aliases: ['драм', 'драма', 'драмов'] },
  { code: 'GEL', name: 'Грузинский лари', aliases: ['лари'] },
  { code: 'AZN', name: 'Азербайджанский манат', aliases: ['манат', 'маната', 'манатов'] },
  { code: 'UAH', name: 'Украинская гривна', aliases: ['гривна', 'гривны', 'гривен'] },
  { code: 'TRY', name: 'Турецкая лира', aliases: ['лира', 'лиры', 'лир'] },
  { code: 'AED', name: 'Дирхам ОАЭ', aliases: ['дирхам', 'дирхама', 'дирхамов'] },
  { code: 'GBP', name: 'Фунт стерлингов', aliases: [] },
  { code: 'JPY', name: 'Японская иена', aliases: ['иена', 'иены', 'иен'] },
  { code: 'CHF', name: 'Швейцарский франк', aliases: [] },
  { code: 'PLN', name: 'Польский злотый', aliases: ['злотый', 'злотых'] },
  { code: 'CZK', name: 'Чешская крона', aliases: [] },
  { code: 'ILS', name: 'Израильский шекель', aliases: ['шекель', 'шекеля', 'шекелей'] },
  { code: 'INR', name: 'Индийская рупия', aliases: ['рупия', 'рупии', 'рупий'] },
  { code: 'THB', name: 'Тайский бат', aliases: ['бат', 'бата', 'батов'] },
  { code: 'KRW', name: 'Южнокорейская вона', aliases: [] },
  { code: 'CAD', name: 'Канадский доллар', aliases: [] },
  { code: 'AUD', name: 'Австралийский доллар', aliases: [] },
]

export interface Rates {
  /** Units of each currency per 1 USD. */
  rates: Record<string, number>
  /** When the provider last updated the rates (ms). */
  updated: number
  /** When we downloaded them (ms). */
  fetched: number
}

const BASE = 'USD'

function aliasesOf(c: Currency) {
  return [c.code.toLowerCase(), ...c.aliases]
}

// USD is the base of the currency dimension; the others are defined through it once rates are known.
defineUnit(BASE, undefined, aliasesOf(CURRENCIES.find((c) => c.code === BASE)!))

export function applyRates(r: Rates) {
  for (const c of CURRENCIES) {
    const perUsd = r.rates[c.code]
    if (c.code === BASE || !perUsd) continue
    const usd = math.divide(math.bignumber(1), math.bignumber(perUsd)) as unknown as { toFixed(): string }
    try {
      defineUnit(c.code, `${usd.toFixed()} ${BASE}`, aliasesOf(c), true)
    } catch (e) {
      console.warn(`currency ${c.code}:`, e)
    }
  }
}

async function getJson(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal, cache: 'no-store' })
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.json()
}

/** Download today's rates: open.er-api.com first, the Central Bank of Russia mirror as a fallback. */
export async function fetchRates(timeoutMs = 8000): Promise<Rates> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    try {
      const j = await getJson('https://open.er-api.com/v6/latest/USD', ctrl.signal)
      if (j.result !== 'success') throw new Error('open.er-api.com: ' + j.result)
      return { rates: j.rates, updated: j.time_last_update_unix * 1000, fetched: Date.now() }
    } catch (e) {
      if (ctrl.signal.aborted) throw e
      // rates here are per 1 RUB
      const j = await getJson('https://www.cbr-xml-daily.ru/latest.js', ctrl.signal)
      const perRub: Record<string, number> = { ...j.rates, RUB: 1 }
      const rates: Record<string, number> = {}
      for (const [code, v] of Object.entries(perRub)) rates[code] = v / perRub.USD
      return { rates, updated: j.timestamp * 1000, fetched: Date.now() }
    }
  } finally {
    clearTimeout(timer)
  }
}
