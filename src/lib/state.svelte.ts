import { MediaQuery } from 'svelte/reactivity'
import { load, save } from './storage'
import type { CalcSettings } from '../engine/calc'
import { applyRates, fetchRates, type Rates } from '../engine/currency'

export type Theme = 'system' | 'light' | 'dark'
export type Tab = 'calc' | 'notes' | 'convert'

export interface Settings extends CalcSettings {
  theme: Theme
  haptics: boolean
}

const DEFAULT_SETTINGS: Settings = { theme: 'system', angle: 'deg', decimal: ',', digits: 16, haptics: true }

export const settings = $state<Settings>({ ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('settings', {}) })

/** `latex` is the content of the textbook-style calculator field. */
export const ui = $state<{ tab: Tab; latex: string; sciOpen: boolean }>({
  tab: 'calc',
  latex: '',
  sciOpen: false,
  ...load('ui', {}),
})

export const wide = new MediaQuery('min-width: 840px')
/** A phone on its side: keys go side by side and shrink to fit the height. */
export const short = new MediaQuery('max-height: 520px')
export const prefersDark = new MediaQuery('prefers-color-scheme: dark')

// ---- history ----

export interface HistoryEntry {
  /** The formula as typed (LaTeX); entries from the first version only have `expr`. */
  latex?: string
  expr?: string
  /** The answer as a decimal: shown and plain (for copying and inserting). */
  text: string
  plain: string
  /** The answer as a textbook fraction, when there is one, and whether it was shown that way. */
  fraction?: string
  showFraction?: boolean
  at: number
}

const HISTORY_LIMIT = 300

export const history = $state<{ items: HistoryEntry[] }>({ items: load('history', []) })

export function addHistory(entry: HistoryEntry) {
  history.items.push(entry)
  if (history.items.length > HISTORY_LIMIT) history.items.splice(0, history.items.length - HISTORY_LIMIT)
}

// ---- notebook ----

export interface Sheet {
  id: string
  title: string
  text: string
}

const EXAMPLE = `# Это блокнот: пишите расчёты строками, ответ справа
Аренда: 30 000
еда = 15 000
транспорт = 4 500
итого
итого * 12

# Переменные можно использовать дальше
еда / 30

# Единицы и валюты
5 км в м
2 кг + 300 г
100 $ в руб`

export function newSheet(title = 'Новый лист', text = ''): Sheet {
  return { id: Math.random().toString(36).slice(2, 10), title, text }
}

function initialNotebook() {
  const sheet = newSheet('Пример', EXAMPLE)
  return { sheets: [sheet], current: sheet.id }
}

export const notebook = $state<{ sheets: Sheet[]; current: string }>(load('notebook', null) ?? initialNotebook())

// ---- converter ----

export const converter = $state<{ category: string; amount: string; side: 'a' | 'b'; pairs: Record<string, [string, string]> }>({
  category: 'length',
  amount: '1',
  side: 'a',
  pairs: {},
  ...load('converter', {}),
})

// ---- currency rates ----

const RATES_MAX_AGE = 6 * 60 * 60 * 1000

export const currency = $state<{ rates: Rates | null; version: number; loading: boolean; error: string }>({
  rates: load<Rates | null>('rates', null),
  version: 0,
  loading: false,
  error: '',
})

if (currency.rates) applyRates(currency.rates)

export async function refreshRates(force = false) {
  if (currency.loading) return
  if (!force && currency.rates && Date.now() - currency.rates.fetched < RATES_MAX_AGE) return
  currency.loading = true
  currency.error = ''
  try {
    const rates = await fetchRates()
    applyRates(rates)
    currency.rates = rates
    currency.version++
  } catch {
    currency.error = navigator.onLine ? 'Не удалось загрузить курсы' : 'Нет интернета — курсы не обновлены'
  } finally {
    currency.loading = false
  }
}

// ---- small helpers ----

export function haptic() {
  if (settings.haptics) navigator.vibrate?.(8)
}

export const toast = $state({ message: '', id: 0 })

export function showToast(message: string) {
  const id = ++toast.id
  toast.message = message
  setTimeout(() => {
    if (toast.id === id) toast.message = ''
  }, 1800)
}

export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('Скопировано')
  } catch {
    showToast('Не удалось скопировать')
  }
}

/** The browser's "install app" prompt, kept until the person asks for it in the settings. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>
}

export const install = $state<{ prompt: InstallPrompt | null }>({ prompt: null })

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    install.prompt = e as InstallPrompt
  })
  window.addEventListener('appinstalled', () => (install.prompt = null))
}

// ---- persistence ----

$effect.root(() => {
  $effect(() => save('settings', $state.snapshot(settings)))
  $effect(() => save('ui', $state.snapshot(ui)))
  $effect(() => save('history', $state.snapshot(history.items)))
  $effect(() => save('notebook', $state.snapshot(notebook)))
  $effect(() => save('converter', $state.snapshot(converter)))
  $effect(() => {
    if (currency.rates) save('rates', $state.snapshot(currency.rates))
  })
})
