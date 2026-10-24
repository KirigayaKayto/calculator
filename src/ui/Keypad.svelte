<script lang="ts">
  import Icon from './Icon.svelte'
  import { latexMarkup } from '../lib/markup'
  import { KEYS, PAGES, type Key } from './keys'
  import type { DecimalMark } from '../engine/input'
  import type { Angle } from '../engine/math'

  interface Props {
    /** A key was pressed on the given page. */
    onkey: (key: Key, page: string) => void
    onpage: (page: string) => void
    page: string
    decimal: DecimalMark
    angle: Angle
    inv: boolean
    /** Wide screen: the 123 page always on the right, another page on the left. */
    wide: boolean
  }

  let { onkey, onpage, page, decimal, angle, inv, wide }: Props = $props()

  /** A key as shown right now: its INV variant, the decimal mark, the angle unit. */
  function resolve(id: string): Key {
    const key = KEYS[id]
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

  const pageById = (id: string) => PAGES.find((p) => p.id === id) ?? PAGES[0]
  const main = pageById('main')
  const shown = $derived(wide ? pageById(page === 'main' ? 'func' : page) : pageById(page))
  const tabs = $derived(wide ? PAGES.filter((p) => p.id !== 'main') : PAGES)

  // keep the cursor in the formula: buttons must not take focus on mouse/touch
  function keepFocus(e: MouseEvent) {
    e.preventDefault()
  }
</script>

{#snippet button(id: string, pageId: string)}
  {@const key = resolve(id)}
  <button
    class="key {key.kind}"
    class:pressed={id === 'inv' && inv}
    aria-label={key.aria}
    aria-pressed={id === 'inv' ? inv : undefined}
    onmousedown={keepFocus}
    onclick={() => onkey(key, pageId)}
  >
    {#if key.icon}
      <Icon name={key.icon} size={24} />
    {:else if key.labelLatex}
      <span class="formula" aria-hidden="true">{@html latexMarkup(key.labelLatex)}</span>
    {:else}
      {key.label}
    {/if}
  </button>
{/snippet}

<div class="pad" class:wide>
  <div class="bar">
    <button class="nav" aria-label="Move cursor left" onmousedown={keepFocus} onclick={() => onkey(KEYS.left, shown.id)}>
      <Icon name="chevron-left" size={22} />
    </button>
    <div class="tabs" role="tablist" aria-label="Key pages">
      {#each tabs as p (p.id)}
        <button
          role="tab"
          aria-selected={shown.id === p.id}
          onmousedown={keepFocus}
          onclick={() => onpage(p.id)}
        >
          {p.label}
        </button>
      {/each}
    </div>
    <button class="nav" aria-label="Move cursor right" onmousedown={keepFocus} onclick={() => onkey(KEYS.right, shown.id)}>
      <Icon name="chevron-right" size={22} />
    </button>
  </div>

  <div class="grids">
    <div class="grid" role="group" aria-label={shown.label}>
      {#each shown.keys as id (id)}
        {@render button(id, shown.id)}
      {/each}
    </div>
    {#if wide}
      <div class="grid" role="group" aria-label={main.label}>
        {#each main.keys as id (id)}
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

  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nav {
    flex: none;
    display: grid;
    place-items: center;
    width: 52px;
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
    gap: 4px;
    min-width: 0;
  }

  .tabs button {
    min-width: 64px;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    color: var(--muted);
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
    grid-template-columns: repeat(5, 1fr);
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
