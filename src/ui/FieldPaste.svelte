<script lang="ts">
  import Icon from './Icon.svelte'
  import { readClipboard } from './paste'
  import { showToast } from '../lib/state.svelte'

  interface Props {
    /**
     * A formula field. Our keypad replaces the phone's keyboard, and with it the phone's own
     * Paste: a long press (or a right click) on the field offers Paste instead.
     * Ctrl+V and the keyboard's clipboard also come through `onpaste`.
     */
    target: HTMLElement | undefined
    onpaste: (text: string) => void
  }

  let { target, onpaste }: Props = $props()

  let menu = $state<{ x: number; y: number } | null>(null)
  let dialog = $state<HTMLDialogElement>()
  let typedText = $state('')
  let openedAt = 0

  function open(x: number, y: number) {
    // a long press can arrive twice: as our timer and as the browser's contextmenu
    if (Date.now() - openedAt < 800) return
    openedAt = Date.now()
    menu = { x: Math.min(Math.max(x, 64), innerWidth - 64), y: Math.max(8, y - 64) }
  }

  $effect(() => {
    const el = target
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let start: { x: number; y: number } | null = null
    const cancel = () => {
      clearTimeout(timer)
      start = null
    }
    const onpointerdown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      const at = { x: e.clientX, y: e.clientY }
      start = at
      timer = setTimeout(() => start === at && open(at.x, at.y), 550)
    }
    const onpointermove = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel()
    }
    const oncontextmenu = (e: MouseEvent) => {
      e.preventDefault()
      cancel()
      open(e.clientX, e.clientY)
    }
    // MathLive hands a paste to the field before handling it: plain text from other apps is ours
    const onpasteEvent = (e: ClipboardEvent) => {
      const data = e.clipboardData
      if (!data || data.types.includes('application/json+mathlive') || data.types.includes('application/x-latex')) return
      const text = data.getData('text/plain')
      if (!text) return
      e.preventDefault()
      onpaste(text)
    }
    el.addEventListener('pointerdown', onpointerdown)
    el.addEventListener('pointermove', onpointermove)
    el.addEventListener('pointerup', cancel)
    el.addEventListener('pointercancel', cancel)
    el.addEventListener('contextmenu', oncontextmenu, { capture: true })
    el.addEventListener('paste', onpasteEvent)
    return () => {
      cancel()
      el.removeEventListener('pointerdown', onpointerdown)
      el.removeEventListener('pointermove', onpointermove)
      el.removeEventListener('pointerup', cancel)
      el.removeEventListener('pointercancel', cancel)
      el.removeEventListener('contextmenu', oncontextmenu, { capture: true })
      el.removeEventListener('paste', onpasteEvent)
    }
  })

  /** Paste what the clipboard holds; where the browser won't let us read it, through a box to paste into. */
  export async function paste() {
    menu = null
    const r = await readClipboard()
    if (!r.ok) {
      typedText = ''
      dialog?.showModal()
      return
    }
    if (!r.text.trim()) return showToast('The clipboard is empty')
    onpaste(r.text)
  }

  // the menu closes on a tap elsewhere, Escape or scrolling
  $effect(() => {
    if (!menu) return
    const close = () => (menu = null)
    const onkey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const outside = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('.paste-menu')) close()
    }
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', onkey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', onkey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  })

  function onclose() {
    if (dialog?.returnValue === 'ok' && typedText.trim()) onpaste(typedText)
  }
</script>

{#if menu}
  <div class="paste-menu" role="menu" style:left="{menu.x}px" style:top="{menu.y}px">
    <button role="menuitem" onmousedown={(e) => e.preventDefault()} onclick={paste}>
      <Icon name="paste" size={18} />
      Paste
    </button>
  </div>
{/if}

<dialog bind:this={dialog} aria-labelledby="paste-title" {onclose}>
  <form method="dialog">
    <h2 id="paste-title">Paste</h2>
    <p>Long-press the box and choose <b>Paste</b>.</p>
    <label class="visually-hidden" for="paste-box">Text to paste</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="paste-box" bind:value={typedText} autocomplete="off" spellcheck="false" autofocus />
    <div class="actions">
      <button value="cancel" formnovalidate>Cancel</button>
      <button value="ok" class="primary">Insert</button>
    </div>
  </form>
</dialog>

<style>
  .paste-menu {
    position: fixed;
    z-index: 20;
    transform: translateX(-50%);
    padding: 4px;
    border-radius: 14px;
    background: var(--text);
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.25);
  }

  .paste-menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 10px;
    color: var(--bg);
    font-size: 16px;
    font-weight: 600;
  }

  .paste-menu button:active {
    background: rgb(127 127 127 / 0.3);
  }

  dialog {
    width: min(400px, calc(100vw - 32px));
    padding: 0;
    border: 0;
    border-radius: 24px;
    background: var(--surface);
    color: var(--text);
  }

  dialog::backdrop {
    background: var(--scrim);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }

  p {
    margin: 0;
    font-size: 15px;
    color: var(--muted);
  }

  input {
    min-height: 48px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--key);
    color: var(--text);
    font-size: 18px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .actions button {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 12px;
    font-weight: 600;
    background: var(--key-fn);
  }

  .actions .primary {
    background: var(--key-eq);
    color: var(--key-eq-text);
  }
</style>
