<script lang="ts" module>
  interface UnitDef {
    u: string
    label: string
  }
  interface Category {
    id: string
    label: string
    units: UnitDef[]
    pair: [string, string]
  }

  const u = (unit: string, label: string): UnitDef => ({ u: unit, label })

  // unit names are the ones the engine understands (mathjs plus the extras in math.ts)
  export const CATEGORIES: Category[] = [
    {
      id: 'length',
      label: 'Length',
      pair: ['km', 'mi'],
      units: [
        u('nm', 'Nanometre'), u('um', 'Micrometre'), u('mm', 'Millimetre'), u('cm', 'Centimetre'),
        u('m', 'Metre'), u('km', 'Kilometre'), u('inch', 'Inch'), u('ft', 'Foot'), u('yd', 'Yard'),
        u('mi', 'Mile'), u('nmi', 'Nautical mile'), u('angstrom', 'Ångström'), u('au', 'Astronomical unit'),
        u('ly', 'Light-year'), u('pc', 'Parsec'),
      ],
    },
    {
      id: 'mass',
      label: 'Mass',
      pair: ['kg', 'lbm'],
      units: [
        u('mg', 'Milligram'), u('g', 'Gram'), u('kg', 'Kilogram'), u('tonne', 'Tonne'), u('oz', 'Ounce'),
        u('lbm', 'Pound'), u('u', 'Atomic mass unit'),
      ],
    },
    {
      id: 'time',
      label: 'Time',
      pair: ['h', 'min'],
      units: [
        u('ns', 'Nanosecond'), u('us', 'Microsecond'), u('ms', 'Millisecond'), u('s', 'Second'),
        u('min', 'Minute'), u('h', 'Hour'), u('day', 'Day'), u('week', 'Week'), u('year', 'Year'),
      ],
    },
    {
      id: 'temperature',
      label: 'Temperature',
      pair: ['degC', 'degF'],
      units: [u('degC', 'Celsius, °C'), u('degF', 'Fahrenheit, °F'), u('K', 'Kelvin, K')],
    },
    {
      id: 'speed',
      label: 'Speed',
      pair: ['km/h', 'm/s'],
      units: [u('m/s', 'Metre per second'), u('km/h', 'Kilometre per hour'), u('mi/h', 'Mile per hour'), u('knot', 'Knot')],
    },
    {
      id: 'force',
      label: 'Force',
      pair: ['N', 'lbf'],
      units: [u('N', 'Newton'), u('kN', 'Kilonewton'), u('dyn', 'Dyne'), u('lbf', 'Pound-force')],
    },
    {
      id: 'energy',
      label: 'Energy',
      pair: ['kcal', 'kJ'],
      units: [
        u('J', 'Joule'), u('kJ', 'Kilojoule'), u('MJ', 'Megajoule'), u('cal', 'Calorie'), u('kcal', 'Kilocalorie'),
        u('Wh', 'Watt-hour'), u('kWh', 'Kilowatt-hour'), u('eV', 'Electronvolt'), u('erg', 'Erg'), u('BTU', 'BTU'),
      ],
    },
    {
      id: 'power',
      label: 'Power',
      pair: ['hp', 'kW'],
      units: [u('W', 'Watt'), u('kW', 'Kilowatt'), u('MW', 'Megawatt'), u('hp', 'Horsepower')],
    },
    {
      id: 'pressure',
      label: 'Pressure',
      pair: ['atm', 'kPa'],
      units: [
        u('Pa', 'Pascal'), u('kPa', 'Kilopascal'), u('MPa', 'Megapascal'), u('bar', 'Bar'), u('atm', 'Atmosphere'),
        u('mmHg', 'Millimetre of mercury'), u('torr', 'Torr'), u('psi', 'Pound per square inch'),
      ],
    },
    {
      id: 'area',
      label: 'Area',
      pair: ['hectare', 'acre'],
      units: [
        u('mm^2', 'Square millimetre'), u('cm^2', 'Square centimetre'), u('m^2', 'Square metre'),
        u('km^2', 'Square kilometre'), u('hectare', 'Hectare'), u('acre', 'Acre'), u('ft^2', 'Square foot'),
      ],
    },
    {
      id: 'volume',
      label: 'Volume',
      pair: ['L', 'gallon'],
      units: [
        u('mL', 'Millilitre'), u('L', 'Litre'), u('cm^3', 'Cubic centimetre'), u('m^3', 'Cubic metre'),
        u('floz', 'Fluid ounce (US)'), u('gallon', 'Gallon (US)'),
      ],
    },
    {
      id: 'angle',
      label: 'Angle',
      pair: ['deg', 'rad'],
      units: [u('deg', 'Degree'), u('rad', 'Radian'), u('grad', 'Gradian'), u('arcmin', 'Arcminute'), u('arcsec', 'Arcsecond')],
    },
    {
      id: 'frequency',
      label: 'Frequency',
      pair: ['rpm', 'Hz'],
      units: [u('Hz', 'Hertz'), u('kHz', 'Kilohertz'), u('MHz', 'Megahertz'), u('GHz', 'Gigahertz'), u('rpm', 'Revolutions per minute')],
    },
    {
      id: 'data',
      label: 'Data',
      pair: ['GB', 'GiB'],
      units: [
        u('b', 'Bit'), u('B', 'Byte'), u('kB', 'Kilobyte'), u('MB', 'Megabyte'), u('GB', 'Gigabyte'), u('TB', 'Terabyte'),
        u('KiB', 'Kibibyte'), u('MiB', 'Mebibyte'), u('GiB', 'Gibibyte'),
      ],
    },
  ]
</script>

<script lang="ts">
  import { math } from '../engine/math'
  import { calculate, format, translateError } from '../engine/calc'
  import { formatUnitName } from '../engine/format'
  import { settings, calcSettings, converter } from '../lib/state.svelte'
  import Icon from './Icon.svelte'

  const category = $derived(CATEGORIES.find((c) => c.id === converter.category) ?? CATEGORIES[0])
  const pair = $derived(converter.pairs[category.id] ?? category.pair)

  type Conversion = { ok: true; text: string } | { ok: false; error: string }

  function convert(amount: string, from: string, to: string): Conversion {
    if (!amount.trim()) return { ok: false, error: '' }
    // the fields take expressions too: 2*3.5, 1/3
    const cs = calcSettings(settings)
    const r = calculate(amount, cs)
    if (!r.ok) return { ok: false, error: r.error }
    if (!math.isBigNumber(r.value)) return { ok: false, error: 'Enter a number' }
    try {
      const value = math.unit(r.value, from).toNumeric(to)
      // ten significant digits are plenty for a conversion unless a format is chosen
      const digits = settings.format === 'auto' ? Math.min(cs.digits, 10) : cs.digits
      return { ok: true, text: format(value, { ...cs, digits }) }
    } catch (e) {
      return { ok: false, error: translateError(e) }
    }
  }

  // the field you type in is the source; the other one shows the conversion
  const other = $derived(
    converter.side === 'a' ? convert(converter.amount, pair[0], pair[1]) : convert(converter.amount, pair[1], pair[0]),
  )
  const top = $derived(converter.side === 'a' ? converter.amount : other.ok ? other.text : '')
  const bottom = $derived(converter.side === 'b' ? converter.amount : other.ok ? other.text : '')
  const reference = $derived(convert('1', pair[0], pair[1]))

  function setPair(next: [string, string]) {
    converter.pairs[category.id] = next
  }

  function swap() {
    setPair([pair[1], pair[0]])
    converter.side = converter.side === 'a' ? 'b' : 'a'
  }

  function edit(side: 'a' | 'b', value: string) {
    converter.side = side
    converter.amount = value
  }

  const unitLabel = (code: string) => category.units.find((x) => x.u === code)?.label ?? code
</script>

<div class="converter">
  <div class="categories" role="tablist" aria-label="Quantity">
    {#each CATEGORIES as c (c.id)}
      <button role="tab" aria-selected={c.id === category.id} onclick={() => (converter.category = c.id)}>{c.label}</button>
    {/each}
  </div>

  <div class="card">
    {#snippet field(side: 'a' | 'b', value: string, unit: string, index: 0 | 1)}
      <div class="field" class:source={converter.side === side}>
        <label class="visually-hidden" for="amount-{side}">Value in {unitLabel(unit)}</label>
        <input
          id="amount-{side}"
          class="amount num"
          {value}
          inputmode="decimal"
          autocomplete="off"
          placeholder="0"
          oninput={(e) => edit(side, e.currentTarget.value)}
          onfocus={(e) => e.currentTarget.select()}
        />
        <label class="visually-hidden" for="unit-{side}">Unit</label>
        <select
          id="unit-{side}"
          value={unit}
          onchange={(e) => {
            const next: [string, string] = [...pair]
            next[index] = e.currentTarget.value
            setPair(next)
          }}
        >
          {#each category.units as x (x.u)}
            <option value={x.u}>{x.label} ({formatUnitName(x.u)})</option>
          {/each}
        </select>
      </div>
    {/snippet}

    {@render field('a', top, pair[0], 0)}

    <div class="middle">
      <span class="line" aria-hidden="true"></span>
      <button class="icon-btn swap" aria-label="Swap units" onclick={swap}><Icon name="swap" /></button>
      <span class="line" aria-hidden="true"></span>
    </div>

    {@render field('b', bottom, pair[1], 1)}

    <p class="note" aria-live="polite">
      {#if !other.ok && other.error}
        <span class="error">{other.error}</span>
      {:else if reference.ok}
        1 {formatUnitName(pair[0])} = {reference.text} {formatUnitName(pair[1])}
      {/if}
    </p>
  </div>
</div>

<style>
  /* the Tools tab around it provides the padding and the scrolling */
  .converter {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .categories {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .categories button {
    min-height: 40px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--key-fn);
    color: var(--muted);
    font-size: 15px;
  }

  .categories button[aria-selected='true'] {
    background: var(--text);
    color: var(--bg);
  }

  .card {
    padding: 16px;
    border-radius: 20px;
    background: var(--surface);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .amount {
    width: 100%;
    min-height: 56px;
    border: 0;
    border-radius: 12px;
    padding: 0 12px;
    background: transparent;
    font-size: 34px;
    text-align: right;
    color: var(--muted);
  }

  .source .amount {
    color: var(--text);
  }

  .amount:focus {
    outline: none;
    background: var(--key);
  }

  select {
    align-self: flex-end;
    max-width: 100%;
    min-height: 44px;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0 12px;
    background: var(--key);
    font-size: 16px;
  }

  .middle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
  }

  .line {
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .swap {
    background: var(--key-fn);
    border-radius: 50%;
  }

  .note {
    margin: 16px 4px 0;
    min-height: 24px;
    color: var(--muted);
    font-size: 15px;
    text-align: right;
  }

  .error {
    color: var(--error);
  }
</style>
