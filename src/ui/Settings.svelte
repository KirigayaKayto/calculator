<script lang="ts">
  import { onMount } from 'svelte'
  import Icon from './Icon.svelte'
  import Segmented from './Segmented.svelte'
  import { settings, history, install } from '../lib/state.svelte'

  let { onclose, oncustomize }: { onclose: () => void; oncustomize: () => void } = $props()

  let dialog = $state<HTMLDialogElement>()
  let historyCleared = $state(false)
  const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator

  onMount(() => dialog?.showModal())

  function clearHistory() {
    history.items.length = 0
    historyCleared = true
  }

  async function installApp() {
    await install.prompt?.prompt()
    install.prompt = null
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="settings-title"
  onclose={onclose}
  onclick={(e) => e.target === dialog && dialog?.close()}
>
  <div class="sheet">
    <header>
      <h2 id="settings-title">Settings</h2>
      <button class="icon-btn" aria-label="Close" onclick={() => dialog?.close()}><Icon name="x" /></button>
    </header>

    <Segmented
      label="Theme"
      name="theme"
      bind:value={settings.theme}
      options={[
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ]}
    />

    <Segmented
      label="Angles"
      name="angle"
      bind:value={settings.angle}
      options={[
        { value: 'deg', label: 'Degrees' },
        { value: 'rad', label: 'Radians' },
      ]}
    />

    <Segmented
      label="Number format"
      name="format"
      bind:value={settings.format}
      options={[
        { value: 'auto', label: 'Auto' },
        { value: 'fix', label: 'Fix' },
        { value: 'sci', label: 'Sci' },
        { value: 'eng', label: 'Eng' },
        { value: 'sig', label: 'Sig' },
      ]}
    />
    <p class="hint">The chip next to the answer changes the format and the number of digits.</p>

    <Segmented
      label="Exact answers"
      name="exact"
      bind:value={settings.exactAnswers}
      options={[
        { value: true, label: '√2⁄2, π⁄3' },
        { value: false, label: '0.7071…' },
      ]}
    />
    <p class="hint">⇄ next to the answer always switches between the exact form and the decimal.</p>

    <Segmented
      label="Complex numbers"
      name="complex"
      bind:value={settings.complex}
      options={[
        { value: 'off', label: 'Off' },
        { value: 'rect', label: 'a + bi' },
        { value: 'polar', label: 'r∠θ' },
      ]}
    />
    <p class="hint">Off: √−1 is an error. On: i and ∠ on the Phys keys.</p>

    <Segmented
      label="Decimal mark"
      name="decimal"
      bind:value={settings.decimal}
      options={[
        { value: '.', label: 'Point 1.5' },
        { value: ',', label: 'Comma 1,5' },
      ]}
    />
    {#if settings.decimal === ','}
      <p class="hint">Function arguments are then separated by semicolons: max(3; 5).</p>
    {/if}

    <Segmented
      label="Mixed numbers"
      name="mixed"
      bind:value={settings.mixedNumbers}
      options={[
        { value: false, label: '2 · ½ = 1' },
        { value: true, label: '2½ = 2.5' },
      ]}
    />
    <p class="hint">Whether a whole number written before a fraction multiplies it or makes a mixed number.</p>

    <Segmented
      label="Function keys on a phone"
      name="autoReturn"
      bind:value={settings.autoReturn}
      options={[
        { value: true, label: 'Back to 123' },
        { value: false, label: 'Stay open' },
      ]}
    />

    {#if canVibrate}
      <Segmented
        label="Vibrate on key press"
        name="haptics"
        bind:value={settings.haptics}
        options={[
          { value: true, label: 'On' },
          { value: false, label: 'Off' },
        ]}
      />
    {/if}

    <div class="actions">
      <button class="action" onclick={oncustomize}>
        <Icon name="keyboard" size={18} /> Customize keys…
      </button>
      {#if install.prompt}
        <button class="action primary" onclick={installApp}>
          <Icon name="download" size={18} /> Install on this device
        </button>
      {/if}
      <button class="action" onclick={clearHistory} disabled={!history.items.length}>
        <Icon name="trash" size={18} />
        {historyCleared ? 'History cleared' : 'Clear history'}
      </button>
    </div>

    <p class="about">
      No ads, no tracking. Everything stays on this device. Works offline.
    </p>
  </div>
</dialog>

<style>
  dialog {
    width: min(480px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
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
    gap: 20px;
    padding: 12px 20px 24px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-right: -8px;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }

  .hint {
    margin: -12px 0 0;
    font-size: 14px;
    color: var(--muted);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    border-radius: 14px;
    background: var(--key-fn);
    font-size: 16px;
  }

  .action.primary {
    background: var(--key-eq);
    color: var(--key-eq-text);
    font-weight: 600;
  }

  .about {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
  }
</style>
