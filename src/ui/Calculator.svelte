<script lang="ts">
  import { onMount } from 'svelte'
  import { MathfieldElement } from 'mathlive'
  import { calculate, calculateLatex, newScope, type CalcResult } from '../engine/calc'
  import { toFraction, fractionLatex, fractionPlain, prefersFraction } from '../engine/exact'
  import {
    settings,
    calcSettings,
    ui,
    wide,
    short,
    history,
    addHistory,
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

  /** Right after "=": a digit starts a new problem, an operator continues from the answer. */
  let justEvaluated = false

  interface Form {
    latex: string
    plain: string
  }
  interface Answer {
    value: unknown
    decimal: Form
    fraction: Form | null
    asFraction: boolean
  }
  /** The last answer, shown in the field after "=". Its exact value is used when continuing. */
  let answer = $state.raw<Answer | null>(null)
  /** What the field contained right after "=" (MathLive may rewrite the LaTeX we give it). */
  let answerLatex = $state('')

  const cs = $derived(calcSettings(settings))

  /** Ans: the exact last answer, or the last one in the history after a restart. */
  const ansValue = $derived.by(() => {
    if (answer) return answer.value
    const last = history.items.at(-1)
    if (!last) return undefined
    const r = calculate(last.plain, { ...cs, decimal: /\d,\d/.test(last.plain) ? ',' : '.' })
    return r.ok ? r.value : undefined
  })

  const CONTINUES = /^(?:[-+*/:^!)]|\\(?:cdot|times|div|bmod|%))/

  function evaluate(latex: string): CalcResult {
    const scope = newScope(cs.angle)
    if (ansValue !== undefined) scope.set('Ans', ansValue)
    if (answer && answerLatex && latex.startsWith(answerLatex)) {
      const rest = latex.slice(answerLatex.length).trimStart()
      if (rest === '' || CONTINUES.test(rest)) {
        scope.set('_ans', answer.value)
        return calculateLatex(rest, cs, scope, '_ans')
      }
    }
    return calculateLatex(latex, cs, scope)
  }

  /** Fractions are the natural answer only in the automatic format and for fraction problems. */
  function wantsFraction(latex: string) {
    return settings.format === 'auto' && prefersFraction(latex)
  }

  const result = $derived(evaluate(ui.latex))
  const fraction = $derived(result.ok ? toFraction(result.value) : null)
  const previewAsFraction = $derived(!!fraction && wantsFraction(ui.latex) !== flipped)
  const showingAnswer = $derived(!!answer && ui.latex === answerLatex)
  // a bare number needs no "= …" under it
  const showPreview = $derived(result.ok && !showingAnswer && !/^-?[\d{},.\s]*$/.test(ui.latex))

  const sideBySide = $derived(wide.current || short.current)
  const historyAside = $derived(wide.current && !short.current)
  const historyInline = $derived(!wide.current && !short.current)

  const sizeClass = $derived(ui.latex.length <= 24 ? 'l' : ui.latex.length <= 60 ? 'm' : 's')

  const plainToLatex = (plain: string) => numberLatex(plain, settings.decimal)

  function sync() {
    if (!mf) return
    ui.latex = mf.value
    error = ''
    flipped = false
  }

  function setValue(latex: string) {
    if (!mf) return
    mf.value = latex
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

  function showAnswer(asFraction: boolean) {
    if (!answer) return
    const form = asFraction && answer.fraction ? answer.fraction : answer.decimal
    answer = { ...answer, asFraction: form === answer.fraction }
    setValue(form.latex)
    answerLatex = ui.latex
    justEvaluated = true
  }

  function equals() {
    if (!mf) return
    const latex = mf.value
    if (!latex.trim() || showingAnswer) return
    const r = evaluate(latex)
    if (!r.ok) {
      error = r.error || 'Syntax error'
      shake()
      return
    }
    const f = toFraction(r.value)
    const asFraction = !!f && wantsFraction(latex) !== flipped
    const fractionForm = f
      ? { latex: fractionLatex(f, settings.mixedNumbers), plain: fractionPlain(f) }
      : null
    addHistory({
      latex,
      text: r.text,
      plain: r.plain,
      fraction: fractionForm?.latex,
      showFraction: asFraction,
      at: Date.now(),
    })
    answer = {
      value: r.value,
      decimal: { latex: plainToLatex(r.plain), plain: r.plain },
      fraction: fractionForm,
      asFraction,
    }
    showAnswer(asFraction)
  }

  /** ⇄: fraction ↔ decimal, for the answer in the field or for the preview. */
  function flip() {
    if (showingAnswer && answer) showAnswer(!answer.asFraction)
    else flipped = !flipped
    focusField()
  }

  function copyShown() {
    if (showingAnswer && answer) {
      copy(answer.asFraction && answer.fraction ? answer.fraction.plain : answer.decimal.plain)
    } else if (result.ok) {
      copy(previewAsFraction && fraction ? fractionPlain(fraction) : result.plain)
    }
  }

  /** The number format changed: show the answer in the field in the new format. */
  function reformatAnswer() {
    if (!showingAnswer || !answer) return focusField()
    const r = evaluate(answerLatex)
    if (r.ok) answer = { ...answer, decimal: { latex: plainToLatex(r.plain), plain: r.plain } }
    showAnswer(answer.asFraction && settings.format === 'auto')
    focusField()
  }

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

  /** Keys typed on a real keyboard while the formula has focus. MathLive handles the rest. */
  function onFieldKeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Enter' || e.key === '=') {
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
      if (e.key === '=') return equals()
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
    const latex =
      part === 'expr'
        ? (entry.latex ?? `\\text{${entry.expr ?? ''}}`)
        : entry.showFraction && entry.fraction
          ? entry.fraction
          : plainToLatex(entry.plain)
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
    field.smartFence = true
    // otherwise 2^10 becomes 2¹0: the cursor would leave the exponent after one digit
    field.smartSuperscript = false
    field.menuItems = []
    field.placeholder = '0'
    field.addEventListener('keydown', onFieldKeydown, { capture: true })
    field.addEventListener('input', sync)
    field.addEventListener('pointerdown', () => (justEvaluated = false))
    mf = field
    mf.position = mf.lastOffset
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
        {:else if showPreview && result.ok}
          <span class="preview">
            {@html latexMarkup(
              '=' +
                (previewAsFraction && fraction
                  ? fractionLatex(fraction, settings.mixedNumbers)
                  : numberLatex(result.plain, settings.decimal, true)),
            )}
          </span>
        {/if}
        {#if !error && ((showPreview && fraction) || (showingAnswer && answer?.fraction))}
          <button
            class="icon-btn"
            aria-label={(showingAnswer ? answer?.asFraction : previewAsFraction)
              ? 'Show as a decimal'
              : 'Show as a fraction'}
            title="Fraction ⇄ decimal"
            onmousedown={(e) => e.preventDefault()}
            onclick={flip}
          >
            <Icon name="flip" size={18} />
          </button>
        {/if}
        {#if !error && (showPreview || showingAnswer)}
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
      onpage={(p) => (ui.page = p)}
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
    overflow-wrap: anywhere;
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
