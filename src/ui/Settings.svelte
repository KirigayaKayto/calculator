<script lang="ts">
  import { onMount } from 'svelte'
  import Icon from './Icon.svelte'
  import Segmented from './Segmented.svelte'
  import { settings, history, install } from '../lib/state.svelte'

  let { onclose }: { onclose: () => void } = $props()

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
      <h2 id="settings-title">Настройки</h2>
      <button class="icon-btn" aria-label="Закрыть" onclick={() => dialog?.close()}><Icon name="x" /></button>
    </header>

    <Segmented
      label="Тема"
      name="theme"
      bind:value={settings.theme}
      options={[
        { value: 'system', label: 'Системная' },
        { value: 'light', label: 'Светлая' },
        { value: 'dark', label: 'Тёмная' },
      ]}
    />

    <Segmented
      label="Десятичный разделитель"
      name="decimal"
      bind:value={settings.decimal}
      options={[
        { value: ',', label: 'Запятая 1,5' },
        { value: '.', label: 'Точка 1.5' },
      ]}
    />
    <p class="hint">
      {settings.decimal === ','
        ? 'Аргументы функций разделяются точкой с запятой: max(3; 5)'
        : 'Аргументы функций разделяются запятой: max(3, 5)'}
    </p>

    <Segmented
      label="Углы"
      name="angle"
      bind:value={settings.angle}
      options={[
        { value: 'deg', label: 'Градусы' },
        { value: 'rad', label: 'Радианы' },
      ]}
    />

    <Segmented
      label="Точность ответа"
      name="digits"
      bind:value={settings.digits}
      options={[
        { value: 10, label: '10 знаков' },
        { value: 16, label: '16 знаков' },
        { value: 32, label: '32 знака' },
      ]}
    />

    {#if canVibrate}
      <Segmented
        label="Вибрация при нажатии"
        name="haptics"
        bind:value={settings.haptics}
        options={[
          { value: true, label: 'Вкл' },
          { value: false, label: 'Выкл' },
        ]}
      />
    {/if}

    <div class="actions">
      {#if install.prompt}
        <button class="action primary" onclick={installApp}>
          <Icon name="download" size={18} /> Установить на это устройство
        </button>
      {/if}
      <button class="action" onclick={clearHistory} disabled={!history.items.length}>
        <Icon name="trash" size={18} />
        {historyCleared ? 'История очищена' : 'Очистить историю'}
      </button>
    </div>

    <p class="about">
      Без рекламы и слежки. Всё хранится только на этом устройстве. Работает без интернета — интернет нужен
      только для курсов валют.
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
