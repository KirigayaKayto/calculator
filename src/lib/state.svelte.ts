import { MediaQuery } from 'svelte/reactivity'
import { load, save } from './storage'
import type { CalcSettings } from '../engine/calc'
import type { Angle } from '../engine/math'
import type { DecimalMark } from '../engine/input'
import type { FormatMode } from '../engine/format'
import type { Line } from '../graph/model'
import { PAGES, type Page } from '../ui/keys'
import type { ViewState } from '../ui/GraphCanvas.svelte'
import type { Radix, WordSize } from '../engine/programmer'

export type Theme = 'system' | 'light' | 'dark'
export type Tab = 'calc' | 'graph' | 'units'

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
  /** Off: √−1 is an error. Otherwise complex answers as a + bi or r∠θ. */
  complex: 'off' | 'rect' | 'polar'
  /** After a key on a function page, go back to the 123 page (phones). */
  autoReturn: boolean
  haptics: boolean
}

export const DEFAULT_DIGITS: Record<FormatMode, number> = { auto: 12, fix: 2, sci: 4, eng: 4, sig: 3, lab: 12 }

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  angle: 'deg',
  decimal: '.',
  format: 'auto',
  formatDigits: DEFAULT_DIGITS,
  mixedNumbers: false,
  exactAnswers: true,
  complex: 'off',
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
    complex: s.complex,
  }
}

/**
 * `latex` is the content of the textbook-style calculator field; `page` the key page shown;
 * `answerLatex` what the field showed right after the last "=", so the answer survives a tab switch.
 */
export const ui = $state<{ tab: Tab; latex: string; page: string; answerLatex?: string }>({
  tab: 'calc',
  latex: '',
  page: 'main',
  ...load('ui-v2', {}),
})

// ---- the person's own key layout ----

/** A key made in the key editor, kept as data so it survives a reload. */
export interface CustomKeyData {
  id: string
  label: string
  formula: string
}

/**
 * `pages` is null until the person changes the layout: then the defaults apply.
 * `known`: the default pages the layout already had a say about (kept, moved or deleted).
 */
export const keyLayout = $state<{ pages: Page[] | null; custom: CustomKeyData[]; known?: string[] }>({
  pages: null,
  custom: [],
  ...load('keys-v1', {}),
})

/** The default pages before the letter pages came: what a layout without `known` knew. */
const FIRST_PAGES = ['main', 'func', 'calc', 'phys', 'units']

/** Default pages added in a later version join a saved layout, after the person's own. */
export function addNewPages() {
  if (!keyLayout.pages) return
  const known = new Set(keyLayout.known ?? FIRST_PAGES)
  keyLayout.pages.push(...structuredClone(PAGES.filter((p) => !known.has(p.id))))
  keyLayout.known = PAGES.map((p) => p.id)
}

addNewPages()

/** Something another screen asked the calculator to insert (a constant from Tools). Not saved. */
export const pending = $state<{ insert: string | null }>({ insert: null })

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

// ---- graph worksheet ----

/** Curve colours, readable on both the light and the dark background. */
export const PALETTE = ['#d9453f', '#2f74c0', '#3a9a4f', '#7a52c7', '#e8780f', '#12968f']

export const newId = () => Math.random().toString(36).slice(2, 10)

function exampleGraph(): { lines: Line[]; view: ViewState; selected: string | null } {
  const lines = [
    'f(x)=\\frac{x^3}{6}-x',
    "f^{\\prime}(x)",
    '\\int_{-1}^{2}f(x)\\,dx',
    'a=1',
    'y=a\\sin\\left(x\\right)',
  ].map((latex, i) => ({ id: newId(), latex, color: PALETTE[i % PALETTE.length] }))
  return { lines, view: { cx: 0, cy: 0, scale: 45 }, selected: null }
}

export const graph = $state<{ lines: Line[]; view: ViewState; selected: string | null }>(
  load('graph-v1', null) ?? exampleGraph(),
)

// ---- unit converter ----

export const converter = $state<{
  /** Which tool the Tools tab shows. */
  tool?: 'units' | 'constants' | 'base' | 'stats' | 'integers'
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


// ---- programmer, statistics and whole-number tools ----

export const programmer = $state<{
  expr: string
  /** The radix the expression is typed in. */
  radix: Radix
  bits: WordSize
  signed: boolean
  /** Under the display: the keys, or the word's bits to flip. */
  view: 'keys' | 'bits'
}>({ expr: '', radix: 10, bits: 32, signed: true, view: 'keys', ...load('programmer-v1', {}) })

export const statsTool = $state<{ mode: 'list' | 'pairs'; list: string; pairs: string }>({
  mode: 'list',
  list: '',
  pairs: '',
  ...load('stats-v1', {}),
})

export const integerTool = $state<{ input: string; a: string; b: string; m: string }>({
  input: '',
  a: '',
  b: '',
  m: '',
  ...load('integers-v1', {}),
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
  $effect(() => save('graph-v1', $state.snapshot(graph)))
  $effect(() => save('keys-v1', $state.snapshot(keyLayout)))
  $effect(() => save('converter-v2', $state.snapshot(converter)))
  $effect(() => save('programmer-v1', $state.snapshot(programmer)))
  $effect(() => save('stats-v1', $state.snapshot(statsTool)))
  $effect(() => save('integers-v1', $state.snapshot(integerTool)))
})
