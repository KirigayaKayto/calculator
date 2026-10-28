/**
 * A Svelte action for segmented controls: one sliding pill glides under the selected
 * tab instead of each tab lighting up on its own, as iOS does it.
 *
 * The container must be `position: relative`; its tabs sit above the pill (`z-index: 1`)
 * and the selected one draws no background of its own. Colours come from the container:
 * `--pill-bg`, `--pill-shadow`, `--pill-radius`.
 */
export interface PillParams {
  /** Anything that changes when the selection changes, so the pill moves. */
  key: unknown
  /** How to find the selected tab inside the container. */
  selector: string
}

export function slidingPill(node: HTMLElement, params: PillParams) {
  const pill = document.createElement('span')
  pill.className = 'pill'
  pill.setAttribute('aria-hidden', 'true')
  node.prepend(pill)
  let ready = false

  const place = () => {
    const active = node.querySelector<HTMLElement>(params.selector)
    if (!active) {
      pill.style.opacity = '0'
      return
    }
    pill.style.opacity = '1'
    pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`
    pill.style.width = `${active.offsetWidth}px`
    pill.style.height = `${active.offsetHeight}px`
    // the first placement is instant; later ones glide
    if (!ready) {
      ready = true
      requestAnimationFrame(() => pill.classList.add('ready'))
    }
  }

  place()
  const observer = new ResizeObserver(place)
  observer.observe(node)

  return {
    update(next: PillParams) {
      params = next
      place()
    },
    destroy() {
      observer.disconnect()
      pill.remove()
    },
  }
}
