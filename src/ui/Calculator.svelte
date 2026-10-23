<script lang="ts">
  import { tick, onMount } from 'svelte'
  import { calculate, newScope, type CalcResult } from '../engine/calc'
  import { settings, ui, currency, wide, short, addHistory, haptic, copy } from '../lib/state.svelte'
  import Keypad, { type Key } from './Keypad.svelte'
  import History from './History.svelte'
  import Icon from './Icon.svelte'

  let field = $state<HTMLTextAreaElement>()
  let error = $state('')
  let shaking = $state(false)
  let inv = $state(false)

  /** Right after "=": a digit starts a new calculation, an operator continues from the result. */
  let justEvaluated = false
  /** The exact value behind the result shown after "=", so 1/3 × 3 gives 1, not 0,999… */
  let ans: { text: string; value: unknown } | null = null

  const undoStack: { value: string; caret: number }[] = []
  const redoStack: { value: string; caret: number }[] = []

  const OPERATORS = '+−×÷'

  function evaluate(expr: string): CalcResult {
    const scope = newScope(settings.angle)
    if (ans && expr.startsWith(ans.text)) {
      const rest = expr.slice(ans.text.length)
      if (rest === '' || /^\s*[-+−*×/÷:^%!²³)]/.test(rest)) {
        scope.set('_ans', ans.value)
        expr = '_ans' + rest
      }
    }
    return calculate(expr, settings, scope)
  }

  const preview = $derived.by(() => {
    currency.version // recalculate when exchange rates arrive
    return evaluate(ui.expr)
  })

  // a bare number needs no preview
  const showPreview = $derived(preview.ok && !/^\s*[-−]?[\d\s.,]*$/.test(ui.expr))

  const sideBySide = $derived(wide.current || short.current)
  const historyAside = $derived(wide.current && !short.current)
  const historyInline = $derived(!wide.current && !short.current)

  const sizeClass = $derived(
    ui.expr.length <= 10 ? 'xl' : ui.expr.length <= 16 ? 'l' : ui.expr.length <= 26 ? 'm' : 's',
  )

  function selection(): [number, number] {
    if (!field) return [ui.expr.length, ui.expr.length]
    return [field.selectionStart, field.selectionEnd]
  }

  function setExpr(value: string, caret: number, record = true) {
    if (record && value !== ui.expr) {
      undoStack.push({ value: ui.expr, caret: selection()[0] })
      if (undoStack.length > 200) undoStack.shift()
      redoStack.length = 0
    }
    ui.expr = value
    error = ''
    if (ans && !value.startsWith(ans.text)) ans = null
    tick().then(() => {
      if (!field) return
      field.focus({ preventScroll: true })
      field.setSelectionRange(caret, caret)
    })
  }

  function insert(text: string) {
    let value = ui.expr
    let [start, end] = selection()
    if (justEvaluated) {
      justEvaluated = false
      if (/^[-+−×÷^%!²)]/.test(text)) {
        start = end = value.length
      } else {
        value = ''
        start = end = 0
        ans = null
      }
    }
    // an operator replaces the one before it: "5+" then "×" gives "5×"; a minus may follow × and ÷
    if (start === end && OPERATORS.includes(text) && text !== '−') {
      const before = value.slice(0, start).replace(/[+−×÷\s]+$/, '')
      if (!before) return
      value = before + value.slice(end)
      start = end = before.length
    }
    setExpr(value.slice(0, start) + text + value.slice(end), start + text.length)
  }

  function decimalKey() {
    const [start] = selection()
    const number = (justEvaluated ? '' : ui.expr.slice(0, start)).match(/[\d.,]*$/)![0]
    if (/[.,]/.test(number)) return
    insert(number ? settings.decimal : '0' + settings.decimal)
  }

  function parenKey() {
    const before = justEvaluated ? '' : ui.expr.slice(0, selection()[0])
    const depth = (before.match(/\(/g)?.length ?? 0) - (before.match(/\)/g)?.length ?? 0)
    const last = before.trimEnd().slice(-1)
    insert(depth > 0 && /[\d)%!²³πe\p{L}]/u.test(last) ? ')' : '(')
  }

  function backspace() {
    justEvaluated = false
    const value = ui.expr
    const [start, end] = selection()
    if (start !== end) return setExpr(value.slice(0, start) + value.slice(end), start)
    if (start === 0) return
    // "sin(" and "√(" are erased as one piece
    const token = value.slice(0, start).match(/(?:[\p{L}√]+\(|\s+)$/u)?.[0]
    const len = token?.length ?? 1
    setExpr(value.slice(0, start - len) + value.slice(start), start - len)
  }

  function clear() {
    justEvaluated = false
    ans = null
    if (ui.expr) setExpr('', 0)
    error = ''
  }

  function equals() {
    const expr = ui.expr.trim()
    if (!expr) return
    const r = evaluate(expr)
    if (!r.ok) {
      error = r.error || 'Ошибка в выражении'
      shaking = true
      setTimeout(() => (shaking = false), 400)
      return
    }
    if (r.plain !== expr) addHistory({ expr, text: r.text, plain: r.plain, at: Date.now() })
    ans = { text: r.plain, value: r.value }
    setExpr(r.plain, r.plain.length)
    justEvaluated = true
  }

  function undo() {
    const prev = undoStack.pop()
    if (!prev) return
    redoStack.push({ value: ui.expr, caret: selection()[0] })
    justEvaluated = false
    setExpr(prev.value, prev.caret, false)
  }

  function redo() {
    const next = redoStack.pop()
    if (!next) return
    undoStack.push({ value: ui.expr, caret: selection()[0] })
    setExpr(next.value, next.caret, false)
  }

  function onkey(key: Key) {
    haptic()
    switch (key.id) {
      case 'clear':
        return clear()
      case 'back':
        return backspace()
      case 'equals':
        return equals()
      case 'paren':
        return parenKey()
      case 'decimal':
        return decimalKey()
      case 'inv':
        inv = !inv
        return
      case 'angle':
        settings.angle = settings.angle === 'deg' ? 'rad' : 'deg'
        return
      case 'toggle':
        ui.sciOpen = !ui.sciOpen
        return
      default:
        if (key.insert) {
          insert(key.insert)
          if (inv && key.kind === 'sci') inv = false
        }
    }
  }

  const TYPED: Record<string, string> = { '*': '×', '/': '÷', '-': '−', ':': '÷' }

  function typeChar(ch: string) {
    if (ch === '=') return equals()
    if (ch === '.' || (ch === ',' && settings.decimal === ',')) return decimalKey()
    insert(TYPED[ch] ?? ch)
  }

  function onbeforeinput(e: InputEvent) {
    switch (e.inputType) {
      case 'insertText':
        if (!e.data) return
        e.preventDefault()
        for (const ch of e.data) typeChar(ch)
        return
      case 'insertLineBreak':
      case 'insertParagraph':
        e.preventDefault()
        return equals()
      case 'deleteContentBackward':
        e.preventDefault()
        return backspace()
      case 'historyUndo':
        e.preventDefault()
        return undo()
      case 'historyRedo':
        e.preventDefault()
        return redo()
    }
  }

  /** Paste, drag-and-drop, delete and anything else the browser did itself. */
  function oninput() {
    if (!field) return
    const value = field.value.replace(/\r?\n/g, ' ')
    if (value === ui.expr) return
    undoStack.push({ value: ui.expr, caret: field.selectionStart })
    ui.expr = value
    error = ''
    justEvaluated = false
  }

  function onkeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey
    // e.code, so shortcuts also work with the Russian layout
    if (e.key === 'Enter') {
      e.preventDefault()
      equals()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      clear()
    } else if (mod && e.code === 'KeyZ') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if (mod && e.code === 'KeyY') {
      e.preventDefault()
      redo()
    }
  }

  /** Typing anywhere on the page goes into the expression. */
  function onWindowKeydown(e: KeyboardEvent) {
    if (!field || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
    const target = e.target as HTMLElement
    const onButton = target.tagName === 'BUTTON'
    if (target !== document.body && !onButton) return
    if (e.key.length === 1 && e.key !== ' ') {
      e.preventDefault()
      field.focus({ preventScroll: true })
      typeChar(e.key)
    } else if (!onButton && (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Escape')) {
      e.preventDefault()
      if (e.key === 'Enter') equals()
      else if (e.key === 'Backspace') backspace()
      else clear()
    }
  }

  function pick(text: string) {
    if (justEvaluated || !ui.expr.trim()) {
      justEvaluated = false
      ans = null
      setExpr(text, text.length)
    } else {
      insert(text)
    }
  }

  onMount(() => {
    // on a computer, start typing right away; on a phone, do not pop anything up
    if (matchMedia('(pointer: fine)').matches) field?.focus()
    field?.setSelectionRange(ui.expr.length, ui.expr.length)
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

      <label class="visually-hidden" for="expr">Выражение</label>
      <textarea
        id="expr"
        class="expr num {sizeClass}"
        class:shaking
        bind:this={field}
        value={ui.expr}
        rows="1"
        inputmode="none"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="0"
        aria-describedby="preview"
        aria-invalid={!!error}
        {onbeforeinput}
        {oninput}
        {onkeydown}
        onclick={() => (justEvaluated = false)}
      ></textarea>

      <div class="preview-row" id="preview" aria-live="polite">
        {#if error}
          <span class="error">{error}</span>
        {:else if showPreview && preview.ok}
          <span class="preview num">= {preview.text}</span>
          <button class="icon-btn copy" aria-label="Скопировать результат" onclick={() => preview.ok && copy(preview.plain)}>
            <Icon name="copy" size={18} />
          </button>
        {/if}
      </div>
    </div>

    <Keypad
      {onkey}
      decimal={settings.decimal}
      angle={settings.angle}
      {inv}
      sciOpen={ui.sciOpen}
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
    min-height: 112px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    margin: 8px 12px 0;
    padding: 8px 12px 4px;
    border-radius: 20px;
    background: var(--surface);
    overflow: hidden;
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

  .expr {
    width: 100%;
    flex: none;
    border: 0;
    outline: none;
    resize: none;
    background: transparent;
    text-align: right;
    line-height: 1.2;
    padding: 2px 0;
    max-height: 40dvh;
    field-sizing: content;
    scrollbar-width: none;
    overflow-wrap: anywhere;
    caret-color: var(--accent-text);
    transition: font-size var(--normal);
  }

  .expr::placeholder {
    color: var(--muted);
    opacity: 0.6;
  }

  .expr.xl {
    font-size: clamp(40px, 7dvh, 60px);
  }
  .expr.l {
    font-size: clamp(32px, 5.4dvh, 46px);
  }
  .expr.m {
    font-size: clamp(26px, 4.2dvh, 36px);
  }
  .expr.s {
    font-size: clamp(22px, 3.4dvh, 28px);
  }

  .expr.shaking {
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

  .preview-row {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }

  .preview {
    font-size: clamp(20px, 3.4dvh, 28px);
    color: var(--muted);
    text-align: right;
    overflow-wrap: anywhere;
  }

  .error {
    font-size: 18px;
    color: var(--error);
    font-weight: 500;
  }

  .copy {
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
    .preview-row {
      min-height: 36px;
    }
    .expr.xl,
    .expr.l {
      font-size: 34px;
    }
    .expr.m,
    .expr.s {
      font-size: 24px;
    }
  }

  .side {
    width: 320px;
    flex: none;
    margin: 12px 16px 16px 0;
    padding: 12px 8px;
    border-radius: 20px;
    background: var(--surface);
    min-height: 0;
  }
</style>
