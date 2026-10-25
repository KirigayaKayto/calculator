<script lang="ts">
  import Icon from './Icon.svelte'
  import {
    evaluateProgrammer,
    formatRadix,
    groupDigits,
    characterOf,
    isDigit,
    pastedProgram,
    bitAt,
    flipBit,
    wrap,
    RADIX_NAMES,
    type Radix,
    type WordSize,
  } from '../engine/programmer'
  import { CalcError } from '../engine/errors'
  import { programmer as p, haptic, copy } from '../lib/state.svelte'

  let field = $state<HTMLInputElement>()

  const word = $derived({ bits: p.bits, signed: p.signed })

  type Outcome = { ok: true; value: bigint | null } | { ok: false; error: string }
  const outcome: Outcome = $derived.by(() => {
    try {
      return { ok: true, value: evaluateProgrammer(p.expr, p.radix, word) }
    } catch (e) {
      return { ok: false, error: e instanceof CalcError ? e.message : 'Something went wrong' }
    }
  })

  // while an expression is unfinished ("5 AND"), the rows keep the last value
  let last = 0n
  const value = $derived.by(() => {
    if (outcome.ok) last = outcome.value ?? 0n
    return wrap(last, word)
  })
  const pending = $derived(!outcome.ok)

  const RADIXES: Radix[] = [16, 10, 8, 2]
  const SIZES: WordSize[] = [64, 32, 16, 8]

  const rowText = (r: Radix) => groupDigits(formatRadix(value, r, word), r)
  const char = $derived(characterOf(value))

  /** Switching the radix carries the value over, written in the new one. */
  function setRadix(r: Radix) {
    haptic()
    if (outcome.ok && outcome.value !== null) p.expr = formatRadix(outcome.value, r, word)
    p.radix = r
    field?.focus()
  }

  function setValue(n: bigint) {
    p.expr = formatRadix(wrap(n, word), p.radix, word)
  }

  /** A new word size or sign: the value is cut to fit, and written anew. */
  function setWord(bits: WordSize, signed: boolean) {
    haptic()
    const next = { bits, signed }
    if (outcome.ok && outcome.value !== null) p.expr = formatRadix(wrap(outcome.value, next), p.radix, next)
    p.bits = bits
    p.signed = signed
  }

  // ---- typing ----

  function insert(text: string) {
    haptic()
    const f = field
    if (!f) return
    const start = f.selectionStart ?? f.value.length
    const end = f.selectionEnd ?? start
    // operators get spaces around them, unless there already is one
    if (text.startsWith(' ') && f.value.slice(0, start).endsWith(' ')) text = text.trimStart()
    f.setRangeText(text, start, end, 'end')
    p.expr = f.value
    f.focus()
  }

  function backspace() {
    haptic()
    const f = field
    if (!f) return
    let start = f.selectionStart ?? f.value.length
    const end = f.selectionEnd ?? start
    if (start === end) {
      // a whole operator word goes at once: " AND " → ""
      const before = f.value.slice(0, start)
      const tail = /\s*(?:AND|OR|XOR|NOT|NAND|NOR|SHL|SHR|ROL|ROR|MOD|<<|>>)\s*$/i.exec(before)
      start = tail ? start - tail[0].length : Math.max(0, start - 1)
    }
    f.setRangeText('', start, end, 'end')
    p.expr = f.value
    f.focus()
  }

  function clear() {
    haptic()
    p.expr = ''
    field?.focus()
  }

  function equals() {
    haptic()
    if (outcome.ok && outcome.value !== null) setValue(outcome.value)
    field?.focus()
  }

  function negate() {
    haptic()
    if (outcome.ok) setValue(-(outcome.value ?? 0n))
    field?.focus()
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      equals()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      clear()
    }
  }

  /** Pasted from elsewhere: 1111 0000 or 1 234 567 is one number. */
  function onpaste(e: ClipboardEvent & { currentTarget: HTMLInputElement }) {
    const text = e.clipboardData?.getData('text/plain')
    if (!text) return
    e.preventDefault()
    const f = e.currentTarget
    f.setRangeText(pastedProgram(text), f.selectionStart ?? f.value.length, f.selectionEnd ?? f.value.length, 'end')
    p.expr = f.value
  }

  type PadKey = { label: string; aria?: string; text?: string; act?: () => void; kind: 'num' | 'fn' | 'op' | 'eq'; digit?: string; wide?: boolean }
  const op = (label: string, text = ` ${label} `, aria?: string): PadKey => ({ label, text, kind: 'fn', aria })
  const digit = (d: string): PadKey => ({ label: d, text: d, kind: 'num', digit: d })

  const KEYS: PadKey[] = [
    op('AND'), op('OR'), op('XOR'), op('NOT', 'NOT '), op('<<', ' << ', 'Shift left'), op('>>', ' >> ', 'Shift right'),
    op('NAND'), op('NOR'), op('mod', ' MOD ', 'Remainder'), op('(', '(', 'Open parenthesis'), op(')', ')', 'Close parenthesis'),
    { label: 'AC', aria: 'Clear', act: clear, kind: 'fn' },
    digit('A'), digit('B'), digit('7'), digit('8'), digit('9'), { label: '÷', aria: 'Divide', text: ' / ', kind: 'op' },
    digit('C'), digit('D'), digit('4'), digit('5'), digit('6'), { label: '×', aria: 'Multiply', text: ' * ', kind: 'op' },
    digit('E'), digit('F'), digit('1'), digit('2'), digit('3'), { label: '−', aria: 'Minus', text: ' - ', kind: 'op' },
    { label: '±', aria: 'Change sign', act: negate, kind: 'fn' },
    { label: '⌫', aria: 'Delete', act: backspace, kind: 'fn' },
    digit('0'),
    { label: '=', aria: 'Equals', act: equals, kind: 'eq', wide: true },
    { label: '+', aria: 'Plus', text: ' + ', kind: 'op' },
  ]

  const press = (k: PadKey) => (k.act ? k.act() : insert(k.text!))

  /** The word's bits in rows of 16, highest first. */
  const bitRows = $derived.by(() => {
    const rows: number[][] = []
    for (let top = p.bits - 1; top >= 0; top -= 16) {
      rows.push(Array.from({ length: Math.min(16, top + 1) }, (_, k) => top - k))
    }
    return rows
  })

  function toggleBit(i: number) {
    haptic()
    setValue(flipBit(value, i, word))
  }

  const keepFocus = (e: MouseEvent) => e.preventDefault()
</script>

<div class="programmer">
  <div class="display">
    <label class="visually-hidden" for="programmer-input">Expression in {RADIX_NAMES[p.radix]}</label>
    <input
      id="programmer-input"
      bind:this={field}
      class="expr num"
      class:pending
      value={p.expr}
      placeholder="0"
      inputmode="none"
      autocomplete="off"
      spellcheck="false"
      oninput={(e) => (p.expr = e.currentTarget.value)}
      {onpaste}
      {onkeydown}
    />
    <p class="status" aria-live="polite">
      {#if !outcome.ok && p.expr.trim()}<span class="error">{outcome.error}</span>{/if}
    </p>

    <div class="rows" role="radiogroup" aria-label="Type in">
      {#each RADIXES as r (r)}
        <div class="row" class:active={p.radix === r}>
          <button role="radio" aria-checked={p.radix === r} class="pick" onmousedown={keepFocus} onclick={() => setRadix(r)}>
            <span class="name">{RADIX_NAMES[r]}</span>
            <span class="digits num" class:bin={r === 2}>{rowText(r)}</span>
          </button>
          <button class="copy" aria-label="Copy {RADIX_NAMES[r]}" onclick={() => copy(formatRadix(value, r, word))}>
            <Icon name="copy" size={16} />
          </button>
        </div>
      {/each}
      <div class="row char-row">
        <span class="name">CHR</span>
        <span class="digits">
          {#if char}
            <span class="glyph">{char}</span>
            <span class="code">U+{value.toString(16).toUpperCase().padStart(4, '0')}</span>
          {:else}
            <span class="code">—</span>
          {/if}
        </span>
      </div>
    </div>
  </div>

  <div class="options">
    <div class="chips" role="radiogroup" aria-label="Word size">
      {#each SIZES as s (s)}
        <button role="radio" aria-checked={p.bits === s} onmousedown={keepFocus} onclick={() => setWord(s, p.signed)}>{s}-bit</button>
      {/each}
    </div>
    <div class="chips" role="radiogroup" aria-label="Sign">
      <button role="radio" aria-checked={p.signed} onmousedown={keepFocus} onclick={() => setWord(p.bits, true)}>Signed</button>
      <button role="radio" aria-checked={!p.signed} onmousedown={keepFocus} onclick={() => setWord(p.bits, false)}>Unsigned</button>
    </div>
    <div class="chips" role="tablist" aria-label="Show">
      <button role="tab" aria-selected={p.view === 'keys'} onmousedown={keepFocus} onclick={() => (p.view = 'keys')}>Keys</button>
      <button role="tab" aria-selected={p.view === 'bits'} onmousedown={keepFocus} onclick={() => (p.view = 'bits')}>Bits</button>
    </div>
  </div>

  {#if p.view === 'keys'}
    <div class="pad" role="group" aria-label="Keys">
      {#each KEYS as k (k.label)}
        <button
          class="key {k.kind}"
          class:wide={k.wide}
          aria-label={k.aria}
          disabled={k.digit !== undefined && !isDigit(k.digit, p.radix)}
          onmousedown={keepFocus}
          onclick={() => press(k)}>{k.label}</button
        >
      {/each}
    </div>
  {:else}
    <div class="bits" role="group" aria-label="Bits: tap one to flip it">
      {#each bitRows as row, ri (ri)}
        <div class="bit-row">
          {#each row as i (i)}
            <button
              class="bit num"
              class:on={bitAt(value, i, word)}
              class:sign={p.signed && i === p.bits - 1}
              aria-label="Bit {i}: {bitAt(value, i, word) ? 1 : 0}"
              aria-pressed={bitAt(value, i, word)}
              onmousedown={keepFocus}
              onclick={() => toggleBit(i)}
            >
              {bitAt(value, i, word) ? 1 : 0}
              {#if i % 4 === 0}<span class="pos">{i}</span>{/if}
            </button>
          {/each}
        </div>
      {/each}
      <p class="hint">Tap a bit to flip it.{p.signed ? " The highest bit is the sign." : ""}</p>
    </div>
  {/if}
</div>

<style>
  .programmer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 100%;
  }

  .display {
    padding: 8px 12px 10px;
    border-radius: 20px;
    background: var(--surface);
  }

  .expr {
    width: 100%;
    min-height: 52px;
    border: 0;
    padding: 0 4px;
    background: transparent;
    font-size: 30px;
    text-align: right;
    color: var(--text);
    caret-color: var(--key-eq);
  }

  .expr:focus {
    outline: none;
  }

  .expr.pending {
    color: var(--muted);
  }

  .status {
    min-height: 18px;
    margin: 0 4px 4px;
    font-size: 13px;
    text-align: right;
  }

  .error {
    color: var(--error);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row {
    display: flex;
    align-items: center;
    border-radius: 10px;
  }

  .row.active {
    background: var(--key-fn);
  }

  .pick {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
    min-height: 36px;
    padding: 4px 8px;
    text-align: left;
  }

  .name {
    flex: none;
    width: 34px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--muted);
  }

  .row.active .name {
    color: var(--key-eq);
  }

  .digits {
    flex: 1;
    min-width: 0;
    font-size: 17px;
    overflow-wrap: anywhere;
  }

  .digits.bin {
    font-size: 14px;
  }

  .copy {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    color: var(--muted);
  }

  .char-row {
    gap: 10px;
    min-height: 32px;
    padding: 0 8px;
  }

  .glyph {
    font-size: 18px;
    margin-right: 8px;
  }

  .code {
    font-size: 13px;
    color: var(--muted);
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chips {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 12px;
    background: var(--key-fn);
  }

  .chips button {
    min-height: 34px;
    padding: 0 10px;
    border-radius: 9px;
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
  }

  .chips button[aria-checked='true'],
  .chips button[aria-selected='true'] {
    background: var(--key);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .pad {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    grid-auto-rows: minmax(44px, 1fr);
    gap: 6px;
    min-height: 300px;
  }

  .key {
    display: grid;
    place-items: center;
    min-width: 0;
    border-radius: var(--radius);
    background: var(--key);
    color: var(--text);
    box-shadow: var(--shadow);
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }

  .key:active {
    background: var(--key-active);
  }

  .key.fn {
    background: var(--key-fn);
    font-size: 15px;
    font-weight: 500;
  }

  .key.op {
    background: var(--key-op);
    font-size: 26px;
  }

  .key.eq {
    background: var(--key-eq);
    color: var(--key-eq-text);
    font-size: 26px;
  }

  .key.wide {
    grid-column: span 2;
  }

  .key:disabled {
    opacity: 0.35;
    box-shadow: none;
  }

  .bits {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .bit-row {
    display: grid;
    grid-template-columns: repeat(16, 1fr);
    gap: 3px;
  }

  /* a wider gap between nibbles */
  .bit-row .bit:nth-child(4n + 1):not(:first-child) {
    margin-left: 5px;
  }

  .bit {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    height: 44px;
    padding-bottom: 8px;
    border-radius: 8px;
    background: var(--key);
    color: var(--muted);
    font-size: 17px;
  }

  .bit.on {
    background: var(--key-eq);
    color: var(--key-eq-text);
    font-weight: 700;
  }

  .bit.sign {
    outline: 1px dashed var(--border);
    outline-offset: -3px;
  }

  .pos {
    position: absolute;
    bottom: 2px;
    font-size: 9px;
    font-weight: 400;
    color: var(--muted);
  }

  .bit.on .pos {
    color: inherit;
    opacity: 0.75;
  }

  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }

  @media (max-height: 700px) {
    .pad {
      grid-auto-rows: minmax(38px, 1fr);
      min-height: 250px;
    }
    .expr {
      min-height: 44px;
      font-size: 26px;
    }
  }
</style>
