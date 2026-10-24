import type { MathfieldElement } from 'mathlive'
import type { Key } from './keys'
import type { DecimalMark } from '../engine/input'

/**
 * A key of the app's keypad pressed while a formula field (a graph line, a key being made)
 * has the focus. The calculator has its own handling (=, Ans, history); this is the rest.
 * Returns 'inv' when the key toggles INV (⇧ on the letter pages), which the keypad shows.
 */
export function applyKey(f: MathfieldElement, key: Key, decimal: DecimalMark): 'inv' | void {
  f.focus()
  switch (key.id) {
    case 'clear':
      f.value = ''
      return
    case 'back':
      f.executeCommand('deleteBackward')
      return
    case 'left':
      f.executeCommand('moveToPreviousChar')
      return
    case 'right':
      f.executeCommand('moveToNextChar')
      return
    case 'equals':
      // in a line of the graph, "=" writes an equation: y = …, a = …
      f.executeCommand(['typedText', '='])
      return
    case 'paren':
      f.executeCommand(['typedText', '('])
      return
    case 'decimal':
      f.executeCommand(['typedText', decimal])
      return
    case 'inv':
    case 'shift':
      return 'inv'
    case 'angle':
    case 'ans':
      return
    default:
      if (key.typed) f.executeCommand(['typedText', key.typed])
      else if (key.latex) f.executeCommand(['insert', key.latex, { selectionMode: 'placeholder' }])
  }
}
