<script lang="ts">
  import Calculator from './ui/Calculator.svelte'
  import Worksheet from './ui/Worksheet.svelte'
  import Tools from './ui/Tools.svelte'
  import Settings from './ui/Settings.svelte'
  import KeyEditor from './ui/KeyEditor.svelte'
  import Icon from './ui/Icon.svelte'
  import { ui, settings, prefersDark, toast, type Tab } from './lib/state.svelte'

  const TABS: { id: Tab; label: string }[] = [
    { id: 'calc', label: 'Calculator' },
    { id: 'graph', label: 'Graph' },
    { id: 'units', label: 'Tools' },
  ]

  // a tab saved by an older version (the notes) opens the calculator
  if (!TABS.some((t) => t.id === ui.tab)) ui.tab = 'calc'

  let settingsOpen = $state(false)
  let keysOpen = $state(false)

  const dark = $derived(settings.theme === 'dark' || (settings.theme === 'system' && prefersDark.current))

  $effect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    // colors the Android status bar and the window title bar of the installed app
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#141413' : '#eeece7')
  })

  function onTabKeydown(e: KeyboardEvent, i: number) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = TABS[(i + step + TABS.length) % TABS.length]
    ui.tab = next.id
    document.getElementById(`tab-${next.id}`)?.focus()
  }
</script>

<div class="app">
  <header class="topbar">
    <div class="tabs" role="tablist" aria-label="Mode">
      {#each TABS as tab, i (tab.id)}
        <button
          id="tab-{tab.id}"
          role="tab"
          aria-selected={ui.tab === tab.id}
          aria-controls="panel"
          tabindex={ui.tab === tab.id ? 0 : -1}
          onclick={() => (ui.tab = tab.id)}
          onkeydown={(e) => onTabKeydown(e, i)}
        >
          {tab.label}
        </button>
      {/each}
    </div>
    <button class="icon-btn" aria-label="Settings" onclick={() => (settingsOpen = true)}>
      <Icon name="settings" />
    </button>
  </header>

  <main>
    <div class="panel" id="panel" role="tabpanel" aria-labelledby="tab-{ui.tab}">
      {#if ui.tab === 'calc'}
        <Calculator />
      {:else if ui.tab === 'graph'}
        <Worksheet />
      {:else}
        <Tools />
      {/if}
    </div>
  </main>

  {#if settingsOpen}
    <Settings
      onclose={() => (settingsOpen = false)}
      oncustomize={() => {
        settingsOpen = false
        keysOpen = true
      }}
    />
  {/if}

  {#if keysOpen}
    <KeyEditor onclose={() => (keysOpen = false)} />
  {/if}

  <div class="toast" class:visible={toast.message} role="status" aria-live="polite">{toast.message}</div>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
      env(safe-area-inset-left);
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px 4px;
    max-width: 1180px;
    width: 100%;
    margin: 0 auto;
  }

  .tabs {
    flex: 1;
    max-width: 560px;
    margin-right: auto;
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 14px;
    background: var(--key-fn);
    min-width: 0;
  }

  .tabs button {
    flex: 1 1 auto;
    min-height: 40px;
    padding: 0 6px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 500;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition:
      background-color var(--fast),
      color var(--fast);
  }

  .tabs button[aria-selected='true'] {
    background: var(--key);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  main {
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 1180px;
    margin: 0 auto;
  }

  .panel {
    height: 100%;
  }

  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(24px + env(safe-area-inset-bottom));
    transform: translate(-50%, 12px);
    padding: 10px 18px;
    border-radius: 999px;
    background: var(--text);
    color: var(--bg);
    font-size: 15px;
    opacity: 0;
    pointer-events: none;
    transition:
      opacity var(--normal),
      transform var(--normal);
  }

  .toast.visible {
    opacity: 1;
    transform: translate(-50%, 0);
  }
</style>
