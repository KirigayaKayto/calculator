<script lang="ts">
  import { tick } from 'svelte'
  import type { MathfieldElement } from 'mathlive'
  import { evaluateWorksheet, type Item, type Line } from '../graph/model'
  import { formatBig } from '../engine/format'
  import { math } from '../engine/math'
  import { graph, settings, wide, short, PALETTE, newId, haptic } from '../lib/state.svelte'
  import { latexMarkup, numberLatex } from '../lib/markup'
  import GraphCanvas, { type Plot } from './GraphCanvas.svelte'
  import MathLine from './MathLine.svelte'
  import Keypad from './Keypad.svelte'
  import type { Key } from './keys'
  import Icon from './Icon.svelte'

  const sheet = $derived(evaluateWorksheet(graph.lines))
  const plots = $derived<Plot[]>(
    graph.lines.map((line, i) => ({ id: line.id, item: sheet.items[i], color: line.color, hidden: line.hidden })),
  )

  /** The line being edited, and its field (for the on-screen keypad). */
  let editing = $state<string | null>(null)
  let field: MathfieldElement | null = null
  let page = $state('main')
  let inv = $state(false)
  let keypadOnWide = $state(false)
  const lines = $state<Record<string, { focus(): void }>>({})

  // a computer, or a phone on its side: the list and the graph next to each other
  const sideBySide = $derived(wide.current || short.current)
  const showKeypad = $derived(sideBySide ? keypadOnWide && !!editing : !!editing)

  // ---- lines ----

  function addLine(after: number, latex = '') {
    const used = new Set(graph.lines.map((l) => l.color))
    const color = PALETTE.find((c) => !used.has(c)) ?? PALETTE[graph.lines.length % PALETTE.length]
    const line: Line = { id: newId(), latex, color }
    graph.lines.splice(after + 1, 0, line)
    tick().then(() => lines[line.id]?.focus())
  }

  function removeLine(i: number) {
    const [removed] = graph.lines.splice(i, 1)
    if (graph.selected === removed?.id) graph.selected = null
    if (!graph.lines.length) addLine(-1)
    else tick().then(() => lines[graph.lines[Math.max(0, i - 1)].id]?.focus())
  }

  function addSlider(name: string) {
    addLine(graph.lines.length - 1, `${name}=1`)
  }

  // ---- sliders ----

  function sliderOf(line: Line) {
    return line.slider ?? { min: -10, max: 10, step: 0.1 }
  }

  function setSlider(line: Line, item: Extract<Item, { kind: 'variable' }>, value: number) {
    const { step } = sliderOf(line)
    const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
    line.latex = `${item.name}=${value.toFixed(decimals).replace('.', settings.decimal === ',' ? '{,}' : '.')}`
  }

  function setRange(line: Line, key: 'min' | 'max', text: string) {
    const n = Number(text.replace(',', '.'))
    if (Number.isFinite(n)) line.slider = { ...sliderOf(line), [key]: n }
  }

  // ---- results ----

  function shown(value: number): string {
    if (!Number.isFinite(value)) return '\\text{undefined}'
    const plain = formatBig(math.bignumber(value), { decimal: settings.decimal, digits: 10, plain: true })
    return numberLatex(plain, settings.decimal, true)
  }

  // ---- the on-screen keypad edits the focused line ----

  function focusLine(id: string, f: MathfieldElement) {
    editing = id
    field = f
    graph.selected = id
    // the keypad takes room: keep the line being edited in sight
    tick().then(() => f.scrollIntoView({ block: 'nearest' }))
  }

  function done() {
    editing = null
    field?.blur()
    field = null
  }

  function onkey(key: Key, fromPage: string) {
    haptic()
    const f = field
    if (!f) return
    f.focus()
    switch (key.id) {
      case 'clear':
        f.value = ''
        break
      case 'back':
        f.executeCommand('deleteBackward')
        break
      case 'left':
        f.executeCommand('moveToPreviousChar')
        break
      case 'right':
        f.executeCommand('moveToNextChar')
        break
      case 'equals':
        // in the graph, "=" writes an equation: y = …, a = …
        f.executeCommand(['typedText', '='])
        break
      case 'paren':
        f.executeCommand(['typedText', '('])
        break
      case 'decimal':
        f.executeCommand(['typedText', settings.decimal])
        break
      case 'inv':
        inv = !inv
        return
      case 'angle':
      case 'ans':
        return
      default:
        if (key.typed) f.executeCommand(['typedText', key.typed])
        else if (key.latex) f.executeCommand(['insert', key.latex, { selectionMode: 'placeholder' }])
        inv = false
    }
    const line = graph.lines.find((l) => l.id === editing)
    if (line) line.latex = f.value
    if (fromPage !== 'main' && !sideBySide && settings.autoReturn && !['inv', 'left', 'right'].includes(key.id)) page = 'main'
  }

  function onfocusout(e: FocusEvent) {
    // leaving the list (not for the keypad, which keeps the focus in the field) ends editing
    const to = e.relatedTarget as Node | null
    if (to && (e.currentTarget as HTMLElement).contains(to)) return
    if (!to) return
    editing = null
  }
</script>

<div class="worksheet" class:wide={sideBySide} class:editing={showKeypad}>
  <section class="list" aria-label="Expressions" onfocusout={onfocusout}>
    <ol>
      {#each graph.lines as line, i (line.id)}
        {@const item = sheet.items[i]}
        <li class:selected={graph.selected === line.id}>
          <div class="row">
            <button
              class="swatch"
              style:--c={line.color}
              class:off={line.hidden}
              aria-pressed={!line.hidden}
              aria-label={line.hidden ? 'Show on the graph' : 'Hide from the graph'}
              onclick={() => (line.hidden = !line.hidden)}
            >
              <span></span>
            </button>
            <MathLine
              bind:this={lines[line.id]}
              latex={line.latex}
              label="Expression {i + 1}"
              onchange={(l) => (line.latex = l)}
              onfocus={(f) => focusLine(line.id, f)}
              onenter={() => addLine(i)}
              onemptyback={() => graph.lines.length > 1 && removeLine(i)}
            />
            <button class="icon-btn remove" aria-label="Delete expression {i + 1}" onclick={() => removeLine(i)}>
              <Icon name="x" size={18} />
            </button>
          </div>

          {#if item?.kind === 'value' || item?.kind === 'integral'}
            <div class="result">{@html latexMarkup('=' + shown(item.value))}</div>
          {:else if item?.kind === 'error'}
            <div class="error">{item.message}</div>
          {:else if item?.kind === 'variable' && item.slider}
            {@const range = sliderOf(line)}
            <div class="slider">
              <input
                class="bound"
                aria-label="Slider minimum"
                value={range.min}
                inputmode="decimal"
                onchange={(e) => setRange(line, 'min', e.currentTarget.value)}
              />
              <input
                type="range"
                aria-label="Value of {item.name}"
                min={range.min}
                max={range.max}
                step={range.step}
                value={item.value}
                style:--c={line.color}
                oninput={(e) => setSlider(line, item, Number(e.currentTarget.value))}
              />
              <input
                class="bound"
                aria-label="Slider maximum"
                value={range.max}
                inputmode="decimal"
                onchange={(e) => setRange(line, 'max', e.currentTarget.value)}
              />
            </div>
          {/if}
        </li>
      {/each}
    </ol>

    <div class="actions">
      <button class="add" onclick={() => addLine(graph.lines.length - 1)}><Icon name="plus" size={18} /> Add expression</button>
      {#if sideBySide}
        <button
          class="icon-btn"
          aria-label="Show the keypad"
          aria-pressed={keypadOnWide}
          onclick={() => (keypadOnWide = !keypadOnWide)}
        >
          <Icon name="keyboard" />
        </button>
      {/if}
    </div>

    {#if sheet.missing.length}
      <div class="missing">
        <span>Add a slider:</span>
        {#each sheet.missing as name (name)}
          <button onclick={() => addSlider(name)}>{@html latexMarkup(name)}</button>
        {/each}
      </div>
    {/if}
  </section>

  <div class="canvas">
    <GraphCanvas
      {plots}
      bind:view={graph.view}
      selected={graph.selected}
      onselect={(id) => (graph.selected = id)}
      decimal={settings.decimal}
    />
  </div>

  {#if showKeypad}
    <div class="keys">
      <div class="keys-bar">
        <button class="done" onmousedown={(e) => e.preventDefault()} onclick={done}>Done</button>
      </div>
      <Keypad
        {onkey}
        onpage={(p) => (page = p)}
        {page}
        decimal={settings.decimal}
        angle="rad"
        {inv}
        wide={false}
        compact
      />
    </div>
  {/if}
</div>

<style>
  /* "minmax(0, 1fr)": a long list scrolls inside its box instead of stretching the page */
  .worksheet {
    height: 100%;
    display: grid;
    grid-template-rows: minmax(160px, 42dvh) minmax(0, 1fr);
    grid-template-areas: 'canvas' 'list';
    gap: 8px;
    padding: 8px 12px 12px;
  }

  .worksheet.editing {
    grid-template-rows: minmax(110px, 22dvh) minmax(96px, 1fr) auto;
    grid-template-areas: 'canvas' 'list' 'keys';
  }

  .worksheet.wide {
    grid-template-columns: 380px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: 'list canvas';
    padding: 12px 16px 16px;
    gap: 16px;
  }

  .worksheet.wide.editing {
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas: 'list canvas' 'keys canvas';
  }

  @media (max-height: 520px) {
    .worksheet.wide {
      grid-template-columns: minmax(260px, 40%) minmax(0, 1fr);
      padding: 6px 12px 8px;
      gap: 10px;
    }
  }

  .canvas {
    grid-area: canvas;
    min-height: 0;
  }

  /* "position: relative" makes the list clip MathLive's absolutely placed helpers too;
     without it the lines scrolled out of view would stretch the page */
  .list {
    grid-area: list;
    position: relative;
    min-height: 0;
    overflow-y: auto;
    border-radius: 20px;
    background: var(--surface);
    padding: 6px 0;
  }

  .keys {
    grid-area: keys;
    margin: 0 -12px -12px;
  }

  .wide .keys {
    margin: 0;
  }

  .keys-bar {
    display: flex;
    justify-content: flex-end;
    padding: 0 12px;
  }

  .done {
    min-height: 36px;
    padding: 0 16px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    color: var(--accent-text);
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    padding: 4px 6px 4px 8px;
    border-left: 3px solid transparent;
  }

  li.selected {
    border-left-color: var(--key-eq);
    background: color-mix(in srgb, var(--key-eq) 8%, transparent);
  }

  li + li {
    border-top: 1px solid var(--border);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 48px;
  }

  .swatch {
    flex: none;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 50%;
  }

  .swatch span {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--c);
    border: 2px solid var(--c);
  }

  .swatch.off span {
    background: transparent;
  }

  .remove {
    flex: none;
    width: 36px;
    height: 36px;
    color: var(--muted);
  }

  .result {
    text-align: right;
    padding: 0 44px 4px 0;
    font-size: 18px;
    color: var(--muted);
  }

  .error {
    padding: 0 44px 4px 38px;
    font-size: 13px;
    color: var(--error);
  }

  .slider {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 44px 6px 38px;
  }

  .slider input[type='range'] {
    flex: 1;
    accent-color: var(--c);
    min-height: 32px;
  }

  .bound {
    width: 48px;
    min-height: 32px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--key);
    font-size: 13px;
    text-align: center;
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
  }

  .add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 12px;
    border-radius: 12px;
    font-size: 15px;
    color: var(--muted);
  }

  .add:hover {
    background: var(--key-fn);
  }

  .missing {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 4px 12px 8px;
    font-size: 14px;
    color: var(--muted);
  }

  .missing button {
    min-width: 40px;
    min-height: 36px;
    padding: 0 10px;
    border-radius: 10px;
    background: var(--key-fn);
    font-size: 18px;
  }
</style>
