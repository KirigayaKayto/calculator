<script lang="ts">
  import Converter from './Converter.svelte'
  import Constants from './Constants.svelte'
  import { converter } from '../lib/state.svelte'

  const tool = $derived(converter.tool ?? 'units')
</script>

<div class="tools">
  <div class="switch" role="tablist" aria-label="Tool">
    <button role="tab" aria-selected={tool === 'units'} onclick={() => (converter.tool = 'units')}>Units</button>
    <button role="tab" aria-selected={tool === 'constants'} onclick={() => (converter.tool = 'constants')}>Constants</button>
  </div>
  {#if tool === 'units'}
    <Converter />
  {:else}
    <Constants />
  {/if}
</div>

<style>
  .tools {
    height: 100%;
    overflow-y: auto;
    padding: 8px 12px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 720px;
    margin: 0 auto;
  }

  .switch {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 14px;
    background: var(--key-fn);
    flex: none;
  }

  .switch button {
    flex: 1;
    min-height: 40px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 500;
    color: var(--muted);
  }

  .switch button[aria-selected='true'] {
    background: var(--key);
    color: var(--text);
    box-shadow: var(--shadow);
  }
</style>
