<script lang="ts">
  import { onMount } from 'svelte'
  import type { MathfieldElement } from 'mathlive'
  import Icon from './Icon.svelte'
  import MathLine from './MathLine.svelte'
  import Keypad from './Keypad.svelte'
  import { applyKey } from './applyKey'
  import { latexMarkup } from '../lib/markup'
  import { KEYS, PAGES, PAGE_SIZE, customKey, type Key, type Page } from './keys'
  import { keyLayout, newId, showToast, settings, haptic, type CustomKeyData } from '../lib/state.svelte'

  let { onclose }: { onclose: () => void } = $props()

  let dialog = $state<HTMLDialogElement>()
  let pageId = $state('main')
  /** The slot being edited, and what the next tap on the grid does. */
  let slot = $state<number | null>(null)
  let mode = $state<'idle' | 'swap' | 'pick'>('idle')
  let newLabel = $state('')
  let newFormula = $state('')
  let formulaField = $state<{ insert(tex: string): void }>()
  /** The formula field, while it has the focus: the keypad below types into it. */
  let typing = $state<MathfieldElement | null>(null)
  let keyPage = $state('main')
  let inv = $state(false)

  function onkey(key: Key) {
    haptic()
    if (!typing) return
    if (applyKey(typing, key, settings.decimal) === 'inv') {
      inv = !inv
      return
    }
    inv = false
    newFormula = typing.value
  }

  const pages = $derived(keyLayout.pages ?? PAGES)
  const page = $derived(pages.find((p) => p.id === pageId) ?? pages[0])
  const custom = $derived(Object.fromEntries(keyLayout.custom.map((c) => [c.id, customKey(c.id, c.label, c.formula)])))
  const keyOf = (id: string): Key | null => KEYS[id] ?? custom[id] ?? null

  /** The built-in keys to pick from, grouped as on the default pages, each key once. */
  const catalog = (() => {
    const seen = new Set<string>()
    return PAGES.map((p) => ({ label: p.label, keys: p.keys.filter((id) => id && !seen.has(id) && seen.add(id)) }))
  })()

  onMount(() => dialog?.showModal())

  /** The first change copies the default layout; from then on the person's own is used. */
  function editable(): Page[] {
    keyLayout.pages ??= JSON.parse(JSON.stringify(PAGES)) as Page[]
    return keyLayout.pages
  }
  const editedPage = () => editable().find((p) => p.id === page.id)!

  function tapSlot(i: number) {
    if (mode === 'swap' && slot !== null && slot !== i) {
      const keys = editedPage().keys
      ;[keys[slot], keys[i]] = [keys[i], keys[slot]]
      mode = 'idle'
    }
    slot = i
    if (mode === 'swap') mode = 'idle'
  }

  function place(id: string) {
    if (slot === null) return
    editedPage().keys[slot] = id
    mode = 'idle'
  }

  function addPage() {
    if (pages.length >= 7) return showToast('Up to 7 pages')
    const p: Page = { id: `page-${newId()}`, label: 'Mine', keys: Array(PAGE_SIZE).fill('') }
    editable().push(p)
    pageId = p.id
    slot = 0
    mode = 'pick'
  }

  function removePage() {
    if (page.id === 'main') return
    const list = editable()
    list.splice(list.findIndex((p) => p.id === page.id), 1)
    pageId = 'main'
    slot = null
  }

  function addCustom() {
    if (!newFormula.trim()) return
    const c: CustomKeyData = { id: `custom-${newId()}`, label: newLabel.trim().slice(0, 10), formula: newFormula }
    keyLayout.custom.push(c)
    if (slot !== null) place(c.id)
    newLabel = ''
    newFormula = ''
    showToast(slot !== null ? 'Key added to the page' : 'Key made: pick a place for it')
  }

  function deleteCustom(id: string) {
    keyLayout.custom = keyLayout.custom.filter((c) => c.id !== id)
    for (const p of keyLayout.pages ?? []) p.keys = p.keys.map((k) => (k === id ? '' : k))
  }

  function reset() {
    keyLayout.pages = null
    pageId = 'main'
    slot = null
    showToast('Default layout restored')
  }

  async function copyLayout() {
    try {
      await navigator.clipboard.writeText(JSON.stringify($state.snapshot(keyLayout)))
      showToast('Layout copied')
    } catch {
      showToast('Could not copy')
    }
  }

  function isLayout(x: unknown): x is { pages: Page[] | null; custom: CustomKeyData[] } {
    const d = x as { pages: unknown; custom: unknown }
    const pageOk = (p: Page) => typeof p.id === 'string' && typeof p.label === 'string' && Array.isArray(p.keys) && p.keys.length === PAGE_SIZE
    const keyOk = (c: CustomKeyData) => typeof c.id === 'string' && typeof c.label === 'string' && typeof c.formula === 'string'
    return (
      !!d &&
      (d.pages === null || (Array.isArray(d.pages) && d.pages.every(pageOk) && d.pages.some((p: Page) => p.id === 'main'))) &&
      Array.isArray(d.custom) &&
      d.custom.every(keyOk)
    )
  }

  async function pasteLayout() {
    try {
      const data = JSON.parse(await navigator.clipboard.readText())
      if (!isLayout(data)) throw new Error()
      keyLayout.pages = data.pages
      keyLayout.custom = data.custom
      pageId = 'main'
      slot = null
      showToast('Layout pasted')
    } catch {
      showToast('No key layout in the clipboard')
    }
  }
</script>

{#snippet face(key: Key | null)}
  {#if !key}
    <span class="empty">empty</span>
  {:else if key.icon}
    <Icon name={key.icon} size={20} />
  {:else if key.labelLatex}
    <span class="formula">{@html latexMarkup(key.labelLatex)}</span>
  {:else}
    {key.label}
  {/if}
{/snippet}

<dialog bind:this={dialog} aria-labelledby="keys-title" onclose={onclose}>
  <div class="sheet">
    <header>
      <h2 id="keys-title">Customize keys</h2>
      <button class="done" onclick={() => dialog?.close()}>Done</button>
    </header>
    <p class="hint">Tap a key, then change it, swap it with another or clear the place.</p>

    <div class="tabs" role="tablist" aria-label="Pages">
      {#each pages as p (p.id)}
        <button
          role="tab"
          aria-selected={p.id === page.id}
          onclick={() => {
            pageId = p.id
            slot = null
            mode = 'idle'
          }}>{p.label}</button
        >
      {/each}
      <button class="add-page" aria-label="Add a page" onclick={addPage}><Icon name="plus" size={18} /></button>
    </div>

    {#if page.id !== 'main'}
      <div class="page-row">
        <label for="page-name">Page name</label>
        <input
          id="page-name"
          value={page.label}
          maxlength="8"
          oninput={(e) => (editedPage().label = e.currentTarget.value)}
        />
        <button class="text-btn danger" onclick={removePage}>Delete page</button>
      </div>
    {/if}

    <div class="grid" role="grid" aria-label="Keys of the page">
      {#each page.keys as id, i (i)}
        <button
          class="slot"
          class:selected={slot === i}
          class:target={mode === 'swap' && slot !== i}
          aria-label="Place {i + 1}: {keyOf(id)?.aria ?? 'empty'}"
          onclick={() => tapSlot(i)}
        >
          {@render face(keyOf(id))}
        </button>
      {/each}
    </div>

    {#if slot !== null}
      <div class="slot-actions">
        <button class:on={mode === 'pick'} onclick={() => (mode = mode === 'pick' ? 'idle' : 'pick')}>Change…</button>
        <button class:on={mode === 'swap'} onclick={() => (mode = mode === 'swap' ? 'idle' : 'swap')}>
          {mode === 'swap' ? 'Now tap another key' : 'Swap'}
        </button>
        <button onclick={() => place('')}>Clear</button>
      </div>
    {/if}

    {#if mode === 'pick'}
      <div class="picker">
        {#each catalog as group (group.label)}
          <h3>{group.label}</h3>
          <div class="choices">
            {#each group.keys as id (id)}
              <button class="choice" aria-label={keyOf(id)?.aria} onclick={() => place(id)}>{@render face(keyOf(id))}</button>
            {/each}
          </div>
        {/each}
        {#if keyLayout.custom.length}
          <h3>Your keys</h3>
          <div class="choices">
            {#each keyLayout.custom as c (c.id)}
              <button class="choice" aria-label={custom[c.id].aria} onclick={() => place(c.id)}>{@render face(custom[c.id])}</button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <section class="new-key">
      <h3>Make a key</h3>
      <label for="key-label">Label <span class="muted">(optional; the formula itself otherwise)</span></label>
      <input id="key-label" bind:value={newLabel} maxlength="10" placeholder="e.g. KE" />
      <span class="field-label">What the key types</span>
      <div class="formula-row">
        <MathLine
          bind:this={formulaField}
          latex={newFormula}
          label="Formula of the new key"
          onchange={(l) => (newFormula = l)}
          onfocus={(f) => (typing = f)}
        />
        <button
          class="text-btn"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => formulaField?.insert('\\placeholder{}')}
          title="A box to fill in">+ □</button
        >
      </div>
      {#if typing}
        <div class="keypad">
          <Keypad
            {onkey}
            onpage={(p) => (keyPage = p)}
            page={keyPage}
            decimal={settings.decimal}
            angle={settings.angle}
            {inv}
            wide={false}
            compact
          />
          <button class="text-btn" onmousedown={(e) => e.preventDefault()} onclick={() => (typing = null)}>Hide keys</button>
        </div>
      {/if}
      <p class="hint">For example ½mv²: put □ boxes where the numbers go.</p>
      <button class="primary" onclick={addCustom} disabled={!newFormula.trim()}>
        {slot !== null ? 'Make the key and put it here' : 'Make the key'}
      </button>

      {#if keyLayout.custom.length}
        <ul class="custom-list">
          {#each keyLayout.custom as c (c.id)}
            <li>
              <span class="custom-face">{@render face(custom[c.id])}</span>
              <span class="custom-formula">{@html latexMarkup(c.formula.replace(/\\placeholder\{[^}]*\}/g, '\\square'))}</span>
              <button class="icon-btn" aria-label="Delete this key" onclick={() => deleteCustom(c.id)}><Icon name="trash" size={18} /></button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <footer>
      <button class="text-btn" onclick={reset}>Default layout</button>
      <button class="text-btn" onclick={copyLayout}>Copy layout</button>
      <button class="text-btn" onclick={pasteLayout}>Paste layout</button>
    </footer>
  </div>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 16px));
    max-height: calc(100dvh - 16px);
    padding: 0;
    border: 0;
    border-radius: 24px;
    background: var(--surface);
    color: var(--text);
  }

  dialog::backdrop {
    background: var(--scrim);
  }

  .sheet {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px 16px 20px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }

  h3 {
    margin: 8px 0 6px;
    font-size: 14px;
    font-weight: 600;
    color: var(--muted);
  }

  .hint {
    margin: -6px 0 0;
    font-size: 14px;
    color: var(--muted);
  }

  .muted {
    color: var(--muted);
    font-weight: 400;
  }

  .done {
    min-height: 40px;
    padding: 0 14px;
    border-radius: 12px;
    font-weight: 600;
    color: var(--accent-text);
  }

  .tabs {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tabs button {
    flex: none;
    min-height: 38px;
    padding: 0 12px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    color: var(--muted);
    background: var(--key-fn);
  }

  .tabs button[aria-selected='true'] {
    background: var(--text);
    color: var(--bg);
  }

  .tabs .add-page {
    display: grid;
    place-items: center;
    width: 38px;
    padding: 0;
  }

  .page-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }

  input {
    min-height: 40px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--key);
    font-size: 16px;
  }

  .page-row input {
    width: 110px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    grid-auto-rows: 52px;
    gap: 6px;
  }

  .slot,
  .choice {
    display: grid;
    place-items: center;
    min-width: 0;
    overflow: hidden;
    border-radius: 12px;
    background: var(--key);
    border: 2px solid transparent;
    font-size: 16px;
  }

  .slot.selected {
    border-color: var(--key-eq);
  }

  .slot.target {
    border-style: dashed;
    border-color: var(--border);
  }

  .empty {
    font-size: 11px;
    color: var(--muted);
  }

  .formula {
    font-size: 15px;
    line-height: 1;
    pointer-events: none;
  }

  .slot-actions {
    display: flex;
    gap: 6px;
  }

  .slot-actions button {
    flex: 1;
    min-height: 40px;
    border-radius: 12px;
    background: var(--key-fn);
    font-size: 14px;
    font-weight: 500;
  }

  .slot-actions button.on {
    background: var(--key-eq);
    color: var(--key-eq-text);
  }

  .picker {
    max-height: 40dvh;
    overflow-y: auto;
    padding: 4px 8px 8px;
    border-radius: 16px;
    background: var(--bg);
  }

  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
    grid-auto-rows: 46px;
    gap: 6px;
  }

  .new-key {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    font-size: 14px;
  }

  .new-key h3 {
    margin-top: 0;
  }

  .field-label {
    font-size: 14px;
  }

  .formula-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--key);
  }

  .keypad {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin: 0 -16px;
  }

  .keypad :global(.pad) {
    align-self: stretch;
  }

  .keypad .text-btn {
    margin-right: 16px;
  }

  .text-btn {
    min-height: 40px;
    padding: 0 12px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    background: var(--key-fn);
  }

  .text-btn.danger {
    color: var(--error);
    background: transparent;
  }

  .primary {
    min-height: 44px;
    border-radius: 12px;
    background: var(--key-eq);
    color: var(--key-eq-text);
    font-weight: 600;
  }

  .custom-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .custom-list li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
  }

  .custom-face {
    min-width: 56px;
    text-align: center;
    font-weight: 600;
  }

  .custom-formula {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    color: var(--muted);
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }
</style>
