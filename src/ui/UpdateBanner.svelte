<script lang="ts">
  import { fly } from 'svelte/transition'
  import { update, applyUpdate, dismissUpdate } from '../lib/update.svelte'

  const visible = $derived((update.status === 'available' && !update.dismissed) || update.status === 'updating')
</script>

{#if visible}
  <div class="banner" role="status" aria-live="polite" transition:fly={{ y: -16, duration: 260 }}>
    <img class="app-icon" src="icons/icon.svg" alt="" width="36" height="36" />
    <div class="text">
      <strong>{update.status === 'updating' ? 'Updating…' : 'Update available'}</strong>
      <span class="detail">
        {#if update.next}
          Version {update.next.version} · {update.next.title}
        {:else}
          A new version of the calculator is ready.
        {/if}
      </span>
    </div>
    {#if update.status === 'updating'}
      <span class="spinner" aria-hidden="true"></span>
    {:else}
      <button class="later" onclick={dismissUpdate}>Later</button>
      <button class="go" onclick={applyUpdate}>Update</button>
    {/if}
  </div>
{/if}

<style>
  .banner {
    position: fixed;
    z-index: 30;
    top: calc(env(safe-area-inset-top) + 64px);
    left: 12px;
    right: 12px;
    max-width: 480px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 10px 10px 12px;
    border-radius: 18px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.18);
  }

  .app-icon {
    flex: none;
    border-radius: 9px;
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  strong {
    font-size: 15px;
    font-weight: 600;
  }

  .detail {
    font-size: 13px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .later,
  .go {
    flex: none;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 600;
  }

  .later {
    color: var(--muted);
  }

  .later:active {
    background: var(--key-fn);
  }

  .go {
    background: var(--key-eq);
    color: var(--key-eq-text);
  }

  .go:active {
    filter: brightness(0.9);
  }

  .spinner {
    flex: none;
    width: 20px;
    height: 20px;
    margin-right: 8px;
    border-radius: 50%;
    border: 2.5px solid var(--key-op);
    border-top-color: var(--accent-text);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
