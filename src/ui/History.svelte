<script lang="ts">
  import { tick } from 'svelte'
  import Icon from './Icon.svelte'
  import { history } from '../lib/state.svelte'

  interface Props {
    /** Called with an expression or a result to put into the calculator. */
    onpick: (text: string) => void
    /** Inside the display on phones: no heading, newest entry right above the expression. */
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

  // the list shrinks when the scientific keys open: keep the newest entries in view
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

<section class="history" class:compact aria-label="История вычислений">
  {#if !compact}
    <header>
      <h2>История</h2>
      {#if history.items.length}
        <button class="clear" class:confirming onclick={clear}>
          <Icon name="trash" size={18} />
          {confirming ? 'Точно очистить?' : 'Очистить'}
        </button>
      {/if}
    </header>
  {/if}

  <ol bind:this={list}>
    {#if compact && history.items.length}
      <li class="clear-row">
        <button class="clear" class:confirming onclick={clear}>
          <Icon name="trash" size={16} />
          {confirming ? 'Точно очистить историю?' : 'Очистить историю'}
        </button>
      </li>
    {/if}
    {#each history.items as item (item.at)}
      <li>
        <button class="expr num" title="Вставить выражение" onclick={() => onpick(item.expr)}>{item.expr}</button>
        <button class="result num" title="Вставить результат" onclick={() => onpick(item.plain)}>= {item.text}</button>
      </li>
    {/each}
  </ol>

  {#if !compact && !history.items.length}
    <p class="empty">Здесь появятся ваши вычисления. Нажмите на запись, чтобы вставить её.</p>
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

  li {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    padding: 6px 0;
  }

  .compact ol {
    scrollbar-width: none;
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
  }

  li button:hover {
    background: var(--key-fn);
  }

  .expr {
    color: var(--muted);
    font-size: 16px;
  }

  .result {
    font-size: 20px;
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
