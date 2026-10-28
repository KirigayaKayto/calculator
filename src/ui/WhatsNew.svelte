<script lang="ts">
  import { onMount } from 'svelte'
  import { fly } from 'svelte/transition'
  import Icon, { type IconName } from './Icon.svelte'
  import { latexMarkup } from '../lib/markup'
  import { RELEASES } from '../lib/update.svelte'

  let { onclose }: { onclose: () => void } = $props()

  let dialog = $state<HTMLDialogElement>()
  const [latest, ...earlier] = RELEASES
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const ms = (n: number) => (reduced ? 0 : n)

  const dateText = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  onMount(() => dialog?.showModal())
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="whats-new-title"
  onclose={onclose}
  onclick={(e) => e.target === dialog && dialog?.close()}
>
  <div class="sheet">
    <header>
      <div>
        <p class="eyebrow">What's new</p>
        <h2 id="whats-new-title">Version {latest.version}</h2>
        <p class="date">{dateText(latest.date)}</p>
      </div>
      <button class="icon-btn" aria-label="Close" onclick={() => dialog?.close()}><Icon name="x" /></button>
    </header>

    <div class="hero" aria-hidden="true">
      <span class="from">{@html latexMarkup('\\sqrt{20}')}</span>
      <span class="to">{@html latexMarkup('=2\\sqrt{5}')}</span>
    </div>

    <ul class="highlights">
      {#each latest.highlights as h, i (h.title)}
        <li in:fly={{ y: 14, duration: ms(320), delay: ms(120 + i * 70) }}>
          <span class="badge"><Icon name={h.icon as IconName} size={20} /></span>
          <div class="body">
            <h3>{h.title}</h3>
            <p>{h.text}</p>
            {#if h.latex}
              <p class="formula">{@html latexMarkup(h.latex)}</p>
            {/if}
          </div>
        </li>
      {/each}
    </ul>

    {#if earlier.length}
      <details>
        <summary>Earlier versions</summary>
        {#each earlier as r (r.version)}
          <section class="earlier">
            <h3>Version {r.version} <span class="date">{dateText(r.date)}</span></h3>
            <ul>
              {#each r.highlights as h (h.title)}
                <li><strong>{h.title}.</strong> {h.text}</li>
              {/each}
            </ul>
          </section>
        {/each}
      </details>
    {/if}

    <button class="continue" onclick={() => dialog?.close()}>Continue</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(520px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    padding: 0;
    border: 0;
    border-radius: 24px;
    background: var(--surface);
    color: var(--text);
  }

  .sheet {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 12px 20px 20px;
  }

  @media (max-width: 600px) {
    dialog {
      width: 100%;
      max-width: none;
      max-height: 92dvh;
      margin: auto 0 0;
      border-radius: 24px 24px 0 0;
    }
    .sheet {
      padding-bottom: calc(20px + env(safe-area-inset-bottom));
    }
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-right: -8px;
  }

  .eyebrow {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent-text);
  }

  h2 {
    margin: 2px 0 0;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .date {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
  }

  /* √20 becomes 2√5, over and over */
  .hero {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    padding: 20px 16px;
    border-radius: 18px;
    background: var(--bg);
    font-size: 34px;
  }

  .to {
    padding: 2px 10px;
    border-radius: 12px;
    animation: reveal 4s ease-in-out infinite;
  }

  @keyframes reveal {
    0% {
      opacity: 0;
      transform: translateX(-10px);
      background: transparent;
    }
    14% {
      opacity: 1;
      transform: none;
      background: transparent;
    }
    24% {
      background: color-mix(in srgb, var(--key-eq) 38%, transparent);
    }
    48% {
      background: transparent;
    }
    86% {
      opacity: 1;
      transform: none;
    }
    100% {
      opacity: 0;
      transform: translateX(6px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .to {
      animation: none;
    }
  }

  .highlights {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .highlights li {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }

  .badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--key-eq) 18%, transparent);
    color: var(--accent-text);
  }

  .body {
    min-width: 0;
  }

  h3 {
    margin: 0 0 2px;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.3;
  }

  .body p {
    margin: 0;
    font-size: 14px;
    line-height: 1.45;
    color: var(--muted);
  }

  .formula {
    margin-top: 6px !important;
    font-size: 20px;
    color: var(--text) !important;
  }

  details {
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }

  summary {
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    color: var(--muted);
  }

  .earlier h3 {
    margin: 12px 0 4px;
    font-size: 15px;
  }

  .earlier .date {
    font-weight: 400;
    margin-left: 6px;
  }

  .earlier ul {
    margin: 0;
    padding-left: 18px;
    font-size: 14px;
    color: var(--muted);
  }

  .continue {
    min-height: 48px;
    border-radius: 14px;
    background: var(--key-eq);
    color: var(--key-eq-text);
    font-size: 16px;
    font-weight: 600;
  }

  .continue:active {
    filter: brightness(0.9);
  }
</style>
