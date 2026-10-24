<script lang="ts">
  import { tick } from 'svelte'
  import { evaluateNotebook } from '../engine/notebook'
  import { settings, calcSettings, notebook, newSheet, copy } from '../lib/state.svelte'
  import Icon from './Icon.svelte'

  let editor = $state<HTMLTextAreaElement>()
  let scrollTop = $state(0)
  let help = $state(false)
  let confirmDelete = $state(false)
  let confirmTimer: ReturnType<typeof setTimeout>

  const sheet = $derived(notebook.sheets.find((s) => s.id === notebook.current) ?? notebook.sheets[0])

  const results = $derived(evaluateNotebook(sheet.text, calcSettings(settings)))

  function select(id: string) {
    notebook.current = id
    confirmDelete = false
    scrollTop = 0
  }

  async function add() {
    const s = newSheet(`Sheet ${notebook.sheets.length + 1}`)
    notebook.sheets.push(s)
    select(s.id)
    await tick()
    editor?.focus()
  }

  function remove() {
    if (!confirmDelete) {
      confirmDelete = true
      clearTimeout(confirmTimer)
      confirmTimer = setTimeout(() => (confirmDelete = false), 3000)
      return
    }
    confirmDelete = false
    const i = notebook.sheets.findIndex((s) => s.id === sheet.id)
    if (notebook.sheets.length === 1) {
      sheet.text = ''
      sheet.title = 'Sheet 1'
      return
    }
    notebook.sheets.splice(i, 1)
    select(notebook.sheets[Math.max(0, i - 1)].id)
  }
</script>

<div class="notebook">
  <div class="sheets" role="tablist" aria-label="Sheets">
    {#each notebook.sheets as s (s.id)}
      <button role="tab" aria-selected={s.id === sheet.id} onclick={() => select(s.id)}>{s.title || 'Untitled'}</button>
    {/each}
    <button class="add" aria-label="New sheet" onclick={add}><Icon name="plus" size={20} /></button>
  </div>

  <div class="toolbar">
    <label class="visually-hidden" for="sheet-title">Sheet title</label>
    <input id="sheet-title" class="title" bind:value={sheet.title} placeholder="Untitled" autocomplete="off" />
    <button class="icon-btn" aria-label="Help" aria-expanded={help} onclick={() => (help = !help)}>
      <Icon name="help" />
    </button>
    <button class="icon-btn delete" class:confirming={confirmDelete} onclick={remove} aria-label="Delete sheet">
      <Icon name="trash" />
      {#if confirmDelete}<span>Delete?</span>{/if}
    </button>
  </div>

  {#if help}
    <div class="help">
      <p>One calculation per line; the answer appears on the right. Tap an answer to copy it.</p>
      <dl>
        <dt>rent = 1 200</dt><dd>a variable</dd>
        <dt>Food: 450</dt><dd>a label before the colon</dd>
        <dt>total</dt><dd>sum of the lines above, up to an empty line</dd>
        <dt>prev</dt><dd>the answer of the previous line</dd>
        <dt># note</dt><dd>a comment</dd>
        <dt>5 km to m, 9.81 m/s^2 * 2 s</dt><dd>units</dd>
        <dt>sin(30), sqrt(2), 2^10, 15%</dt><dd>functions, as in the calculator</dd>
      </dl>
    </div>
  {/if}

  <div class="sheet">
    <label class="visually-hidden" for="sheet-text">Sheet text</label>
    <textarea
      id="sheet-text"
      class="num"
      bind:this={editor}
      value={sheet.text}
      oninput={(e) => (sheet.text = e.currentTarget.value)}
      onscroll={() => (scrollTop = editor?.scrollTop ?? 0)}
      wrap="off"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      placeholder={'price = 250\nprice * 4\nDiscount: price * 4 * 10%'}
    ></textarea>
    <div class="results" aria-label="Answers">
      <div class="rows" style:transform="translateY({-scrollTop}px)">
        {#each results as r, i (i)}
          <div class="row">
            {#if r.kind === 'value'}
              <button class="value num" title="Copy" onclick={() => copy(r.plain)}>{r.text}</button>
            {:else if r.kind === 'error'}
              <span class="err" title={r.error}>{r.error}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .notebook {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 8px 12px 12px;
    gap: 8px;
  }

  .sheets {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    flex: none;
  }

  .sheets button {
    flex: none;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--key-fn);
    color: var(--muted);
    font-size: 15px;
    white-space: nowrap;
  }

  .sheets button[aria-selected='true'] {
    background: var(--text);
    color: var(--bg);
  }

  .sheets .add {
    width: 40px;
    padding: 0;
    display: grid;
    place-items: center;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: none;
  }

  .title {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    border: 0;
    border-radius: 10px;
    padding: 0 8px;
    background: transparent;
    font-size: 20px;
    font-weight: 600;
  }

  .title:hover,
  .title:focus {
    background: var(--surface);
    outline: none;
  }

  .delete {
    width: auto;
    min-width: 44px;
    padding: 0 10px;
    gap: 6px;
    display: inline-flex;
  }

  .delete.confirming {
    color: var(--error);
    font-weight: 600;
  }

  .help {
    flex: none;
    padding: 12px 16px;
    border-radius: 16px;
    background: var(--surface);
    font-size: 15px;
    max-height: 40dvh;
    overflow-y: auto;
  }

  .help p {
    margin: 0 0 8px;
  }

  .help dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 16px;
    margin: 0;
  }

  .help dt {
    font-family: var(--mono);
    font-size: 14px;
  }

  .help dd {
    margin: 0;
    color: var(--muted);
  }

  .sheet {
    --line: 32px;
    --pad: 12px;
    flex: 1;
    min-height: 0;
    display: flex;
    border-radius: 20px;
    background: var(--surface);
    overflow: hidden;
  }

  textarea {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    resize: none;
    background: transparent;
    padding: var(--pad) 12px var(--pad) 16px;
    font-size: 17px;
    line-height: var(--line);
    white-space: pre;
    overflow: auto;
    scrollbar-width: thin;
    caret-color: var(--accent-text);
  }

  textarea::placeholder {
    color: var(--muted);
    opacity: 0.7;
  }

  .results {
    flex: none;
    width: clamp(110px, 38%, 280px);
    border-left: 1px solid var(--border);
    overflow: hidden;
    position: relative;
  }

  .rows {
    padding: var(--pad) 0;
  }

  .row {
    height: var(--line);
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: 0 12px;
    font-size: 17px;
  }

  .value {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--accent-text);
    font-weight: 600;
    border-radius: 6px;
    padding: 0 4px;
    line-height: calc(var(--line) - 4px);
  }

  .value:hover {
    background: var(--key-fn);
  }

  .err {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--error);
    font-size: 14px;
  }
</style>
