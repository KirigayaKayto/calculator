<script lang="ts">
  import Icon from './Icon.svelte'
  import { latexMarkup } from '../lib/markup'
  import { KEYS, PAGES, customKey, type Key, type Page } from './keys'
  import { keyLayout, haptic } from '../lib/state.svelte'
  import { slidingPill } from './pill'
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
  const index = $derived(Math.max(0, tabs.findIndex((p) => p.id === activeTab)))
  /** The page drawn in a tab's slot: a hidden page (Greek) takes the slot of the page that opens it. */
  const inSlot = (p: Page) => (shown.hidden && p.id === activeTab ? shown : p)

  function press(key: Key, pageId: string) {
    if (key.page) return onpage(key.page)
    onkey(key, pageId, !!pageById(pageId).sticky)
  }

  // keep the cursor in the formula: buttons must not take focus on mouse/touch
  function keepFocus(e: MouseEvent) {
    e.preventDefault()
  }

  // ---- touch: the key reacts the moment it is touched, and ⌫ repeats while it is held ----

  let down = $state<string | null>(null)
  const REPEATS = new Set(['back', 'left', 'right'])
  let repeatTimer: ReturnType<typeof setTimeout> | undefined
  let repeatInterval: ReturnType<typeof setInterval> | undefined
  /** The hold already fired the key: the click on release must not fire it again. */
  let repeated = false

  function pointerDown(e: PointerEvent, key: Key, pageId: string, slot: string) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    down = slot
    haptic()
    repeated = false
    if (!REPEATS.has(key.id)) return
    repeatTimer = setTimeout(() => {
      let fired = 0
      const tick = () => {
        repeated = true
        press(key, pageId)
        haptic()
        // faster after a second and a half
        if (++fired === 20) {
          clearInterval(repeatInterval)
          repeatInterval = setInterval(tick, 40)
        }
      }
      tick()
      repeatInterval = setInterval(tick, 70)
    }, 400)
  }

  function pointerUp() {
    down = null
    clearTimeout(repeatTimer)
    clearInterval(repeatInterval)
    repeatTimer = repeatInterval = undefined
  }

  function click(key: Key, pageId: string) {
    if (repeated) {
      repeated = false
      return
    }
    press(key, pageId)
  }

  // ---- pages side by side: swipe between them, or tap a tab ----

  let pager = $state<HTMLDivElement>()
  let animating = false
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let mounted = false
  const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

  /** Slide to page `i` with a short ease-out (native smooth scrolling is slower than a tap deserves). */
  function slideTo(i: number, instant = false) {
    const el = pager
    if (!el) return
    const target = i * el.clientWidth
    const from = el.scrollLeft
    if (Math.abs(target - from) < 1) return
    animating = true
    // snapping would fight the animation; it is restored on the snap point
    el.style.scrollSnapType = 'none'
    const done = () => {
      el.scrollLeft = target
      el.style.scrollSnapType = ''
      requestAnimationFrame(() => (animating = false))
    }
    if (instant || reducedMotion?.matches) return done()
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 200)
      el.scrollLeft = from + (target - from) * (1 - (1 - t) ** 3)
      if (t < 1) requestAnimationFrame(step)
      else done()
    }
    requestAnimationFrame(step)
  }

  $effect(() => {
    void tabs.length
    const i = index
    slideTo(i, !mounted)
    mounted = true
  })

  $effect(() => {
    if (!pager) return
    const observer = new ResizeObserver(() => slideTo(index, true))
    observer.observe(pager)
    return () => observer.disconnect()
  })

  /** The finger has settled on a page: make it the current one. */
  function settle() {
    const el = pager
    if (!el || animating || !el.clientWidth) return
    const p = tabs[Math.round(el.scrollLeft / el.clientWidth)]
    if (p && p.id !== activeTab) onpage(p.id)
  }

  // scrollend where the browser has it; a quiet moment elsewhere
  function onScroll() {
    if (animating) return
    clearTimeout(settleTimer)
    settleTimer = setTimeout(settle, 120)
  }

  function onScrollEnd() {
    clearTimeout(settleTimer)
    settle()
  }
</script>

{#snippet button(id: string, pageId: string)}
  {@const key = resolve(id)}
  {#if key}
    {@const slot = `${pageId}:${id}`}
    <button
      class="key {key.kind}"
      class:pressed={(id === 'inv' || id === 'shift') && inv}
      class:down={down === slot}
      aria-label={key.aria}
      aria-pressed={id === 'inv' || id === 'shift' ? inv : undefined}
      onmousedown={keepFocus}
      onpointerdown={(e) => pointerDown(e, key, pageId, slot)}
      onpointerup={pointerUp}
      onpointercancel={pointerUp}
      onpointerleave={pointerUp}
      onclick={() => click(key, pageId)}
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

{#snippet nav(key: Key, icon: 'chevron-left' | 'chevron-right')}
  <button
    class="nav"
    class:down={down === `nav:${key.id}`}
    aria-label={key.aria}
    onmousedown={keepFocus}
    onpointerdown={(e) => pointerDown(e, key, shown.id, `nav:${key.id}`)}
    onpointerup={pointerUp}
    onpointercancel={pointerUp}
    onpointerleave={pointerUp}
    onclick={() => click(key, shown.id)}
  >
    <Icon name={icon} size={22} />
  </button>
{/snippet}

<div class="pad" class:wide class:compact>
  <div class="bar">
    {@render nav(KEYS.left, 'chevron-left')}
    <div class="tabs" role="tablist" aria-label="Key pages" use:slidingPill={{ key: activeTab, selector: '[aria-selected="true"]' }}>
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
    {@render nav(KEYS.right, 'chevron-right')}
  </div>

  <div class="grids">
    <div class="pager" bind:this={pager} onscroll={onScroll} onscrollend={onScrollEnd}>
      {#each tabs as p, i (p.id)}
        {@const sp = inSlot(p)}
        <div class="grid" role="group" aria-label={sp.label} style:--cols={sp.cols ?? 5} inert={i !== index}>
          {#each sp.keys as id, j (j)}
            {@render button(id, sp.id)}
          {/each}
        </div>
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
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
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
    transition:
      background-color 180ms,
      transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .nav.down,
  .nav:active {
    background: var(--key-active);
    transform: scale(0.94);
    transition: none;
  }

  .tabs {
    position: relative;
    flex: 1;
    display: flex;
    justify-content: center;
    gap: 2px;
    min-width: 0;
    --pill-bg: var(--text);
    --pill-radius: 12px;
  }

  /* up to five pages share the bar evenly, even on a small phone */
  .tabs button {
    position: relative;
    z-index: 1;
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
    transition: color 180ms;
  }

  .tabs button[aria-selected='true'] {
    color: var(--bg);
  }

  .grids {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .wide .grids {
    grid-template-columns: 1fr 1fr;
  }

  /* the pages lie side by side; a swipe moves to the next one and settles on it */
  .pager {
    display: flex;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }

  .pager::-webkit-scrollbar {
    display: none;
  }

  .pager > .grid {
    flex: 0 0 100%;
    scroll-snap-align: start;
    scroll-snap-stop: always;
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
      background-color 180ms,
      filter 180ms,
      transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  @media (hover: hover) {
    .key:hover {
      filter: brightness(0.97);
    }
  }

  /* pressed: instantly down, then springs back */
  .key.down,
  .key:active {
    background: var(--key-active);
    transform: scale(0.95);
    transition: none;
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

  .key.eq.down,
  .key.eq:active {
    background: var(--key-eq);
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
