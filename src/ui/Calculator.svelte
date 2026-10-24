<script lang="ts">
  import { onMount } from 'svelte'
  import { MathfieldElement } from 'mathlive'
  import { calculate, calculateLatex, format, newScope, type CalcResult } from '../engine/calc'
  import { toFraction, fractionLatex, fractionPlain, prefersFraction } from '../engine/exact'
  import { math } from '../engine/math'
  import { balanceParens } from '../engine/latex'
  import { askCas, warmUpCas, cas } from '../cas/client.svelte'
  import type { CasAnswer, CasValue } from '../cas/protocol'
  import {
    settings,
    calcSettings,
    ui,
    wide,
    short,
    history,
    addHistory,
    shownExact,
    haptic,
    copy,
    type HistoryEntry,
  } from '../lib/state.svelte'
  import { latexMarkup, numberLatex } from '../lib/markup'
  import Keypad from './Keypad.svelte'
  import type { Key } from './keys'
  import History from './History.svelte'
  import FormatChip from './FormatChip.svelte'
  import Icon from './Icon.svelte'

  // fonts come from mathlive/fonts.css (bundled, so they work offline); no key sounds
  MathfieldElement.fontsDirectory = null
  MathfieldElement.soundsDirectory = null

  let host = $state<HTMLDivElement>()
  let mf: MathfieldElement | undefined
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
  /** The last answer. `value` is its exact number (for Ans and for continuing), if it is a number. */
  interface Answer {
    id: number
    value: unknown
    decimal: Form | null
    exact: Form | null
    showExact: boolean
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
  /** Where the exact form says more than the decimal: √2/2 rather than 0.7071… */
  const IRRATIONAL = /\\sqrt|\\pi|\\sin|\\cos|\\tan|\\cot|\\sec|\\csc|\\arc|\\log|\\ln|\\exponentialE/

  function isPlainNumber(latex: string) {
    return /^-?\d+(?:\.\d+)?$/.test(latex.replace(/\\[,!; ]|\s/g, '').replace('{,}', '.'))
  }

  /**
   * Calculus and algebra are done in radians, as in every textbook; the degree mode only
   * applies when the CAS works out the exact value of a number (sin 45° = √2/2).
   */
  function casAngle(latex: string, symbolic: boolean) {
    return symbolic || CAS_ONLY.test(latex) ? 'rad' : settings.angle
  }

  /** Ans: the exact last answer, or the last one in the history after a restart. */
  const ansValue = $derived.by(() => {
    if (answer) return answer.value
    const last = history.items.at(-1)
    if (!last?.plain || last.solved) return undefined
    const r = calculate(last.plain, { ...cs, decimal: /\d,\d/.test(last.plain) ? ',' : '.' })
    return r.ok ? r.value : undefined
  })

  const CONTINUES = /^(?:[-+*/:^!)]|\\(?:cdot|times|div|bmod|%))/

  function evaluate(latex: string): CalcResult {
    const scope = newScope(cs.angle)
    if (ansValue !== undefined) scope.set('Ans', ansValue)
    if (answer?.value !== undefined && answerLatex && latex.startsWith(answerLatex)) {
      const rest = latex.slice(answerLatex.length).trimStart()
      if (rest === '' || CONTINUES.test(rest)) {
        scope.set('_ans', answer.value)
        return calculateLatex(rest, cs, scope, '_ans')
      }
    }
    return calculateLatex(latex, cs, scope)
  }

  /** What the CAS gets: parentheses closed, and the answer itself in place of Ans. */
  function forCas(latex: string): string {
    const ans =
      answer?.exact?.latex ??
      answer?.decimal?.latex ??
      (ansValue !== undefined ? plainToLatex(format(ansValue, cs, true)) : null)
    const balanced = balanceParens(latex)
    return ans === null
      ? balanced
      : balanced.replace(/\\(?:operatorname|mathrm)\{(?:\\mathrm\{)?Ans\}?\}/g, `\\left(${ans}\\right)`)
  }

  /** Fractions are the natural answer only in the automatic format and for fraction problems. */
  function wantsFraction(latex: string) {
    return settings.format === 'auto' && prefersFraction(latex)
  }

  const numeric = $derived(evaluate(ui.latex))
  const viaCas = $derived(CAS_ONLY.test(ui.latex) || (!numeric.ok && !!numeric.unknown))
  const fraction = $derived(numeric.ok ? toFraction(numeric.value) : null)
  const previewAsFraction = $derived(!!fraction && wantsFraction(ui.latex) !== flipped)
  const showingAnswer = $derived(!!answer && ui.latex === answerLatex)

  // ---- the symbolic preview, while typing ----

  let casPreview = $state.raw<{ latex: string; answer?: CasAnswer; error?: string } | null>(null)
  let previewSeq = 0

  $effect(() => {
    const latex = ui.latex
    const angle = casAngle(latex, true)
    if (!viaCas || showingAnswer || solutions || !latex.trim()) return
    const seq = ++previewSeq
    const timer = setTimeout(async () => {
      try {
        const a = await askCas({ latex: forCas(latex), angle })
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
      decimal,
      exact,
      showExact: !!exact && (!decimal || (settings.exactAnswers && settings.format === 'auto')),
    }
  }

  function solutionsLatex(s: { variable: string; items: CasValue[]; showExact: boolean }) {
    if (!s.items.length) return '\\text{No solution}'
    const v = s.variable
    return s.items
      .map((r) =>
        !s.showExact && r.approx !== null
          ? `${v}\\approx ${numberLatex(format(math.bignumber(r.approx), cs, true), settings.decimal, true)}`
          : `${v}=${r.exact}`,
      )
      .join(',\\;')
  }

  /** What to show under the formula while typing. */
  const preview = $derived.by((): { latex?: string; working?: boolean; choose?: string[] } | null => {
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
      latex:
        '=' +
        (previewAsFraction && fraction
          ? fractionLatex(fraction, settings.mixedNumbers)
          : numberLatex(numeric.plain, settings.decimal, true)),
    }
  })

  const canFlip = $derived(
    solutions
      ? solutions.items.some((r) => r.approx !== null && !isPlainNumber(r.exact))
      : showingAnswer
        ? !!answer?.exact && !!answer.decimal
        : !viaCas && !!fraction,
  )

  // ---- layout ----

  const sideBySide = $derived(wide.current || short.current)
  const historyAside = $derived(wide.current && !short.current)
  const historyInline = $derived(!wide.current && !short.current)
  const sizeClass = $derived(ui.latex.length <= 24 ? 'l' : ui.latex.length <= 60 ? 'm' : 's')

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

  /** After a numeric answer, ask the CAS whether it has a nicer exact form (√2/2, π/3). */
  async function addExactForm(latex: string, a: Answer) {
    if (a.exact || !settings.exactAnswers || settings.format !== 'auto' || !IRRATIONAL.test(latex)) return
    let r: CasAnswer
    try {
      r = await askCas({ latex: forCas(latex), angle: casAngle(latex, false) })
    } catch {
      return
    }
    if (r.kind !== 'value' || r.symbolic || isPlainNumber(r.exact) || r.exact.includes('\\int')) return
    if (answer?.id !== a.id) return // a newer answer replaced this one
    const withExact = { ...a, exact: { latex: r.exact, plain: r.exact }, showExact: true }
    const entry = history.items.at(-1)
    if (entry?.latex === latex) {
      entry.exact = r.exact
      entry.showExact = true
    }
    const stillShown = showingAnswer
    answer = withExact
    if (stillShown) showAnswer(true)
  }

  async function equals(solveFor?: string) {
    if (!mf) return
    const latex = mf.value
    if (!latex.trim() || (showingAnswer && !solveFor)) return

    if (viaCas) {
      working = true
      let a: CasAnswer
      try {
        a = await askCas({ latex: forCas(latex), angle: casAngle(latex, true), solveFor })
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
      record(latex, ans)
      answer = ans
      showAnswer(ans.showExact)
      return
    }

    const r = evaluate(latex)
    if (!r.ok) {
      error = r.error || 'Syntax error'
      shake()
      return
    }
    const f = toFraction(r.value)
    const ans: Answer = {
      id: ++answerSeq,
      value: r.value,
      decimal: { latex: plainToLatex(r.plain), plain: r.plain },
      exact: f ? { latex: fractionLatex(f, settings.mixedNumbers), plain: fractionPlain(f) } : null,
      showExact: !!f && wantsFraction(latex) !== flipped,
    }
    record(latex, ans)
    answer = ans
    showAnswer(ans.showExact)
    addExactForm(latex, ans)
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
      copy(previewAsFraction && fraction ? fractionPlain(fraction) : numeric.plain)
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

  const NO_RETURN = new Set(['inv', 'angle', 'left', 'right'])

  function onkey(key: Key, page: string) {
    haptic()
    if (!mf) return
    focusField()
    switch (key.id) {
      case 'clear':
        return clear()
      case 'equals':
        return equals()
      case 'inv':
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
    // on a phone, a function page closes after use, like a menu
    if (page !== 'main' && !sideBySide && settings.autoReturn && !NO_RETURN.has(key.id)) ui.page = 'main'
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
    field.addEventListener('keydown', onFieldKeydown, { capture: true })
    field.addEventListener('input', sync)
    field.addEventListener('pointerdown', () => (justEvaluated = false))
    mf = field
    mf.position = mf.lastOffset
    if (ui.page === 'calc') warmUpCas()
    // on a computer, start typing right away; on a phone, nothing should pop up
    if (matchMedia('(pointer: fine)').matches) focusField()
    return () => {
      field.remove()
      mf = undefined
    }
  })
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="calc" class:wide={wide.current}>
  <div class="main">
    <div class="display">
      {#if historyInline}
        <div class="history-inline">
          <History onpick={pick} compact />
        </div>
      {/if}

      <div class="field {sizeClass}" class:shaking bind:this={host}></div>

      <div class="result-row" aria-live="polite">
        <FormatChip onchange={reformatAnswer} />
        <span class="spacer"></span>
        {#if error}
          <span class="error">{error}</span>
        {:else if solutions}
          <span class="preview solved">{@html latexMarkup(solutionsLatex(solutions))}</span>
        {:else if working}
          <span class="working">{cas.status === 'loading' ? 'Loading the math engine…' : 'Working…'}</span>
        {:else if chooseVars || preview?.choose}
          <span class="label">Solve for</span>
          {#each chooseVars ?? preview?.choose ?? [] as v (v)}
            <button class="var" onmousedown={(e) => e.preventDefault()} onclick={() => equals(v)}>
              {@html latexMarkup(v)}
            </button>
          {/each}
        {:else if preview?.working}
          <span class="working">{cas.status === 'loading' ? 'Loading the math engine…' : 'Working…'}</span>
        {:else if preview?.latex}
          <span class="preview">{@html latexMarkup(preview.latex)}</span>
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
      <History onpick={pick} />
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

  .field.l {
    font-size: clamp(30px, 5.2dvh, 44px);
  }
  .field.m {
    font-size: clamp(24px, 4dvh, 34px);
  }
  .field.s {
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

  .var:hover {
    background: var(--key-op);
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
    .field.l,
    .field.m {
      font-size: 28px;
    }
    .field.s {
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
