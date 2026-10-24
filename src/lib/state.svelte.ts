import { MediaQuery } from 'svelte/reactivity'
import { load, save } from './storage'
import type { CalcSettings } from '../engine/calc'
import type { Angle } from '../engine/math'
import type { DecimalMark } from '../engine/input'
import type { FormatMode } from '../engine/format'

export type Theme = 'system' | 'light' | 'dark'
export type Tab = 'calc' | 'notes' | 'units'

export interface Settings {
  theme: Theme
  angle: Angle
  decimal: DecimalMark
  /** How answers are written, and the digits for each mode (decimal places for fix). */
  format: FormatMode
  formatDigits: Record<FormatMode, number>
  /** 2½ means 2 + ½ in input and answers; off by default, as at university. */
  mixedNumbers: boolean
  /** Show √2/2 and π/3 rather than 0.7071… when the answer has an exact form. */
  exactAnswers: boolean
  /** After a key on a function page, go back to the 123 page (phones). */
  autoReturn: boolean
  haptics: boolean
}

export const DEFAULT_DIGITS: Record<FormatMode, number> = { auto: 12, fix: 2, sci: 4, eng: 4, sig: 3 }

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  angle: 'deg',
  decimal: '.',
  format: 'auto',
  formatDigits: DEFAULT_DIGITS,
  mixedNumbers: false,
  exactAnswers: true,
  autoReturn: true,
  haptics: true,
}

// "v2": the first, Russian version kept different defaults (decimal comma)
const stored = load<Partial<Settings>>('settings-v2', {})
export const settings = $state<Settings>({
  ...DEFAULT_SETTINGS,
  ...stored,
  formatDigits: { ...DEFAULT_DIGITS, ...stored.formatDigits },
})

/** What the engine needs from the settings. */
export function calcSettings(s: Settings = settings): CalcSettings {
  return {
    angle: s.angle,
    decimal: s.decimal,
    format: s.format,
    digits: s.formatDigits[s.format],
    mixedNumbers: s.mixedNumbers,
  }
}

/** `latex` is the content of the textbook-style calculator field; `page` the key page shown. */
export const ui = $state<{ tab: Tab; latex: string; page: string }>({
  tab: 'calc',
  latex: '',
  page: 'main',
  ...load('ui-v2', {}),
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
  /** The exact answer (a fraction, √2/2, 2x·cos x², x = 3, x = 2…) and whether it was shown. */
  exact?: string
  showExact?: boolean
  /** The answer is the solutions of an equation ("x = 3, x = 2"), not a value. */
  solved?: boolean
  /** Fraction answers from the first version, before `exact`. */
  fraction?: string
  showFraction?: boolean
  at: number
}

/** The answer of a history entry as it was shown: exact LaTeX, or null for the decimal. */
export function shownExact(e: HistoryEntry): string | null {
  const exact = e.exact ?? e.fraction
  if (!exact) return null
  return (e.showExact ?? e.showFraction) || !e.plain ? exact : null
}

const HISTORY_LIMIT = 300

export const history = $state<{ items: HistoryEntry[] }>({ items: load('history', []) })

export function addHistory(entry: HistoryEntry) {
  history.items.push(entry)
  if (history.items.length > HISTORY_LIMIT) history.items.splice(0, history.items.length - HISTORY_LIMIT)
}

// ---- notes ----

export interface Sheet {
  id: string
  title: string
  text: string
}

const EXAMPLE = `# Notes: one calculation per line, the answer appears on the right
Rent: 1 200
food = 450
transport = 90
total
total * 12

# Variables can be used further down
food / 30

# Units
5 km to m
2 kg + 300 g
9.81 m/s^2 * 2 s`

export function newSheet(title = 'New sheet', text = ''): Sheet {
  return { id: Math.random().toString(36).slice(2, 10), title, text }
}

function initialNotebook() {
  const sheet = newSheet('Example', EXAMPLE)
  return { sheets: [sheet], current: sheet.id }
}

export const notebook = $state<{ sheets: Sheet[]; current: string }>(load('notes-v2', null) ?? initialNotebook())

// ---- unit converter ----

export const converter = $state<{
  category: string
  amount: string
  side: 'a' | 'b'
  pairs: Record<string, [string, string]>
}>({
  category: 'length',
  amount: '1',
  side: 'a',
  pairs: {},
  ...load('converter-v2', {}),
})

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
    showToast('Copied')
  } catch {
    showToast('Could not copy')
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
  $effect(() => save('settings-v2', $state.snapshot(settings)))
  $effect(() => save('ui-v2', $state.snapshot(ui)))
  $effect(() => save('history', $state.snapshot(history.items)))
  $effect(() => save('notes-v2', $state.snapshot(notebook)))
  $effect(() => save('converter-v2', $state.snapshot(converter)))
})
