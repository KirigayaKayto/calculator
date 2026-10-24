<script lang="ts">
  import { parseNumbers, parsePairs, summary, linearFit, type Summary, type LinearFit } from '../engine/stats'
  import { roundMeasurement } from '../engine/lab'
  import { formatBig } from '../engine/format'
  import { math } from '../engine/math'
  import { CalcError } from '../engine/errors'
  import { statsTool as st, settings, calcSettings, graph, ui, newId, PALETTE, copy, showToast } from '../lib/state.svelte'
  import Segmented from './Segmented.svelte'

  type Outcome<T> = { ok: true; value: T } | { ok: false; error: string } | null

  function attempt<T>(text: string, run: () => T): Outcome<T> {
    if (!text.trim()) return null
    try {
      return { ok: true, value: run() }
    } catch (e) {
      return { ok: false, error: e instanceof CalcError ? e.message : 'Something went wrong' }
    }
  }

  const list: Outcome<Summary> = $derived(attempt(st.list, () => summary(parseNumbers(st.list, settings.decimal))))
  const data = $derived(attempt(st.pairs, () => parsePairs(st.pairs, settings.decimal)))
  const fit: Outcome<LinearFit> = $derived(data?.ok ? attempt(st.pairs, () => linearFit(data.value.xs, data.value.ys)) : data)

  /** A number as the calculator writes it; ten significant digits unless a format is chosen. */
  function num(x: number | null): string {
    if (x === null || !Number.isFinite(x)) return '—'
    const cs = calcSettings(settings)
    const mode = cs.format === 'lab' ? 'auto' : cs.format
    const digits = mode === 'auto' ? Math.min(cs.digits, 10) : cs.digits
    return formatBig(math.bignumber(x), { decimal: cs.decimal, digits, mode })
  }

  /** A value with its standard error, rounded the lab way: 1.99 ± 0.06. */
  function measured(x: number, error: number | null): string {
    if (error === null || !Number.isFinite(error) || error === 0) return num(x)
    const r = roundMeasurement(math.bignumber(x), math.bignumber(error))
    const mark = (s: string) => s.replace('.', settings.decimal).replace('-', '−')
    return `${mark(r.center)} ± ${mark(r.sigma)}`
  }

  function rows(s: Summary): [string, string, number | null][] {
    return [
      ['Count n', String(s.n), s.n],
      ['Mean x̄', num(s.mean), s.mean],
      ['Median', num(s.median), s.median],
      ['Std dev s (sample)', num(s.s), s.s],
      ['Std dev σ (population)', num(s.sigma), s.sigma],
      ['Std error s/√n', num(s.sem), s.sem],
      ['Min', num(s.min), s.min],
      ['Max', num(s.max), s.max],
      ['Range', num(s.max - s.min), s.max - s.min],
      ['Q1', num(s.q1), s.q1],
      ['Q3', num(s.q3), s.q3],
      ['IQR', num(s.q3 - s.q1), s.q3 - s.q1],
      ['Sum Σx', num(s.sum), s.sum],
      ['Σx²', num(s.sumSquares), s.sumSquares],
    ]
  }

  function copyNumber(x: number | null) {
    if (x !== null && Number.isFinite(x)) copy(String(x))
  }

  // ---- the scatter plot with the line ----

  const W = 320
  const H = 180
  const PAD = 14

  const plot = $derived.by(() => {
    if (!data?.ok || !fit?.ok) return null
    const { xs, ys } = data.value
    const f = fit.value
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
    const lineYs = [f.slope * x0 + f.intercept, f.slope * x1 + f.intercept]
    const [y0, y1] = [Math.min(...ys, ...lineYs), Math.max(...ys, ...lineYs)]
    const sx = (x: number) => PAD + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * PAD)
    const sy = (y: number) => H - PAD - ((y - y0) / (y1 - y0 || 1)) * (H - 2 * PAD)
    return {
      points: xs.map((x, i) => [sx(x), sy(ys[i])]),
      line: [sx(x0), sy(lineYs[0]), sx(x1), sy(lineYs[1])],
    }
  })

  /** "y = 1.99x + 0.05" as LaTeX for a graph line, six significant digits. */
  function addToGraph(f: LinearFit) {
    const tex = (x: number) => {
      const s = String(Number(x.toPrecision(6)))
      return settings.decimal === ',' ? s.replace('.', '{,}') : s
    }
    const b = f.intercept
    const latex = `y=${tex(f.slope)}x${b < 0 ? '-' : '+'}${tex(Math.abs(b))}`
    const used = new Set(graph.lines.map((l) => l.color))
    const color = PALETTE.find((c) => !used.has(c)) ?? PALETTE[graph.lines.length % PALETTE.length]
    // the worksheet keeps an empty line last for typing
    const last = graph.lines.at(-1)
    const at = last && !last.latex.trim() ? graph.lines.length - 1 : graph.lines.length
    graph.lines.splice(at, 0, { id: newId(), latex, color })
    ui.tab = 'graph'
    showToast('Line added to the graph')
  }
</script>

<div class="stats">
  <Segmented
    label="Data"
    name="stats-mode"
    options={[
      { value: 'list', label: 'One list' },
      { value: 'pairs', label: 'Pairs x, y' },
    ]}
    bind:value={st.mode}
  />

  {#if st.mode === 'list'}
    <label class="visually-hidden" for="stats-list">Numbers</label>
    <textarea
      id="stats-list"
      rows="4"
      bind:value={st.list}
      placeholder={settings.decimal === ',' ? 'Numbers: 9,81 9,79 9,83 9,80' : 'Numbers: 9.81, 9.79, 9.83, 9.80'}
      spellcheck="false"
    ></textarea>

    {#if list?.ok === false}
      <p class="error">{list.error}</p>
    {:else if list?.ok}
      {@const s = list.value}
      <div class="card">
        {#if s.sem !== null}
          <p class="headline num">x̄ = {measured(s.mean, s.sem)}</p>
        {/if}
        <dl>
          {#each rows(s) as [label, text, x] (label)}
            <div class="item">
              <dt>{label}</dt>
              <dd><button class="value num" title="Copy" onclick={() => copyNumber(x)}>{text}</button></dd>
            </div>
          {/each}
          {#if s.modes.length}
            <div class="item">
              <dt>Mode</dt>
              <dd class="num">{s.modes.map(num).join(', ')}</dd>
            </div>
          {/if}
        </dl>
      </div>
      <p class="note">Quartiles by linear interpolation (as Excel’s QUARTILE.INC and R). Tap a value to copy it.</p>
    {/if}
  {:else}
    <label class="visually-hidden" for="stats-pairs">Pairs, x and y on each line</label>
    <textarea
      id="stats-pairs"
      rows="6"
      bind:value={st.pairs}
      placeholder={'x y on each line, or paste two columns:\n1 2.1\n2 3.9\n3 6.2'}
      spellcheck="false"
    ></textarea>

    {#if fit?.ok === false}
      <p class="error">{fit.error}</p>
    {:else if fit?.ok}
      {@const f = fit.value}
      <div class="card">
        <p class="headline num">y = m·x + b</p>
        <dl>
          <div class="item">
            <dt>Slope m</dt>
            <dd><button class="value num" title="Copy" onclick={() => copyNumber(f.slope)}>{measured(f.slope, f.slopeError)}</button></dd>
          </div>
          <div class="item">
            <dt>Intercept b</dt>
            <dd><button class="value num" title="Copy" onclick={() => copyNumber(f.intercept)}>{measured(f.intercept, f.interceptError)}</button></dd>
          </div>
          <div class="item">
            <dt>Correlation r</dt>
            <dd><button class="value num" title="Copy" onclick={() => copyNumber(f.r)}>{num(f.r)}</button></dd>
          </div>
          <div class="item">
            <dt>r²</dt>
            <dd><button class="value num" title="Copy" onclick={() => copyNumber(f.r2)}>{num(f.r2)}</button></dd>
          </div>
          <div class="item">
            <dt>Points n</dt>
            <dd class="num">{f.n}</dd>
          </div>
          <div class="item">
            <dt>m, unrounded</dt>
            <dd><button class="value num" title="Copy" onclick={() => copyNumber(f.slope)}>{num(f.slope)}</button></dd>
          </div>
          <div class="item">
            <dt>b, unrounded</dt>
            <dd><button class="value num" title="Copy" onclick={() => copyNumber(f.intercept)}>{num(f.intercept)}</button></dd>
          </div>
        </dl>

        {#if plot}
          <svg viewBox="0 0 {W} {H}" role="img" aria-label="The points and the fitted line">
            <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" class="frame" />
            <line x1={plot.line[0]} y1={plot.line[1]} x2={plot.line[2]} y2={plot.line[3]} class="fit" />
            {#each plot.points as [x, y], i (i)}
              <circle cx={x} cy={y} r="4" class="point" />
            {/each}
          </svg>
        {/if}

        <button class="action" onclick={() => addToGraph(f)}>Add the line to Graph</button>
      </div>
      {#if f.slopeError === null}
        <p class="note">With three or more points, the slope and intercept get their standard errors.</p>
      {:else}
        <p class="note">± are standard errors of the least-squares fit, rounded to 1–2 significant figures.</p>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .stats {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  textarea {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--key);
    color: var(--text);
    font: inherit;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    resize: vertical;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border-radius: 20px;
    background: var(--surface);
  }

  .headline {
    margin: 0;
    font-size: 22px;
    font-weight: 500;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
    gap: 0 24px;
    margin: 0;
  }

  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 40px;
    border-bottom: 1px solid var(--border);
  }

  dt {
    font-size: 14px;
    color: var(--muted);
  }

  dd {
    margin: 0;
    font-size: 16px;
    text-align: right;
  }

  .value {
    min-height: 36px;
    padding: 0 6px;
    border-radius: 8px;
    font-size: 16px;
    text-align: right;
  }

  .value:active {
    background: var(--key-fn);
  }

  svg {
    width: 100%;
    max-width: 480px;
    height: auto;
    align-self: center;
  }

  .frame {
    fill: var(--bg);
    stroke: var(--border);
  }

  .fit {
    stroke: var(--key-eq);
    stroke-width: 2;
  }

  .point {
    fill: var(--text);
  }

  .action {
    align-self: flex-start;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 12px;
    background: var(--key-eq);
    color: var(--key-eq-text);
    font-weight: 600;
  }

  .error {
    margin: 0 4px;
    color: var(--error);
  }

  .note {
    margin: 0 4px;
    font-size: 13px;
    color: var(--muted);
  }
</style>
