import { convertAsciiMathToLatex } from 'mathlive'
import { readPasted, polishLatex } from '../engine/paste'
import type { DecimalMark } from '../engine/input'

/** Pasted text as LaTeX for a formula field: a number or expression from another app, or LaTeX itself. */
export function pastedLatex(text: string, decimal: DecimalMark): string | null {
  const t = text.trim()
  // LaTeX already: copied from this app's history or from a LaTeX document
  if (/\\[a-zA-Z]/.test(t)) return t.replace(/^\$+|\$+$/g, '').trim() || null
  const p = readPasted(t, decimal)
  return p ? polishLatex(convertAsciiMathToLatex(p.text), decimal) : null
}

/** The clipboard's text; `ok: false` when the browser doesn't let the app read it. */
export async function readClipboard(): Promise<{ ok: true; text: string } | { ok: false }> {
  try {
    if (!navigator.clipboard?.readText) return { ok: false }
    return { ok: true, text: await navigator.clipboard.readText() }
  } catch {
    return { ok: false }
  }
}
