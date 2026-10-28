<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { fade } from 'svelte/transition'
  import { MathfieldElement } from 'mathlive'
  import { calculate, calculateLatex, format, newScope, type CalcResult } from '../engine/calc'
  import {
    toFraction,
    fractionLatex,
    fractionPlain,
    prefersFraction,
    hasDecimalLiteral,
    kind,
    toLatex,
    toPlain,
    type Exact,
    type Kind,
  } from '../engine/exact'
  import { math } from '../engine/math'
  import { balanceParens, identifierLatex } from '../engine/latex'
  import { CONSTANT_MACROS, constantsAsSymbols } from '../engine/constants'
  import { askCas, warmUpCas, cas } from '../cas/client.svelte'
  import type { CasAnswer, CasValue } from '../cas/protocol'
  import {
    settings,
    calcSettings,
    ui,
    pending,
    wide,
    short,
    history,
    addHistory,
    shownExact,
    copy,
    showToast,
    type HistoryEntry,
  } from '../lib/state.svelte'
  import { latexMarkup, numberLatex } from '../lib/markup'
  import Keypad from './Keypad.svelte'
  import type { Key } from './keys'
  import History from './History.svelte'
  import FormatChip from './FormatChip.svelte'
  import FieldPaste from './FieldPaste.svelte'
  import { pastedLatex } from './paste'
  import Icon from './Icon.svelte'

  // fonts come from mathlive/fonts.css (bundled, so they work offline); no key sounds
  MathfieldElement.fontsDirectory = null
  MathfieldElement.soundsDirectory = null

  let host = $state<HTMLDivElement>()
  let mf: MathfieldElement | undefined
  /** The same field, for the Paste menu (which needs to know when it exists). */
  let fieldEl = $state<MathfieldElement>()
  let paster = $state<{ paste(): Promise<void> }>()
  let error = $state('')
  let shaking = $state(false)
  let inv = $state(false)
  /** The person pressed ⇄ while typing: show the answer in the other form. */
  let flipped = $state(false)
  /** "=" is waiting for the symbolic engine. */
  let working = $state(false)

  /** Right after "=": a digit starts a new problem, an operator continues from the answer. */
  let justEvaluated = false

  interface Form {
    latex: string
    plain: string
  }
  /** The last answer: its number (for Ans and for continuing) and its exact value (2√5), if any. */
  interface Answer {
    id: number
    value: unknown
    exactValue: Exact | null
    decimal: Form | null
    exact: Form | null
    showExact: boolean
    /** "2 s.f." in lab mode, "±1.2 %" for a measurement. */
    note?: string
  }
  let answer = $state.raw<Answer | null>(null)
  let answerSeq = 0
  /** What the field contained right after "=" (MathLive may rewrite the LaTeX we give it). */
  let answerLatex = $state('')

  /** The roots of the equation in the field, after "=". */
  let solutions = $state.raw<{ variable: string; items: CasValue[]; showExact: boolean } | null>(null)
  /** An equation with several letters: which one to solve for. */
  let chooseVars = $state.raw<string[] | null>(null)

  const cs = $derived(calcSettings(settings))
  const plainToLatex = (plain: string) => numberLatex(plain, settings.decimal)

  // ---- routing: numbers stay on the fast numeric path, algebra and calculus go to the CAS ----

  const CAS_ONLY =
    /\\int|\\frac\{d|\\frac\{\\mathrm\{d\}|\\lim|\\sum|\\prod|\\operatorname\{(?:Series|Factor|Expand|Simplify)\}|\\right\|_|\\begin\{cases\}|=/

  function isPlainNumber(latex: string) {
    return /^-?\d+(?:\.\d+)?$/.test(latex.replace(/\\[,!; ]|\s/g, '').replace('{,}', '.'))
  }

  /** An exact value written both ways, or null for a whole number (the decimal already says it). */
  function exactForms(e: Exact): Form | null {
    if (kind(e) === 'integer') return null
    return { latex: toLatex(e, { mixed: settings.mixedNumbers }), plain: toPlain(e) }
  }

  /** The exact value behind an answer written as LaTeX (2\sqrt{5}, \frac{1}{3}), when the arithmetic can read it. */
  function exactValueOf(latex: string): Exact | null {
    const r = calculateLatex(latex, cs)
    return r.ok ? (r.exact ?? null) : null
  }

  /**
   * The answer of a history entry, computed again: its number (with all its digits when the
   * exact form is known) and its exact value, so Ans stays exact after a restart.
   */
  function recoverAnswer(entry: HistoryEntry): Answer | null {
    if (entry.solved) return null
    let r: CalcResult | null = null
    if (entry.exact) {
      const e = calculateLatex(entry.exact, cs)
      if (e.ok) r = e
    }
    if (!r && entry.plain) {
      const p = calculate(entry.plain, { ...cs, decimal: /\d,\d/.test(entry.plain) ? ',' : '.' })
      if (p.ok) r = p
    }
    if (!r) return null
    const exact = r.exact ? exactForms(r.exact) : entry.exact ? { latex: entry.exact, plain: entry.exact } : null
    return {
      id: 0,
      value: r.value,
      exactValue: r.exact ?? null,
      decimal: entry.plain ? { latex: plainToLatex(entry.plain), plain: entry.plain } : null,
      exact,
      showExact: !!exact && !!entry.showExact,
    }
  }

  const lastAnswer = $derived.by(() => {
    const last = history.items.at(-1)
    return last ? recoverAnswer(last) : null
  })

  /** Ans: the last answer, or the last one in the history after a restart. */
  const ansValue = $derived.by(() => {
    const a = answer ?? lastAnswer
    return a && a.value !== undefined ? { value: a.value, exact: a.exactValue } : undefined
  })

  const CONTINUES = /^(?:[-+*/:^!)]|\\(?:cdot|times|div|bmod|%))/

  function evaluate(latex: string): CalcResult {
    const scope = newScope(cs.angle)
    if (ansValue !== undefined) {
      scope.set('Ans', ansValue.value)
      if (ansValue.exact) scope.exact.set('Ans', ansValue.exact)
    }
    if (answer?.value !== undefined && answerLatex && latex.startsWith(answerLatex)) {
      const rest = latex.slice(answerLatex.length).trimStart()
      if (rest === '' || CONTINUES.test(rest)) {
        scope.set('_ans', answer.value)
        if (answer.exactValue) scope.exact.set('_ans', answer.exactValue)
        return calculateLatex(rest, cs, scope, '_ans')
      }
    }
    return calculateLatex(latex, cs, scope)
  }

  /**
   * What the CAS gets: parentheses closed, constants as their symbols (so E = mc² can be
   * solved for m), and the answer itself in place of Ans. Calculus and algebra are done in
   * radians, as in every textbook.
   */
  function forCas(latex: string): string {
    const a = answer ?? lastAnswer
    const ans = a ? (a.exact?.latex ?? a.decimal?.latex ?? null) : null
    const balanced = constantsAsSymbols(balanceParens(latex))
    return ans === null
      ? balanced
      : balanced.replace(/\\(?:operatorname|mathrm)\{(?:\\mathrm\{)?Ans\}?\}/g, `\\left(${ans}\\right)`)
  }

  /**
   * Whether the exact form is the natural answer: a fraction for a fraction problem (as
   * calculators with a textbook display do); radicals and π when exact answers are on and
   * nothing was typed as a decimal. Only in the automatic format: Fix 2 asks for decimals.
   * ⇄ always switches.
   */
  function wantsExact(latex: string, k: Kind) {
    if (settings.format !== 'auto') return false
    if (k === 'rational') return prefersFraction(latex)
    return settings.exactAnswers && !hasDecimalLiteral(latex)
  }

  const numeric = $derived(evaluate(ui.latex))
  const viaCas = $derived(CAS_ONLY.test(ui.latex) || (!numeric.ok && !!numeric.unknown))
  /** The exact form of what is typed (2√5, 5/6), when it says more than the decimal. */
  const exactForm = $derived(numeric.ok && !numeric.latex && numeric.exact ? exactForms(numeric.exact) : null)
  const previewExact = $derived(
    !!exactForm && numeric.ok && !!numeric.exact && wantsExact(ui.latex, kind(numeric.exact)) !== flipped,
  )
  const showingAnswer = $derived(!!answer && ui.latex === answerLatex)

  // ---- the symbolic preview, while typing ----

  let casPreview = $state.raw<{ latex: string; answer?: CasAnswer; error?: string } | null>(null)
  let previewSeq = 0

  $effect(() => {
    const latex = ui.latex
    if (!viaCas || showingAnswer || solutions || !latex.trim()) return
    const seq = ++previewSeq
    const timer = setTimeout(async () => {
      try {
        const a = await askCas({ latex: forCas(latex), angle: 'rad' })
        if (seq === previewSeq) casPreview = { latex, answer: a }
      } catch (e) {
        if (seq === previewSeq) casPreview = { latex, error: (e as Error).message }
      }
    }, 250)
    return () => clearTimeout(timer)
  })

  /** A value from the CAS as an answer: its exact form, and its decimal digits if it is a number. */
  function casAnswer(v: CasValue): Answer {
    const value = v.approx !== null ? math.bignumber(v.approx) : undefined
    const decimal = value !== undefined ? { latex: plainToLatex(format(value, cs, true)), plain: format(value, cs, true) } : null
    const f = value !== undefined ? toFraction(value) : null
    const exact =
      decimal && isPlainNumber(v.exact)
        ? null
        : { latex: v.exact, plain: f && v.exact === fractionLatex(f) ? fractionPlain(f) : v.exact }
    return {
      id: ++answerSeq,
      value,
      exactValue: exactValueOf(v.exact),
      decimal,
      exact,
      showExact: !!exact && (!decimal || (settings.exactAnswers && settings.format === 'auto')),
    }
  }

  function solutionsLatex(s: { variable: string; items: CasValue[]; showExact: boolean }) {
    if (!s.items.length) return '\\text{No solution}'
    const v = identifierLatex(s.variable)
    return s.items
      .map((r) =>
        !s.showExact && r.approx !== null
          ? `${v}\\approx ${numberLatex(format(math.bignumber(r.approx), cs, true), settings.decimal, true)}`
          : `${v}=${r.exact}`,
      )
      .join(',\\;')
  }

  /** What to show under the formula while typing. */
  const preview = $derived.by((): { latex?: string; working?: boolean; choose?: string[]; note?: string } | null => {
    if (showingAnswer || !ui.latex.trim()) return null
    if (viaCas) {
      if (casPreview?.latex !== ui.latex) return { working: true }
      const a = casPreview.answer
      if (!a) return null
      if (a.kind === 'choose') return { choose: a.variables }
      if (a.kind === 'solutions') return { latex: solutionsLatex({ variable: a.variable, items: a.solutions, showExact: !flipped }) }
      const ans = casAnswer(a)
      const shown = ans.showExact !== flipped && ans.exact ? ans.exact.latex : (ans.decimal ?? ans.exact)!.latex
      return { latex: '=' + (shown === ans.decimal?.latex ? numberLatex(ans.decimal.plain, settings.decimal, true) : shown) }
    }
    // a bare number needs no "= …" under it
    if (!numeric.ok || /^-?[\d{},.\s]*$/.test(ui.latex)) return null
    return {
      latex: '=' + (previewExact && exactForm ? exactForm.latex : (numeric.latex ?? numberLatex(numeric.plain, settings.decimal, true))),
      note: numeric.note,
    }
  })

  const canFlip = $derived(
    solutions
      ? solutions.items.some((r) => r.approx !== null && !isPlainNumber(r.exact))
      : showingAnswer
        ? !!answer?.exact && !!answer.decimal
        : !viaCas && !!exactForm,
  )

  // ---- layout ----

  const sideBySide = $derived(wide.current || short.current)
  const historyAside = $derived(wide.current && !short.current)
  const historyInline = $derived(!wide.current && !short.current)

  /**
   * The formula shrinks when it gets wider than the field, by what is drawn rather than by
   * the length of the LaTeX (a root is long to write and short to draw).
   */
  function fitField() {
    const el = host
    const content = mf?.shadowRoot?.querySelector<HTMLElement>('.ML__content')
    if (!el) return
    if (!content) {
      el.dataset.size = ui.latex.length <= 24 ? 'l' : ui.latex.length <= 60 ? 'm' : 's'
      return
    }
    const before = el.dataset.size ?? 'l'
    el.style.transition = 'none'
    let chosen = 's'
    for (const size of ['l', 'm', 's']) {
      el.dataset.size = size
      if (content.scrollWidth <= content.clientWidth) {
        chosen = size
        break
      }
    }
    // back to the old size without a transition, then to the new one with it
    el.dataset.size = before
    void el.offsetWidth
    el.style.transition = ''
    el.dataset.size = chosen
  }

  // ---- "=": the formula glides up into the history, the answer rises into the field ----

  let vtField = $state('')
  let morphNewest = $state(false)

  async function animateAnswer(apply: () => void) {
    const doc = document as Document & {
      startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> }
    }
    if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply()
    vtField = 'expr'
    await tick()
    try {
      const transition = doc.startViewTransition(async () => {
        apply()
        vtField = 'answer'
        morphNewest = true
        await tick()
      })
      await transition.finished
    } catch {
      // the browser skipped the animation; the answer is shown all the same
    } finally {
      vtField = ''
      morphNewest = false
    }
  }

  // ---- editing ----

  function sync() {
    if (!mf) return
    if (mf.value !== ui.latex) {
      solutions = null
      chooseVars = null
    }
    ui.latex = mf.value
    error = ''
    flipped = false
    requestAnimationFrame(fitField)
  }

  /**
   * MathLive remembers the last keys for its shortcuts ("xx" → ×). After we replace the content
   * it must forget them, or the next "x" would undo our change and bring the old formula back.
   */
  function forgetKeys() {
    ;(mf as unknown as { _mathfield?: { flushInlineShortcutBuffer(): void } })?._mathfield?.flushInlineShortcutBuffer()
  }

  function setValue(latex: string) {
    if (!mf) return
    mf.value = latex
    forgetKeys()
    mf.position = mf.lastOffset
    sync()
  }

  function focusField() {
    mf?.focus()
  }

  /** Before input right after "=": start anew, or continue from the answer. */
  function beforeInput(continues: boolean) {
    if (!justEvaluated || !mf) return
    justEvaluated = false
    if (continues) {
      mf.position = mf.lastOffset
    } else {
      mf.value = ''
      answer = null
      answerLatex = ''
    }
    forgetKeys()
  }

  function typed(text: string, continues = false) {
    if (!mf) return
    beforeInput(continues)
    mf.executeCommand(['typedText', text])
  }

  function insert(latex: string, continues = false) {
    if (!mf) return
    beforeInput(continues)
    mf.executeCommand(['insert', latex, { selectionMode: 'placeholder' }])
  }

  /** Text pasted from another app: numbers like 1 234,56 or $1,299.99 are cleaned up first. */
  function pasteText(text: string) {
    if (!mf) return
    const latex = pastedLatex(text, settings.decimal)
    if (!latex) return showToast('No number to paste')
    focusField()
    // after "=", a pasted number starts anew; "+ 5" continues from the answer
    beforeInput(/^\s*[+*/^×÷·]/.test(text))
    mf.executeCommand(['insert', latex])
    sync()
  }

  function parenKey() {
    if (!mf) return
    const before = justEvaluated ? '' : mf.getValue(0, mf.position, 'latex')
    const depth = (before.match(/\(/g)?.length ?? 0) - (before.match(/\)/g)?.length ?? 0)
    const last = before.replace(/\\right\.$/, '').trimEnd().slice(-1)
    if (depth > 0 && /[\d)}!%\p{L}]/u.test(last)) typed(')', true)
    else typed('(')
  }

  function clear() {
    justEvaluated = false
    answer = null
    answerLatex = ''
    setValue('')
  }

  function shake() {
    shaking = true
    if (settings.haptics) navigator.vibrate?.([12, 40, 12])
    setTimeout(() => (shaking = false), 400)
  }

  // ---- answers ----

  function showAnswer(exact: boolean) {
    if (!answer) return
    const form = (exact && answer.exact) || answer.decimal || answer.exact
    if (!form) return
    answer = { ...answer, showExact: form === answer.exact }
    setValue(form.latex)
    answerLatex = ui.latex
    justEvaluated = true
  }

  function record(latex: string, a: Answer) {
    addHistory({
      latex,
      text: a.decimal ? format(a.value, cs) : '',
      plain: a.decimal?.plain ?? '',
      exact: a.exact?.latex,
      showExact: a.showExact,
      at: Date.now(),
    })
  }

  async function equals(solveFor?: string) {
    if (!mf) return
    const latex = mf.value
    if (!latex.trim() || (showingAnswer && !solveFor)) return

    if (viaCas) {
      working = true
      let a: CasAnswer
      try {
        a = await askCas({ latex: forCas(latex), angle: 'rad', solveFor })
      } catch (e) {
        error = (e as Error).message
        shake()
        return
      } finally {
        working = false
      }
      if (mf.value !== latex) return // the person kept typing
      chooseVars = null
      if (a.kind === 'choose') {
        chooseVars = a.variables
        return
      }
      if (a.kind === 'solutions') {
        solutions = { variable: a.variable, items: a.solutions, showExact: true }
        addHistory({
          latex,
          text: '',
          plain: a.solutions.map((s) => s.approx ?? s.exact).join(', '),
          exact: solutionsLatex(solutions),
          showExact: true,
          solved: true,
          at: Date.now(),
        })
        return
      }
      const ans = casAnswer(a)
      animateAnswer(() => {
        record(latex, ans)
        answer = ans
        showAnswer(ans.showExact)
      })
      return
    }

    const r = evaluate(latex)
    if (!r.ok) {
      error = r.error || 'Syntax error'
      shake()
      return
    }
    const form = r.latex || !r.exact ? null : exactForms(r.exact)
    const ans: Answer = {
      id: ++answerSeq,
      value: r.value,
      exactValue: r.exact ?? null,
      decimal: { latex: r.latex ?? plainToLatex(r.plain), plain: r.plain },
      exact: form,
      showExact: !!form && !!r.exact && wantsExact(latex, kind(r.exact)) !== flipped,
      note: r.note,
    }
    animateAnswer(() => {
      record(latex, ans)
      answer = ans
      showAnswer(ans.showExact)
    })
  }

  /** ⇄: exact ↔ decimal, for the answer, the roots, or the preview. */
  function flip() {
    if (solutions) solutions = { ...solutions, showExact: !solutions.showExact }
    else if (showingAnswer && answer) showAnswer(!answer.showExact)
    else flipped = !flipped
    focusField()
  }

  function copyShown() {
    if (solutions) return copy(solutions.items.map((r) => (solutions!.showExact ? r.exact : r.approx ?? r.exact)).join(', '))
    if (showingAnswer && answer) {
      const form = answer.showExact && answer.exact ? answer.exact : answer.decimal
      if (form) copy(form.plain)
    } else if (!viaCas && numeric.ok) {
      copy(previewExact && exactForm ? exactForm.plain : numeric.plain)
    }
  }

  /** The number format changed: show the answer in the field in the new format. */
  function reformatAnswer() {
    if (showingAnswer && answer?.decimal && answer.value !== undefined) {
      const plain = format(answer.value, cs, true)
      answer = { ...answer, decimal: { latex: plainToLatex(plain), plain } }
      showAnswer(answer.showExact && settings.format === 'auto')
    }
    focusField()
  }

  // ---- keys ----

  const NO_RETURN = new Set(['inv', 'shift', 'angle', 'left', 'right'])

  function onkey(key: Key, page: string, sticky: boolean) {
    if (!mf) return
    focusField()
    switch (key.id) {
      case 'clear':
        return clear()
      case 'equals':
        return equals()
      case 'inv':
      case 'shift':
        inv = !inv
        return
      case 'angle':
        settings.angle = settings.angle === 'deg' ? 'rad' : 'deg'
        return
      case 'back':
        justEvaluated = false
        mf.executeCommand('deleteBackward')
        break
      case 'left':
        justEvaluated = false
        mf.executeCommand('moveToPreviousChar')
        break
      case 'right':
        justEvaluated = false
        mf.executeCommand('moveToNextChar')
        break
      case 'paren':
        parenKey()
        break
      case 'decimal':
        typed(settings.decimal)
        break
      default:
        if (key.typed) typed(key.typed, key.continues)
        else if (key.latex) insert(key.latex, key.continues)
        inv = false
    }
    // on a phone, a function page closes after use, like a menu (letter pages stay open)
    if (page !== 'main' && !sticky && !sideBySide && settings.autoReturn && !NO_RETURN.has(key.id)) ui.page = 'main'
    sync()
  }

  function onpage(page: string) {
    ui.page = page
    // calculus needs the symbolic engine: start loading it now
    if (page === 'calc') warmUpCas()
  }

  /** Keys typed on a real keyboard while the formula has focus. MathLive handles the rest. */
  function onFieldKeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopImmediatePropagation()
      equals()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopImmediatePropagation()
      clear()
    } else if (justEvaluated && e.key.length === 1) {
      beforeInput(/[-+*/:^!)%]/.test(e.key))
    } else if (e.key.startsWith('Arrow') || e.key === 'Backspace' || e.key === 'Delete') {
      justEvaluated = false
    }
  }

  /** Typing anywhere on the page goes into the formula. */
  function onWindowKeydown(e: KeyboardEvent) {
    if (!mf || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
    const target = e.target as HTMLElement
    if (target === mf || document.querySelector('dialog[open]')) return
    const onButton = target.tagName === 'BUTTON'
    if (target !== document.body && !onButton) return
    if (e.key.length === 1 && e.key !== ' ') {
      e.preventDefault()
      focusField()
      typed(e.key, /[-+*/:^!)%]/.test(e.key))
      sync()
    } else if (!onButton && ['Enter', 'Backspace', 'Escape'].includes(e.key)) {
      e.preventDefault()
      focusField()
      if (e.key === 'Enter') equals()
      else if (e.key === 'Escape') clear()
      else {
        mf.executeCommand('deleteBackward')
        sync()
      }
    }
  }

  function pick(entry: HistoryEntry, part: 'expr' | 'result') {
    if (!mf) return
    if (part === 'result' && entry.solved) return
    const latex =
      part === 'expr' ? (entry.latex ?? `\\text{${entry.expr ?? ''}}`) : (shownExact(entry) ?? plainToLatex(entry.plain))
    focusField()
    if (justEvaluated || !mf.value.trim()) {
      justEvaluated = false
      answer = null
      answerLatex = ''
      setValue(latex)
    } else {
      mf.executeCommand(['insert', latex])
      sync()
    }
  }

  $effect(() => {
    MathfieldElement.decimalSeparator = settings.decimal
  })

  // remembered, so the answer is still the answer after a tab switch or a reload
  $effect(() => {
    ui.answerLatex = answerLatex
  })

  onMount(() => {
    MathfieldElement.decimalSeparator = settings.decimal
    const field = new MathfieldElement()
    // our own keypad replaces both MathLive's keyboard and the phone's one
    field.mathVirtualKeyboardPolicy = 'manual'
    field.setAttribute('aria-label', 'Expression')
    field.value = ui.latex
    // the remaining options need the field to be on the page
    host!.append(field)
    // a typed "(" must not swallow the rest of the formula, such as the "dx" of an integral;
    // unclosed parentheses are closed when evaluating, and function keys insert both
    field.smartFence = false
    // otherwise 2^10 becomes 2¹0: the cursor would leave the exponent after one digit
    field.smartSuperscript = false
    field.menuItems = []
    field.placeholder = '0'
    // physical constants: \ConstC looks like c but is not the letter c
    field.macros = { ...field.macros, ...CONSTANT_MACROS }
    field.addEventListener('keydown', onFieldKeydown, { capture: true })
    field.addEventListener('input', sync)
    field.addEventListener('pointerdown', () => (justEvaluated = false))
    mf = field
    fieldEl = field
    mf.position = mf.lastOffset
    // the field still shows the last answer: a digit starts anew, an operator continues from it
    if (ui.answerLatex && ui.latex === ui.answerLatex && lastAnswer) {
      answer = { ...lastAnswer, id: ++answerSeq }
      answerLatex = ui.latex
      justEvaluated = true
    }
    if (ui.page === 'calc') warmUpCas()
    // a constant chosen in Tools
    if (pending.insert) {
      insert(pending.insert, true)
      pending.insert = null
      sync()
    }
    // on a computer, start typing right away; on a phone, nothing should pop up
    if (matchMedia('(pointer: fine)').matches) focusField()
    requestAnimationFrame(fitField)
    const observer = new ResizeObserver(() => fitField())
    observer.observe(host!)
    return () => {
      observer.disconnect()
      field.remove()
      mf = undefined
      fieldEl = undefined
    }
  })
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="calc" class:wide={wide.current}>
  <div class="main">
    <div class="display">
      {#if historyInline}
        <div class="history-inline">
          <History onpick={pick} compact {morphNewest} />
        </div>
      {/if}

      <div class="field" data-size="l" class:shaking bind:this={host} style:view-transition-name={vtField || undefined}></div>
      <FieldPaste bind:this={paster} target={fieldEl} onpaste={pasteText} />

      <div class="result-row" aria-live="polite">
        <FormatChip onchange={reformatAnswer} />
        <span class="spacer"></span>
        {#if !ui.latex.trim()}
          <!-- the phone's own Paste is gone with its keyboard: here it is, while the field is empty -->
          <button class="paste-btn" onmousedown={(e) => e.preventDefault()} onclick={() => paster?.paste()}>
            <Icon name="paste" size={16} />
            Paste
          </button>
        {:else if error}
          <span class="error">{error}</span>
        {:else if solutions}
          <span class="preview solved">{@html latexMarkup(solutionsLatex(solutions))}</span>
        {:else if working}
          <span class="working">{cas.status === 'loading' ? 'Loading the math engine…' : 'Working…'}</span>
        {:else if chooseVars || preview?.choose}
          <span class="label">Solve for</span>
          {#each chooseVars ?? preview?.choose ?? [] as v (v)}
            <button class="var" onmousedown={(e) => e.preventDefault()} onclick={() => equals(v)}>
              {@html latexMarkup(identifierLatex(v))}
            </button>
          {/each}
        {:else if preview?.working}
          <span class="working">{cas.status === 'loading' ? 'Loading the math engine…' : 'Working…'}</span>
        {:else if preview?.latex}
          {#key flipped}
            <span class="preview" in:fade={{ duration: 120 }}>{@html latexMarkup(preview.latex)}</span>
          {/key}
        {/if}
        {#if !error && (showingAnswer ? answer?.note : preview?.note)}
          <span class="note">{showingAnswer ? answer?.note : preview?.note}</span>
        {/if}
        {#if !error && canFlip}
          <button
            class="icon-btn"
            aria-label="Exact or decimal"
            title="Exact ⇄ decimal"
            onmousedown={(e) => e.preventDefault()}
            onclick={flip}
          >
            <Icon name="flip" size={18} />
          </button>
        {/if}
        {#if !error && (solutions || showingAnswer || (preview?.latex && !viaCas))}
          <button
            class="icon-btn"
            aria-label="Copy the answer"
            onmousedown={(e) => e.preventDefault()}
            onclick={copyShown}
          >
            <Icon name="copy" size={18} />
          </button>
        {/if}
      </div>
    </div>

    <Keypad
      {onkey}
      {onpage}
      page={ui.page}
      decimal={settings.decimal}
      angle={settings.angle}
      {inv}
      wide={sideBySide}
    />
  </div>

  {#if historyAside}
    <aside class="side">
      <History onpick={pick} {morphNewest} />
    </aside>
  {/if}
</div>

<style>
  .calc {
    height: 100%;
    display: flex;
    gap: 16px;
  }

  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .display {
    flex: 1;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    margin: 8px 12px 0;
    padding: 8px 12px 4px;
    border-radius: 20px;
    background: var(--surface);
    min-width: 0;
  }

  .wide .display {
    margin: 12px 16px 0;
    padding: 16px 20px 8px;
  }

  .history-inline {
    flex: 1;
    min-height: 0;
    margin: 0 -8px 4px;
    -webkit-mask-image: linear-gradient(to bottom, transparent, #000 32px);
    mask-image: linear-gradient(to bottom, transparent, #000 32px);
  }

  .field {
    flex: none;
    min-height: 64px;
    display: flex;
    align-items: center;
    transition: font-size var(--normal);
  }

  /* data-size is set by fitField(), so these are kept as global selectors */
  .field:global([data-size='l']) {
    font-size: clamp(30px, 5.2dvh, 44px);
  }
  .field:global([data-size='m']) {
    font-size: clamp(24px, 4dvh, 34px);
  }
  .field:global([data-size='s']) {
    font-size: clamp(20px, 3.2dvh, 26px);
  }

  .field.shaking {
    animation: shake 0.35s;
  }

  @keyframes shake {
    20%,
    60% {
      transform: translateX(-6px);
    }
    40%,
    80% {
      transform: translateX(6px);
    }
  }

  .result-row {
    min-height: 52px;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .spacer {
    flex: 1;
  }

  .preview {
    margin-right: 4px;
    font-size: clamp(20px, 3.4dvh, 28px);
    color: var(--muted);
    text-align: right;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .preview.solved {
    color: var(--text);
  }

  .note {
    margin-right: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--key-fn);
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
  }

  .working,
  .label {
    margin-right: 6px;
    font-size: 15px;
    color: var(--muted);
  }

  .var {
    min-width: 44px;
    min-height: 40px;
    padding: 0 10px;
    border-radius: 12px;
    background: var(--key-fn);
    font-size: 20px;
  }

  @media (hover: hover) {
    .var:hover {
      background: var(--key-op);
    }
  }

  .error {
    font-size: 16px;
    color: var(--error);
    font-weight: 500;
    text-align: right;
  }

  .result-row .icon-btn {
    color: var(--muted);
    flex: none;
  }

  .paste-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 14px;
    font-weight: 500;
  }

  .paste-btn:active {
    background: var(--key-fn);
  }

  @media (max-height: 520px) {
    .display,
    .wide .display {
      min-height: 64px;
      margin-top: 4px;
      padding: 4px 16px 0;
    }
    .field {
      min-height: 48px;
    }
    .field:global([data-size='l']),
    .field:global([data-size='m']) {
      font-size: 28px;
    }
    .field:global([data-size='s']) {
      font-size: 22px;
    }
    .result-row {
      min-height: 40px;
    }
  }

  .side {
    width: 340px;
    flex: none;
    margin: 12px 16px 16px 0;
    padding: 12px 8px;
    border-radius: 20px;
    background: var(--surface);
    min-height: 0;
  }
</style>
