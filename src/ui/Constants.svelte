<script lang="ts">
  import { CONSTANTS, type Constant } from '../engine/constants'
  import { latexMarkup, numberLatex } from '../lib/markup'
  import { ui, pending, settings } from '../lib/state.svelte'

  let query = $state('')

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase()
    return q ? CONSTANTS.filter((c) => `${c.name} ${c.symbol} ${c.unit}`.toLowerCase().includes(q)) : CONSTANTS
  })

  const valueLatex = (c: Constant) => numberLatex(c.unit ? `${c.value} ${c.unit}` : c.value, settings.decimal, true)

  function insert(c: Constant) {
    pending.insert = `\\${c.id}`
    ui.tab = 'calc'
  }
</script>

<div class="constants">
  <label class="visually-hidden" for="constant-search">Search constants</label>
  <input id="constant-search" type="search" placeholder="Search: electron, Planck, gas…" bind:value={query} autocomplete="off" />

  <ul>
    {#each shown as c (c.id)}
      <li>
        <span class="symbol" aria-hidden="true">{@html latexMarkup(c.symbol)}</span>
        <div class="info">
          <span class="name">{c.name}{#if c.exact}<span class="tag">exact</span>{/if}</span>
          <span class="value">{@html latexMarkup(valueLatex(c))}</span>
        </div>
        <button class="insert" onclick={() => insert(c)} aria-label="Insert {c.name}">Insert</button>
      </li>
    {:else}
      <li class="none">Nothing found</li>
    {/each}
  </ul>

  <p class="source">CODATA 2022 recommended values. “Exact” values are fixed by the definition of the SI units.</p>
</div>

<style>
  .constants {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  input {
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--key);
    font-size: 16px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-radius: 20px;
    background: var(--surface);
    overflow: hidden;
  }

  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px 10px 16px;
    border-bottom: 1px solid var(--border);
  }

  li:last-child {
    border-bottom: 0;
  }

  .symbol {
    flex: none;
    width: 44px;
    text-align: center;
    font-size: 22px;
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .name {
    font-size: 15px;
    font-weight: 500;
  }

  .tag {
    margin-left: 8px;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--key-fn);
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    vertical-align: middle;
  }

  .value {
    font-size: 16px;
    color: var(--muted);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .insert {
    flex: none;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 12px;
    background: var(--key-fn);
    font-size: 14px;
    font-weight: 600;
  }

  .insert:hover {
    background: var(--key-op);
  }

  .none {
    color: var(--muted);
  }

  .source {
    margin: 0 4px;
    font-size: 13px;
    color: var(--muted);
  }
</style>
