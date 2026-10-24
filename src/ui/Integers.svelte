<script lang="ts">
  import {
    parseIntegers,
    evaluateInteger,
    factorize,
    isPrime,
    divisors,
    divisorCount,
    divisorSum,
    totient,
    gcd,
    lcm,
    nextPrime,
    previousPrime,
    modPow,
    modInverse,
    type Factorization,
  } from '../engine/integers'
  import { CalcError } from '../engine/errors'
  import { latexMarkup } from '../lib/markup'
  import { integerTool as it, copy } from '../lib/state.svelte'

  type Outcome<T> = { ok: true; value: T } | { ok: false; error: string } | null

  function attempt<T>(run: () => T): Outcome<T> {
    try {
      return { ok: true, value: run() }
    } catch (e) {
      return { ok: false, error: e instanceof CalcError ? e.message : 'Something went wrong' }
    }
  }

  const numbers = $derived(it.input.trim() ? attempt(() => parseIntegers(it.input)) : null)

  /** Grouped by thousands for reading, with a real minus. */
  function big(n: bigint): string {
    const s = (n < 0n ? -n : n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    return (n < 0n ? '−' : '') + s
  }

  function factorLatex(n: bigint, f: Factorization): string {
    const parts = f.factors.map(([p, k]) => (k > 1 ? `${p}^{${k}}` : `${p}`))
    if (f.unfactored) parts.push(`\\underbrace{${f.unfactored}}_{\\text{composite}}`)
    return (n < 0n ? '-' : '') + parts.join('\\cdot ')
  }

  // the budget keeps typing smooth: numbers with two huge prime factors stay partly unfactored
  const single = $derived.by(() => {
    if (!numbers?.ok || numbers.value.length !== 1) return null
    const n = numbers.value[0]
    const f = factorize(n, 400_000)
    const abs = n < 0n ? -n : n
    return {
      n,
      abs,
      f,
      prime: isPrime(abs),
      divisors: divisors(f, 300),
      count: f.unfactored ? null : divisorCount(f),
      sum: f.unfactored ? null : divisorSum(f),
      phi: f.unfactored || abs === 0n ? null : totient(abs, f),
      next: abs < 10n ** 60n ? nextPrime(abs) : null,
      previous: abs < 10n ** 60n ? previousPrime(abs) : null,
    }
  })

  const several = $derived.by(() => {
    if (!numbers?.ok || numbers.value.length < 2) return null
    const ns = numbers.value
    return {
      ns,
      gcd: ns.reduce(gcd),
      lcm: ns.reduce(lcm),
      factors: ns.slice(0, 12).map((n) => ({ n, f: factorize(n, 100_000) })),
    }
  })

  // ---- modular arithmetic ----

  const mod = $derived.by(() => {
    if (!it.a.trim() || !it.m.trim()) return null
    return attempt(() => {
      const a = evaluateInteger(it.a)
      const m = evaluateInteger(it.m)
      if (m === 0n) throw new CalcError('The modulus can’t be 0')
      const b = it.b.trim() ? evaluateInteger(it.b) : 1n
      return {
        power: attempt(() => modPow(a, b, m)),
        inverse: attempt(() => modInverse(a, m)),
      }
    })
  })
</script>

<div class="integers">
  <label class="field-label" for="int-input">Whole numbers</label>
  <input
    id="int-input"
    class="num"
    bind:value={it.input}
    placeholder="360   or   84, 36   or   2^61 − 1"
    autocomplete="off"
    spellcheck="false"
  />

  {#if numbers?.ok === false}
    <p class="error">{numbers.error}</p>
  {/if}

  {#if single}
    {@const s = single}
    <div class="card">
      <p class="verdict">
        {#if s.abs < 2n}
          {s.n} is neither prime nor composite
        {:else if s.prime}
          <span class="tag prime">Prime</span>
        {:else}
          <span class="tag">Composite</span>
        {/if}
      </p>
      {#if s.abs >= 2n}
        <div class="factor">
          <span class="lhs num">{big(s.n)} =</span>
          <span class="formula">{@html latexMarkup(factorLatex(s.n, s.f))}</span>
        </div>
      {/if}
      <dl>
        {#if s.count !== null && s.abs > 0n}
          <div class="item"><dt>Number of divisors</dt><dd class="num">{big(s.count)}</dd></div>
          <div class="item"><dt>Sum of divisors σ</dt><dd class="num">{big(s.sum!)}</dd></div>
        {/if}
        {#if s.phi !== null}
          <div class="item"><dt>Euler’s φ</dt><dd class="num">{big(s.phi)}</dd></div>
        {/if}
        {#if s.previous !== null}
          <div class="item"><dt>Previous prime</dt><dd class="num">{big(s.previous)}</dd></div>
        {/if}
        {#if s.next !== null}
          <div class="item"><dt>Next prime</dt><dd class="num">{big(s.next)}</dd></div>
        {/if}
      </dl>
      {#if s.divisors && s.abs > 1n}
        <div class="divisors">
          <span class="field-label">Divisors</span>
          <p class="num">{s.divisors.map(big).join(', ')}</p>
        </div>
      {/if}
      <button class="copy-btn" onclick={() => copy(s.n.toString())}>Copy the number</button>
    </div>
    {#if s.f.unfactored}
      <p class="note">Part of the number has only very large prime factors and wasn’t split in time.</p>
    {:else if s.abs > 10n ** 24n && s.prime}
      <p class="note">Above 3·10²⁴, “prime” is the verdict of 20 Miller–Rabin rounds: certain for any practical purpose.</p>
    {/if}
  {/if}

  {#if several}
    <div class="card">
      <dl>
        <div class="item">
          <dt>GCD</dt>
          <dd><button class="value num" title="Copy" onclick={() => copy(several.gcd.toString())}>{big(several.gcd)}</button></dd>
        </div>
        <div class="item">
          <dt>LCM</dt>
          <dd><button class="value num" title="Copy" onclick={() => copy(several.lcm.toString())}>{big(several.lcm)}</button></dd>
        </div>
      </dl>
      <ul class="factor-list">
        {#each several.factors as { n, f }, i (i)}
          <li>
            <span class="lhs num">{big(n)}</span>
            {#if (n < 0n ? -n : n) >= 2n}
              <span class="formula">= {@html latexMarkup(factorLatex(n, f))}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if !it.input.trim()}
    <p class="note">One number: prime test, factorization, divisors, φ. Several numbers: GCD and LCM. Expressions such as 2^64 − 1 or 20! work too.</p>
  {/if}

  <section class="card modular">
    <h3>Modular arithmetic</h3>
    <div class="mod-row">
      <input class="num" aria-label="a" bind:value={it.a} placeholder="a" autocomplete="off" />
      <span class="op" aria-hidden="true">^</span>
      <input class="num" aria-label="Power b" bind:value={it.b} placeholder="b" autocomplete="off" />
      <span class="op">mod</span>
      <input class="num" aria-label="Modulus m" bind:value={it.m} placeholder="m" autocomplete="off" />
    </div>
    {#if mod?.ok === false}
      <p class="error">{mod.error}</p>
    {:else if mod?.ok}
      <dl>
        <div class="item">
          <dt>a<sup>b</sup> mod m</dt>
          <dd class="num">
            {#if mod.value.power?.ok}{big(mod.value.power.value)}{:else}<span class="error">{mod.value.power?.error}</span>{/if}
          </dd>
        </div>
        <div class="item">
          <dt>a<sup>−1</sup> mod m</dt>
          <dd class="num">
            {#if mod.value.inverse?.ok}{big(mod.value.inverse.value)}{:else}<span class="error small">{mod.value.inverse?.error}</span>{/if}
          </dd>
        </div>
      </dl>
    {/if}
  </section>
</div>

<style>
  .integers {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .field-label {
    font-size: 14px;
    color: var(--muted);
  }

  input {
    min-height: 48px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--key);
    color: var(--text);
    font-size: 18px;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border-radius: 20px;
    background: var(--surface);
  }

  .verdict {
    margin: 0;
    font-size: 16px;
  }

  .tag {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--key-fn);
    font-weight: 600;
  }

  .tag.prime {
    background: var(--key-eq);
    color: var(--key-eq-text);
  }

  .factor {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    font-size: 20px;
  }

  .lhs {
    overflow-wrap: anywhere;
  }

  .formula {
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
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
    overflow-wrap: anywhere;
    min-width: 0;
  }

  .value {
    min-height: 36px;
    padding: 0 6px;
    border-radius: 8px;
    font-size: 16px;
    text-align: right;
    overflow-wrap: anywhere;
  }

  .value:active {
    background: var(--key-fn);
  }

  .divisors p {
    margin: 4px 0 0;
    font-size: 15px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .copy-btn {
    align-self: flex-start;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 12px;
    background: var(--key-fn);
    font-size: 14px;
    font-weight: 500;
  }

  .factor-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 17px;
  }

  .factor-list li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }

  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  .mod-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto 1fr;
    align-items: center;
    gap: 6px;
  }

  .mod-row input {
    min-width: 0;
    padding: 0 10px;
    font-size: 16px;
  }

  .op {
    font-size: 15px;
    color: var(--muted);
  }

  .error {
    margin: 0 4px;
    color: var(--error);
  }

  .error.small {
    font-size: 13px;
  }

  .note {
    margin: 0 4px;
    font-size: 13px;
    color: var(--muted);
  }
</style>
