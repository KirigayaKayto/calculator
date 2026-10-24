<script lang="ts">
  import Icon from './Icon.svelte'
  import { latexMarkup } from '../lib/markup'
  import { KEYS, PAGES, customKey, type Key } from './keys'
  import { keyLayout } from '../lib/state.svelte'
  import type { DecimalMark } from '../engine/input'
  import type { Angle } from '../engine/math'

  interface Props {
    /** A key was pressed on the given page; `sticky`: the page stays open after it (letters). */
    onkey: (key: Key, page: string, sticky: boolean) => void
    onpage: (page: string) => void
    page: string
    decimal: DecimalMark
    angle: Angle
    inv: boolean
    /** Wide screen: the 123 page always on the right, another page on the left. */
    wide: boolean
    /** Lower keys, when the keypad shares the screen with a list (the graph). */
    compact?: boolean
  }

  let { onkey, onpage, page, decimal, angle, inv, wide, compact = false }: Props = $props()

  // the person's own layout (Settings → Customize keys), or the default one
  const pages = $derived(keyLayout.pages ?? PAGES)
  const custom = $derived(Object.fromEntries(keyLayout.custom.map((c) => [c.id, customKey(c.id, c.label, c.formula)])))

  /** A key as shown right now: its INV variant, the decimal mark, the angle unit. Null for an empty slot. */
  function resolve(id: string): Key | null {
    const key = KEYS[id] ?? custom[id]
    if (!key) return null
    if (inv && key.inv) return { ...key, ...key.inv }
    if (id === 'decimal') return { ...key, label: decimal, aria: decimal === ',' ? 'Decimal comma' : 'Decimal point' }
    if (id === 'angle') {
      return {
        ...key,
        label: angle === 'deg' ? 'DEG' : 'RAD',
        aria: angle === 'deg' ? 'Degrees, switch to radians' : 'Radians, switch to degrees',
      }
    }
    return key
  }

  // a page missing from a saved layout (one added in a later version) comes from the defaults
  const pageById = (id: string) => pages.find((p) => p.id === id) ?? PAGES.find((p) => p.id === id) ?? pages[0]
  const main = $derived(pageById('main'))
  const sidePages = $derived(pages.filter((p) => p.id !== 'main' && !p.hidden))
  const shown = $derived(wide ? (page === 'main' ? (sidePages[0] ?? main) : pageById(page)) : pageById(page))
  const tabs = $derived((wide ? sidePages : pages).filter((p) => !p.hidden))
  /** The tab to light up: a hidden page (Greek) belongs to the one that opens it (abc). */
  const activeTab = $derived(shown.hidden ? 'abc' : shown.id)

  function press(key: Key, pageId: string) {
    if (key.page) return onpage(key.page)
    onkey(key, pageId, !!pageById(pageId).sticky)
  }

  // keep the cursor in the formula: buttons must not take focus on mouse/touch
  function keepFocus(e: MouseEvent) {
    e.preventDefault()
  }
</script>

{#snippet button(id: string, pageId: string)}
  {@const key = resolve(id)}
  {#if key}
    <button
      class="key {key.kind}"
      class:pressed={(id === 'inv' || id === 'shift') && inv}
      aria-label={key.aria}
      aria-pressed={id === 'inv' || id === 'shift' ? inv : undefined}
      onmousedown={keepFocus}
      onclick={() => press(key, pageId)}
    >
      {#if key.icon}
        <Icon name={key.icon} size={24} />
      {:else if key.labelLatex}
        <span class="formula" aria-hidden="true">{@html latexMarkup(key.labelLatex)}</span>
      {:else}
        {key.label}
      {/if}
    </button>
  {:else}
    <span class="gap" aria-hidden="true"></span>
  {/if}
{/snippet}

<div class="pad" class:wide class:compact>
  <div class="bar">
    <button class="nav" aria-label="Move cursor left" onmousedown={keepFocus} onclick={() => onkey(KEYS.left, shown.id, true)}>
      <Icon name="chevron-left" size={22} />
    </button>
    <div class="tabs" role="tablist" aria-label="Key pages">
      {#each tabs as p (p.id)}
        <button
          role="tab"
          aria-selected={activeTab === p.id}
          onmousedown={keepFocus}
          onclick={() => onpage(p.id)}
        >
          {p.label}
        </button>
      {/each}
    </div>
    <button class="nav" aria-label="Move cursor right" onmousedown={keepFocus} onclick={() => onkey(KEYS.right, shown.id, true)}>
      <Icon name="chevron-right" size={22} />
    </button>
  </div>

  <div class="grids">
    <div class="grid" role="group" aria-label={shown.label} style:--cols={shown.cols ?? 5}>
      {#each shown.keys as id, i (i)}
        {@render button(id, shown.id)}
      {/each}
    </div>
    {#if wide}
      <div class="grid" role="group" aria-label={main.label} style:--cols={main.cols ?? 5}>
        {#each main.keys as id, i (i)}
          {@render button(id, main.id)}
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .pad {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 12px 12px;
    --row: clamp(48px, 8.4dvh, 70px);
  }

  .pad.wide {
    padding: 10px 16px 16px;
    --row: clamp(48px, 8.6dvh, 68px);
  }

  .pad.compact {
    --row: clamp(38px, 5.6dvh, 54px);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nav {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 40px;
    border-radius: 12px;
    color: var(--text);
    background: var(--key-fn);
  }

  .nav:active {
    background: var(--key-active);
  }

  .tabs {
    flex: 1;
    display: flex;
    justify-content: center;
    gap: 2px;
    min-width: 0;
  }

  /* up to five pages share the bar evenly, even on a small phone */
  .tabs button {
    flex: 1 1 0;
    max-width: 96px;
    min-width: 0;
    min-height: 40px;
    padding: 0 4px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tabs button[aria-selected='true'] {
    background: var(--text);
    color: var(--bg);
  }

  .grids {
    display: grid;
    gap: 12px;
  }

  .wide .grids {
    grid-template-columns: 1fr 1fr;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols, 5), 1fr);
    grid-auto-rows: var(--row);
    gap: 6px;
  }

  /* phone on its side: five rows must fit under the display */
  @media (max-height: 520px) {
    .pad,
    .pad.wide {
      padding: 4px 12px 6px;
      gap: 4px;
      --row: clamp(30px, calc((100dvh - 230px) / 5), 56px);
    }
    .nav,
    .tabs button {
      height: 32px;
      min-height: 32px;
    }
    .grid {
      gap: 4px;
    }
  }

  .key {
    display: grid;
    place-items: center;
    min-width: 0;
    overflow: hidden;
    border-radius: var(--radius);
    font-size: 24px;
    font-variant-numeric: tabular-nums;
    background: var(--key);
    color: var(--text);
    box-shadow: var(--shadow);
    transition:
      background-color var(--fast),
      filter var(--fast);
  }

  .key:hover {
    filter: brightness(0.97);
  }

  .key:active {
    background: var(--key-active);
  }

  .key.fn,
  .key.sci {
    background: var(--key-fn);
    font-size: 19px;
  }

  .key.sci {
    font-size: 17px;
  }

  .key.op {
    background: var(--key-op);
    font-size: 28px;
  }

  .key.eq {
    background: var(--key-eq);
    color: var(--key-eq-text);
    font-size: 30px;
  }

  .key.eq:active {
    filter: brightness(0.9);
  }

  .key.pressed {
    background: var(--key-op);
    color: var(--accent-text);
    font-weight: 700;
  }

  @media (max-height: 520px) {
    .key {
      font-size: 19px;
    }
    .key.op,
    .key.eq {
      font-size: 22px;
    }
  }

  /* formulas on the keys: small enough for the empty boxes to fit */
  .formula {
    font-size: 17px;
    line-height: 1;
    pointer-events: none;
  }

  /* the empty boxes ("put a number here") are drawn lighter than the symbols */
  .formula :global(.ML__ams) {
    color: var(--muted);
  }
</style>
