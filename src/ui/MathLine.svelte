<script lang="ts">
  import { onMount } from 'svelte'
  import { MathfieldElement } from 'mathlive'
  import { CONSTANT_MACROS } from '../engine/constants'

  interface Props {
    latex: string
    label: string
    /** The formula changed. */
    onchange: (latex: string) => void
    onfocus?: (field: MathfieldElement) => void
    /** Enter: usually "add a line below". */
    onenter?: () => void
    /** Backspace in an empty line: usually "remove this line". */
    onemptyback?: () => void
  }

  let { latex, label, onchange, onfocus, onenter, onemptyback }: Props = $props()

  let host = $state<HTMLDivElement>()
  let field: MathfieldElement | undefined
  /** What the field itself last reported: when that comes back as `latex`, it is not a change. */
  let reported: string | null = null

  // the formula can also change from outside (a slider moving): keep the field in step, but
  // never write back what the person is typing (read `latex` first, so the effect follows it
  // even before the field exists)
  $effect(() => {
    const value = latex
    if (field && value !== reported && field.value !== value) {
      field.value = value
      reported = value
    }
  })

  export function focus() {
    field?.focus()
  }

  /** Insert LaTeX at the cursor, as if typed. */
  export function insert(tex: string) {
    if (!field) return
    field.executeCommand(['insert', tex, { focus: true, selectionMode: 'after' }])
    reported = field.value
    onchange(field.value)
  }

  onMount(() => {
    const f = new MathfieldElement()
    // the app's own keypad replaces MathLive's keyboard and the phone's one
    f.mathVirtualKeyboardPolicy = 'manual'
    f.setAttribute('aria-label', label)
    f.value = latex
    host!.append(f)
    f.smartFence = false
    f.smartSuperscript = false
    f.menuItems = []
    f.macros = { ...f.macros, ...CONSTANT_MACROS }
    f.addEventListener('input', () => {
      reported = f.value
      onchange(f.value)
    })
    f.addEventListener('focus', () => onfocus?.(f))
    f.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopImmediatePropagation()
          onenter?.()
        } else if (e.key === 'Backspace' && !f.value) {
          e.preventDefault()
          e.stopImmediatePropagation()
          onemptyback?.()
        }
      },
      { capture: true },
    )
    field = f
    return () => f.remove()
  })
</script>

<div class="line-field" bind:this={host}></div>

<style>
  .line-field {
    flex: 1;
    min-width: 0;
    font-size: 20px;
  }
</style>
