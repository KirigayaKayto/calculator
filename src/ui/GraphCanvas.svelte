<script lang="ts" module>
  import type { Item } from '../graph/model'

  export interface Plot {
    id: string
    item: Item
    color: string
    hidden?: boolean
  }

  export interface ViewState {
    cx: number
    cy: number
    scale: number
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte'
  import {
    sampleFunction,
    sampleParametric,
    sampleImplicit,
    findRoots,
    findExtrema,
    findIntersections,
    gridStep,
    toPx,
    fromPx,
    visibleRange,
    type View,
    type Pt,
  } from '../graph/sample'
  import Icon from './Icon.svelte'

  interface Props {
    plots: Plot[]
    view: ViewState
    selected: string | null
    onselect: (id: string | null) => void
    decimal: '.' | ','
  }

  let { plots, view = $bindable(), selected, onselect, decimal }: Props = $props()

  let wrap = $state<HTMLDivElement>()
  let canvas = $state<HTMLCanvasElement>()
  let size = $state({ w: 0, h: 0 })
  /** A labelled point: a point of interest that was tapped, or the trace position. */
  let marker = $state<{ x: number; y: number; color: string } | null>(null)
  let themeTick = $state(0)

  const v = $derived<View>({ ...view, width: size.w, height: size.h })

  type Fn = (x: number) => number
  /** The function y = f(x) behind a plot, when it is one (points of interest need it). */
  function explicit(p: Plot): Fn | null {
    const it = p.item
    if (it.kind === 'curve' && it.axis === 'y' && !it.relation) return it.f
    if (it.kind === 'function' && it.f) return it.f
    return null
  }

  // ---- points of interest of the selected curve: roots, extrema, y-intercept, intersections ----

  interface Poi {
    x: number
    y: number
  }
  const pois = $derived.by((): Poi[] => {
    const p = plots.find((q) => q.id === selected && !q.hidden)
    const f = p && explicit(p)
    if (!f || !size.w) return []
    const { x0, x1 } = visibleRange(v)
    const out: Poi[] = findRoots(f, x0, x1).map((x) => ({ x, y: 0 }))
    for (const e of findExtrema(f, x0, x1)) out.push({ x: e.x, y: e.y })
    if (x0 < 0 && x1 > 0 && Number.isFinite(f(0))) out.push({ x: 0, y: f(0) })
    for (const q of plots) {
      const g = q !== p && !q.hidden ? explicit(q) : null
      if (g) for (const [x, y] of findIntersections(f, g, x0, x1)) out.push({ x, y })
    }
    return out
  })

  // ---- drawing ----

  /** Where each plot was drawn, in pixels, for hit testing. */
  const drawn = new Map<string, Pt[][]>()
  let frame = 0

  $effect(() => {
    // redraw whenever anything shown changes
    void [plots, v, selected, marker, pois, themeTick, decimal]
    if (!frame) frame = requestAnimationFrame(draw)
  })

  function tick(value: number, step: number): string {
    const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
    const s = (Math.abs(value) < step / 1e6 ? 0 : value).toFixed(decimals)
    return s.replace('-', '−').replace('.', decimal)
  }

  function coordinate(x: number): string {
    const s = Math.abs(x) < 1e-12 ? '0' : Number(x.toPrecision(6)).toString()
    return s.replace('-', '−').replace('.', decimal)
  }

  function draw() {
    frame = 0
    if (!canvas || !size.w || !size.h) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(size.h * dpr)) {
      canvas.width = Math.round(size.w * dpr)
      canvas.height = Math.round(size.h * dpr)
    }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const css = getComputedStyle(canvas)
    const color = (name: string) => css.getPropertyValue(name).trim()
    const text = color('--text')
    const muted = color('--muted')
    const border = color('--border')
    ctx.fillStyle = color('--surface')
    ctx.fillRect(0, 0, size.w, size.h)

    grid(ctx, text, muted, border)
    drawn.clear()
    for (const p of plots) if (!p.hidden) plot(ctx, p, p.id === selected)

    // points of interest and the marked point
    for (const q of pois) dot(ctx, q.x, q.y, 4.5, muted, color('--surface'))
    if (marker) {
      dot(ctx, marker.x, marker.y, 5.5, marker.color, color('--surface'))
      const [px, py] = toPx(v, marker.x, marker.y)
      const label = `(${coordinate(marker.x)}, ${coordinate(marker.y)})`
      ctx.font = '600 13px system-ui, sans-serif'
      const w = ctx.measureText(label).width + 12
      const lx = Math.min(Math.max(px + 10, 4), size.w - w - 4)
      const ly = Math.min(Math.max(py - 30, 4), size.h - 26)
      ctx.fillStyle = color('--key')
      ctx.strokeStyle = border
      ctx.beginPath()
      ctx.roundRect(lx, ly, w, 22, 6)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = text
      ctx.fillText(label, lx + 6, ly + 15)
    }
  }

  function grid(ctx: CanvasRenderingContext2D, text: string, muted: string, border: string) {
    const step = gridStep(v.scale)
    const minor = step / (Math.round(step / 10 ** Math.floor(Math.log10(step))) === 2 ? 4 : 5)
    const { x0, x1, y0, y1 } = visibleRange(v)
    const lines = (s: number, alpha: number) => {
      ctx.globalAlpha = alpha
      ctx.strokeStyle = border
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = Math.ceil(x0 / s) * s; x <= x1; x += s) {
        const [px] = toPx(v, x, 0)
        ctx.moveTo(Math.round(px) + 0.5, 0)
        ctx.lineTo(Math.round(px) + 0.5, size.h)
      }
      for (let y = Math.ceil(y0 / s) * s; y <= y1; y += s) {
        const [, py] = toPx(v, 0, y)
        ctx.moveTo(0, Math.round(py) + 0.5)
        ctx.lineTo(size.w, Math.round(py) + 0.5)
      }
      ctx.stroke()
    }
    lines(minor, 0.45)
    lines(step, 1)
    ctx.globalAlpha = 1

    // axes
    const [ox, oy] = toPx(v, 0, 0)
    ctx.strokeStyle = text
    ctx.globalAlpha = 0.75
    ctx.lineWidth = 1.5
    ctx.beginPath()
    if (ox >= 0 && ox <= size.w) {
      ctx.moveTo(Math.round(ox) + 0.5, 0)
      ctx.lineTo(Math.round(ox) + 0.5, size.h)
    }
    if (oy >= 0 && oy <= size.h) {
      ctx.moveTo(0, Math.round(oy) + 0.5)
      ctx.lineTo(size.w, Math.round(oy) + 0.5)
    }
    ctx.stroke()
    ctx.globalAlpha = 1

    // labels: along the axes, or at the edge when an axis is off screen
    ctx.font = '12px system-ui, sans-serif'
    ctx.fillStyle = muted
    const ly = Math.min(Math.max(oy + 4, 4), size.h - 16)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      if (Math.abs(x) < step / 2) continue
      const [px] = toPx(v, x, 0)
      ctx.fillText(tick(x, step), px, ly)
    }
    const lx = Math.min(Math.max(ox - 6, 30), size.w - 4)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      if (Math.abs(y) < step / 2) continue
      const [, py] = toPx(v, 0, y)
      ctx.fillText(tick(y, step), lx, py)
    }
    if (ox >= 0 && ox <= size.w && oy >= 0 && oy <= size.h) {
      ctx.textBaseline = 'top'
      ctx.fillText('0', ox - 6, oy + 4)
    }
    ctx.textAlign = 'start'
    ctx.textBaseline = 'alphabetic'
  }

  const clampPx = (p: Pt): Pt => [Math.max(-1e5, Math.min(1e5, p[0])), Math.max(-1e5, Math.min(1e5, p[1]))]

  function stroke(ctx: CanvasRenderingContext2D, id: string, segments: Pt[][]) {
    const px = segments.map((s) => s.map(([x, y]) => clampPx(toPx(v, x, y))))
    ctx.beginPath()
    for (const s of px) {
      ctx.moveTo(s[0][0], s[0][1])
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1])
    }
    ctx.stroke()
    drawn.set(id, [...(drawn.get(id) ?? []), ...px])
  }

  function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, ring: string) {
    const [px, py] = toPx(v, x, y)
    ctx.beginPath()
    ctx.arc(px, py, r, 0, 2 * Math.PI)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = ring
    ctx.stroke()
  }

  function plot(ctx: CanvasRenderingContext2D, p: Plot, isSelected: boolean) {
    const it = p.item
    const { x0, x1, y0, y1 } = visibleRange(v)
    const n = Math.ceil(size.w / 1.5)
    ctx.strokeStyle = p.color
    ctx.fillStyle = p.color
    ctx.lineWidth = isSelected ? 3.5 : 2.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.setLineDash([])

    switch (it.kind) {
      case 'function':
        if (it.f) stroke(ctx, p.id, sampleFunction(it.f, x0, x1, n, y1 - y0))
        return
      case 'curve': {
        if (it.axis === 'x') {
          const segs = sampleFunction(it.f, y0, y1, Math.ceil(size.h / 1.5), x1 - x0)
          stroke(ctx, p.id, segs.map((s) => s.map(([y, x]) => [x, y] as Pt)))
          return
        }
        const segs = sampleFunction(it.f, x0, x1, n, y1 - y0)
        if (it.relation) {
          // shade the region, and draw the edge dashed when it is not included
          const edge = it.relation.startsWith('<') ? y0 : y1
          ctx.globalAlpha = 0.2
          for (const s of segs) {
            ctx.beginPath()
            const first = toPx(v, s[0][0], edge)
            ctx.moveTo(...first)
            for (const [x, y] of s) ctx.lineTo(...clampPx(toPx(v, x, y)))
            ctx.lineTo(...toPx(v, s[s.length - 1][0], edge))
            ctx.closePath()
            ctx.fill()
          }
          ctx.globalAlpha = 1
          if (it.relation.length === 1) ctx.setLineDash([8, 6])
        }
        stroke(ctx, p.id, segs)
        ctx.setLineDash([])
        return
      }
      case 'implicit': {
        const pieces = sampleImplicit(it.f, v, 5)
        stroke(ctx, p.id, pieces)
        return
      }
      case 'parametric':
        stroke(ctx, p.id, sampleParametric(it.x, it.y, it.range[0], it.range[1], 1200))
        return
      case 'polar':
        stroke(
          ctx,
          p.id,
          sampleParametric(
            (t) => it.r(t) * Math.cos(t),
            (t) => it.r(t) * Math.sin(t),
            it.range[0],
            it.range[1],
            1200,
          ),
        )
        return
      case 'point': {
        const [px, py] = toPx(v, it.x, it.y)
        ctx.beginPath()
        ctx.arc(px, py, isSelected ? 7 : 5.5, 0, 2 * Math.PI)
        ctx.fill()
        drawn.set(p.id, [[[px, py]]])
        return
      }
      case 'integral': {
        const a = Math.max(Math.min(it.a, it.b), x0)
        const b = Math.min(Math.max(it.a, it.b), x1)
        if (!(a < b)) return
        const segs = sampleFunction(it.f, a, b, Math.ceil(((b - a) * v.scale) / 1.5) + 2, y1 - y0)
        ctx.globalAlpha = 0.25
        for (const s of segs) {
          ctx.beginPath()
          ctx.moveTo(...toPx(v, s[0][0], 0))
          for (const [x, y] of s) ctx.lineTo(...clampPx(toPx(v, x, y)))
          ctx.lineTo(...toPx(v, s[s.length - 1][0], 0))
          ctx.closePath()
          ctx.fill()
        }
        ctx.globalAlpha = 1
        ctx.lineWidth = 1.5
        stroke(ctx, p.id, segs)
        return
      }
    }
  }

  // ---- hit testing ----

  function distanceToSegment(px: number, py: number, a: Pt, b: Pt): number {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = dx * dx + dy * dy
    const t = len ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len)) : 0
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy))
  }

  /** The plot under a pixel, and the nearest point on it. */
  function hit(px: number, py: number): { id: string; point: Pt } | null {
    let best: { id: string; d: number; point: Pt } | null = null
    for (const [id, segments] of drawn) {
      for (const s of segments) {
        if (s.length === 1) {
          const d = Math.hypot(px - s[0][0], py - s[0][1])
          if (!best || d < best.d) best = { id, d, point: s[0] }
          continue
        }
        for (let i = 1; i < s.length; i++) {
          const d = distanceToSegment(px, py, s[i - 1], s[i])
          if (!best || d < best.d) best = { id, d, point: [(s[i - 1][0] + s[i][0]) / 2, (s[i - 1][1] + s[i][1]) / 2] }
        }
      }
    }
    return best && best.d <= 16 ? { id: best.id, point: best.point } : null
  }

  // ---- gestures: drag to pan, pinch or wheel to zoom, tap to select, drag along a curve to trace ----

  const pointers = new Map<number, { x: number; y: number }>()
  let gesture: { kind: 'pan' | 'trace' | 'pinch'; moved: number; startX: number; startY: number; dist?: number } | null = null

  function local(e: PointerEvent | WheelEvent): [number, number] {
    const r = canvas!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  function zoomAt(px: number, py: number, factor: number) {
    const [wx, wy] = fromPx(v, px, py)
    const scale = Math.min(1e7, Math.max(1e-4, view.scale * factor))
    // keep the point under the finger where it is
    view = {
      scale,
      cx: wx - (px - size.w / 2) / scale,
      cy: wy + (py - size.h / 2) / scale,
    }
  }

  function trace(px: number) {
    const p = plots.find((q) => q.id === selected)
    const f = p && explicit(p)
    if (!f) return
    const [x] = fromPx(v, px, 0)
    const y = f(x)
    if (Number.isFinite(y)) marker = { x, y, color: p.color }
  }

  function onpointerdown(e: PointerEvent) {
    canvas!.setPointerCapture(e.pointerId)
    const [x, y] = local(e)
    pointers.set(e.pointerId, { x, y })
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      gesture = { kind: 'pinch', moved: 99, startX: x, startY: y, dist: Math.hypot(a.x - b.x, a.y - b.y) }
      return
    }
    const h = hit(x, y)
    const onSelected = h && h.id === selected && plots.find((q) => q.id === selected && explicit(q))
    gesture = { kind: onSelected ? 'trace' : 'pan', moved: 0, startX: x, startY: y }
    if (onSelected) trace(x)
  }

  function onpointermove(e: PointerEvent) {
    if (!pointers.has(e.pointerId) || !gesture) return
    const [x, y] = local(e)
    const prev = pointers.get(e.pointerId)!
    pointers.set(e.pointerId, { x, y })
    if (gesture.kind === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (gesture.dist) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / gesture.dist)
      gesture.dist = dist
      return
    }
    gesture.moved += Math.abs(x - prev.x) + Math.abs(y - prev.y)
    if (gesture.kind === 'trace') return trace(x)
    if (gesture.moved > 4) {
      view = { ...view, cx: view.cx - (x - prev.x) / view.scale, cy: view.cy + (y - prev.y) / view.scale }
    }
  }

  function onpointerup(e: PointerEvent) {
    pointers.delete(e.pointerId)
    if (!gesture) return
    const g = gesture
    if (pointers.size === 0) gesture = null
    if (g.kind !== 'pan' || g.moved > 4) return
    // a tap: a point of interest, a curve, or empty space
    const [x, y] = local(e)
    const near = pois.find((q) => {
      const [qx, qy] = toPx(v, q.x, q.y)
      return Math.hypot(qx - x, qy - y) < 14
    })
    if (near) {
      marker = { ...near, color: plots.find((q) => q.id === selected)?.color ?? '#888' }
      return
    }
    const h = hit(x, y)
    if (h) {
      onselect(h.id)
      const p = plots.find((q) => q.id === h.id)!
      const f = explicit(p)
      const [wx] = fromPx(v, x, 0)
      if (f && Number.isFinite(f(wx))) marker = { x: wx, y: f(wx), color: p.color }
      else {
        const [mx, my] = fromPx(v, h.point[0], h.point[1])
        marker = { x: mx, y: my, color: p.color }
      }
    } else {
      onselect(null)
      marker = null
    }
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault()
    const [x, y] = local(e)
    zoomAt(x, y, Math.exp(-e.deltaY * 0.0015))
  }

  function zoomButton(factor: number) {
    zoomAt(size.w / 2, size.h / 2, factor)
  }

  function reset() {
    view = { cx: 0, cy: 0, scale: Math.max(20, Math.min(size.w, size.h) / 16) }
    marker = null
  }

  $effect(() => {
    // the marker belongs to the selected curve
    if (!selected) marker = null
  })

  onMount(() => {
    const ro = new ResizeObserver(([entry]) => {
      size = { w: entry.contentRect.width, h: entry.contentRect.height }
    })
    ro.observe(wrap!)
    // redraw in the other theme's colors
    const mo = new MutationObserver(() => themeTick++)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => themeTick++
    mq.addEventListener('change', onScheme)
    canvas!.addEventListener('wheel', onwheel, { passive: false })
    return () => {
      ro.disconnect()
      mo.disconnect()
      mq.removeEventListener('change', onScheme)
      cancelAnimationFrame(frame)
    }
  })
</script>

<div class="graph" bind:this={wrap}>
  <canvas
    bind:this={canvas}
    aria-label="Graph. Drag to move, pinch or scroll to zoom, tap a curve to see its key points."
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
  ></canvas>
  <div class="zoom">
    <button class="icon-btn" aria-label="Zoom in" onclick={() => zoomButton(1.4)}><Icon name="plus" size={20} /></button>
    <button class="icon-btn" aria-label="Zoom out" onclick={() => zoomButton(1 / 1.4)}><Icon name="minus" size={20} /></button>
    <button class="icon-btn" aria-label="Back to the origin" onclick={reset}><Icon name="home" size={20} /></button>
  </div>
</div>

<style>
  .graph {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    border-radius: 20px;
    overflow: hidden;
    background: var(--surface);
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: crosshair;
  }

  .zoom {
    position: absolute;
    right: 8px;
    top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .zoom .icon-btn {
    background: var(--key);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
  }
</style>
