<script lang="ts">
  import { tick } from 'svelte'
  import Icon from './Icon.svelte'
  import { history, settings, shownExact, type HistoryEntry } from '../lib/state.svelte'
  import { latexMarkup, numberLatex } from '../lib/markup'

  interface Props {
    /** Called with an entry and the part to put into the calculator. */
    onpick: (entry: HistoryEntry, part: 'expr' | 'result') => void
    /** Inside the display on phones: no heading, newest entry right above the formula. */
    compact?: boolean
  }

  let { onpick, compact = false }: Props = $props()

  let list = $state<HTMLElement>()
  let confirming = $state(false)
  let confirmTimer: ReturnType<typeof setTimeout>

  function scrollToNewest() {
    list?.scrollTo({ top: list.scrollHeight })
  }

  $effect(() => {
    history.items.length
    tick().then(scrollToNewest)
  })

  // the list can shrink when the layout changes: keep the newest entries in view
  $effect(() => {
    if (!list) return
    const observer = new ResizeObserver(scrollToNewest)
    observer.observe(list)
    return () => observer.disconnect()
  })

  function clear() {
    if (!confirming) {
      confirming = true
      clearTimeout(confirmTimer)
      confirmTimer = setTimeout(() => (confirming = false), 3000)
      return
    }
    history.items.length = 0
    confirming = false
  }
</script>

<section class="history" class:compact aria-label="History">
  {#if !compact}
    <header>
      <h2>History</h2>
      {#if history.items.length}
        <button class="clear" class:confirming onclick={clear}>
          <Icon name="trash" size={18} />
          {confirming ? 'Clear all?' : 'Clear'}
        </button>
      {/if}
    </header>
  {/if}

  <ol bind:this={list}>
    {#if compact && history.items.length}
      <li class="clear-row">
        <button class="clear" class:confirming onclick={clear}>
          <Icon name="trash" size={16} />
          {confirming ? 'Clear the whole history?' : 'Clear history'}
        </button>
      </li>
    {/if}
    {#each history.items as item (item.at)}
      <li>
        <button class="expr" title="Insert this expression" onclick={() => onpick(item, 'expr')}>
          {#if item.latex}{@html latexMarkup(item.latex)}{:else}{item.expr}{/if}
        </button>
        <button class="result" title="Insert this answer" onclick={() => onpick(item, 'result')}>
          {@html latexMarkup(
            (item.solved ? '' : '=') + (shownExact(item) ?? numberLatex(item.plain, settings.decimal, true)),
          )}
        </button>
      </li>
    {/each}
  </ol>

  {#if !compact && !history.items.length}
    <p class="empty">Your calculations will appear here. Tap an expression or an answer to insert it.</p>
  {/if}
</section>

<style>
  .history {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 4px 8px 12px;
  }

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    overscroll-behavior: contain;
  }

  .compact ol {
    scrollbar-width: none;
  }

  li {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    padding: 6px 0;
  }

  .compact li {
    padding: 2px 0;
  }

  li button {
    max-width: 100%;
    text-align: right;
    overflow-wrap: anywhere;
    border-radius: 8px;
    padding: 2px 8px;
    min-height: 32px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  li button:hover {
    background: var(--key-fn);
  }

  .expr {
    color: var(--muted);
    font-size: 18px;
  }

  .result {
    font-size: 21px;
  }

  .compact .expr {
    font-size: 16px;
  }

  .compact .result {
    font-size: 18px;
    color: var(--muted);
  }

  .clear-row {
    align-items: center;
    padding-bottom: 8px;
  }

  .clear {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 12px;
    border-radius: 10px;
    font-size: 15px;
    color: var(--muted);
  }

  .clear:hover {
    background: var(--key-fn);
  }

  .clear.confirming {
    color: var(--error);
    font-weight: 600;
  }

  .empty {
    margin: 8px 12px;
    color: var(--muted);
    font-size: 15px;
  }
</style>
