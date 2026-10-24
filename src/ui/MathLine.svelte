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

  // the formula can also change from outside (a slider moving): keep the field in step
  // (read `latex` first, so the effect follows it even before the field exists)
  $effect(() => {
    const value = latex
    if (field && field.value !== value) field.value = value
  })

  export function focus() {
    field?.focus()
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
    f.addEventListener('input', () => onchange(f.value))
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
