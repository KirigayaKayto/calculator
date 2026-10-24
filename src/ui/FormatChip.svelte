<script lang="ts">
  import { settings } from '../lib/state.svelte'
  import type { FormatMode } from '../engine/format'

  let { onchange }: { onchange?: () => void } = $props()

  let open = $state(false)
  let root = $state<HTMLElement>()

  const MODES: { id: FormatMode; label: string; hint: string }[] = [
    { id: 'auto', label: 'Auto', hint: 'At most this many significant digits' },
    { id: 'fix', label: 'Fix', hint: 'Decimal places' },
    { id: 'sci', label: 'Sci', hint: 'Significant figures, scientific notation' },
    { id: 'eng', label: 'Eng', hint: 'Significant figures, exponent a multiple of 3' },
    { id: 'sig', label: 'Sig', hint: 'Significant figures' },
    {
      id: 'lab',
      label: 'Lab',
      hint: 'Significant figures by the lab rules, from the numbers you typed. Whole numbers are exact; write 120. for a measured one.',
    },
  ]

  const LIMITS: Record<FormatMode, [number, number]> = {
    auto: [4, 32],
    fix: [0, 12],
    sci: [1, 20],
    eng: [1, 20],
    sig: [1, 20],
    lab: [12, 12],
  }

  const digits = $derived(settings.formatDigits[settings.format])
  const mode = $derived(MODES.find((m) => m.id === settings.format) ?? MODES[0])
  const label = $derived(
    settings.format === 'auto' || settings.format === 'lab'
      ? settings.format.toUpperCase()
      : `${settings.format.toUpperCase()} ${digits}`,
  )

  function setMode(id: FormatMode) {
    settings.format = id
    onchange?.()
  }

  function step(delta: number) {
    const [lo, hi] = LIMITS[settings.format]
    settings.formatDigits[settings.format] = Math.min(hi, Math.max(lo, digits + delta))
    onchange?.()
  }

  // keep the cursor in the formula while choosing
  const keepFocus = (e: MouseEvent) => e.preventDefault()

  function onWindowPointer(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false
  }

  function onWindowKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.stopPropagation()
      open = false
    }
  }
</script>

<svelte:window onpointerdown={onWindowPointer} onkeydown={onWindowKey} />

<div class="wrap" bind:this={root}>
  <button
    class="chip"
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label="Number format: {label}"
    onmousedown={keepFocus}
    onclick={() => (open = !open)}
  >
    {label}
  </button>

  {#if open}
    <div class="popover" role="dialog" aria-label="Number format">
      <div class="modes" role="radiogroup" aria-label="Mode">
        {#each MODES as m (m.id)}
          <button role="radio" aria-checked={settings.format === m.id} onmousedown={keepFocus} onclick={() => setMode(m.id)}>
            {m.label}
          </button>
        {/each}
      </div>
      <div class="digits">
        <span class="hint">{mode.hint}</span>
        {#if settings.format !== 'lab'}
          <div class="stepper">
            <button aria-label="Fewer digits" onmousedown={keepFocus} onclick={() => step(-1)}>−</button>
            <output aria-live="polite">{digits}</output>
            <button aria-label="More digits" onmousedown={keepFocus} onclick={() => step(1)}>+</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    flex: none;
  }

  .chip {
    min-height: 32px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--muted);
  }

  .chip:hover,
  .chip[aria-expanded='true'] {
    background: var(--key-fn);
    color: var(--text);
  }

  /* opens over the keys, so the expression and the changing answer stay visible */
  .popover {
    position: absolute;
    left: 0;
    top: calc(100% + 8px);
    z-index: 10;
    width: min(320px, calc(100vw - 48px));
    padding: 12px;
    border-radius: 16px;
    background: var(--key);
    border: 1px solid var(--border);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .modes {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 12px;
    background: var(--key-fn);
  }

  .modes button {
    flex: 1;
    min-height: 36px;
    border-radius: 9px;
    font-size: 14px;
    font-weight: 500;
    color: var(--muted);
  }

  .modes button[aria-checked='true'] {
    background: var(--key);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .digits {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: none;
  }

  .stepper button {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--key-fn);
    font-size: 20px;
  }

  output {
    min-width: 28px;
    text-align: center;
    font-size: 17px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
</style>
