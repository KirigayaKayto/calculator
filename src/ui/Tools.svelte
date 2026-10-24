<script lang="ts">
  import Converter from './Converter.svelte'
  import Constants from './Constants.svelte'
  import Programmer from './Programmer.svelte'
  import Stats from './Stats.svelte'
  import Integers from './Integers.svelte'
  import { converter } from '../lib/state.svelte'

  const TOOLS = [
    { id: 'units', label: 'Units' },
    { id: 'constants', label: 'Constants' },
    { id: 'base', label: 'Base' },
    { id: 'stats', label: 'Stats' },
    { id: 'integers', label: 'Integers' },
  ] as const

  const tool = $derived(converter.tool ?? 'units')
</script>

<div class="tools">
  <div class="switch" role="tablist" aria-label="Tool">
    {#each TOOLS as t (t.id)}
      <button role="tab" aria-selected={tool === t.id} onclick={() => (converter.tool = t.id)}>{t.label}</button>
    {/each}
  </div>
  <!-- the programmer's keys fill the height; the other tools scroll -->
  <div class="body" class:fill={tool === 'base'}>
    {#if tool === 'units'}
      <Converter />
    {:else if tool === 'constants'}
      <Constants />
    {:else if tool === 'base'}
      <Programmer />
    {:else if tool === 'stats'}
      <Stats />
    {:else}
      <Integers />
    {/if}
  </div>
</div>

<style>
  .tools {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 12px 0;
    max-width: 720px;
    margin: 0 auto;
  }

  .switch {
    display: flex;
    gap: 2px;
    padding: 4px;
    border-radius: 14px;
    background: var(--key-fn);
    flex: none;
  }

  .switch button {
    flex: 1 1 0;
    min-width: 0;
    min-height: 40px;
    padding: 0 2px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .switch button[aria-selected='true'] {
    background: var(--key);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 24px;
  }

  .body.fill {
    display: flex;
    flex-direction: column;
    padding-bottom: 12px;
  }

  .body.fill > :global(*) {
    flex: 1;
  }
</style>
