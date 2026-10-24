import { convertLatexToMarkup } from 'mathlive'
import { CONSTANT_MACROS } from '../engine/constants'

export { numberLatex } from '../engine/texout'

const cache = new Map<string, string>()

/** A formula drawn the textbook way (static HTML; fonts come from mathlive/fonts.css). */
export function latexMarkup(latex: string): string {
  let html = cache.get(latex)
  if (html === undefined) {
    html = convertLatexToMarkup(latex, { macros: CONSTANT_MACROS })
    if (cache.size > 500) cache.clear()
    cache.set(latex, html)
  }
  return html
}
