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

  export const CATEGORIES: Category[] = [
    {
      id: 'length',
      label: 'Длина',
      pair: ['км', 'миля'],
      units: [
        u('мм', 'Миллиметр'), u('см', 'Сантиметр'), u('м', 'Метр'), u('км', 'Километр'),
        u('дюйм', 'Дюйм'), u('фут', 'Фут'), u('ярд', 'Ярд'), u('миля', 'Миля'), u('мормиля', 'Морская миля'),
      ],
    },
    {
      id: 'mass',
      label: 'Масса',
      pair: ['кг', 'фунт'],
      units: [
        u('мг', 'Миллиграмм'), u('г', 'Грамм'), u('кг', 'Килограмм'), u('ц', 'Центнер'), u('т', 'Тонна'),
        u('унция', 'Унция'), u('фунт', 'Фунт'), u('карат', 'Карат'),
      ],
    },
    {
      id: 'temperature',
      label: 'Температура',
      pair: ['degC', 'degF'],
      units: [u('degC', 'Цельсий, °C'), u('degF', 'Фаренгейт, °F'), u('K', 'Кельвин, K')],
    },
    {
      id: 'area',
      label: 'Площадь',
      pair: ['ар', 'м^2'],
      units: [
        u('см^2', 'Кв. сантиметр'), u('м^2', 'Кв. метр'), u('ар', 'Сотка (ар)'), u('га', 'Гектар'),
        u('км^2', 'Кв. километр'), u('ft^2', 'Кв. фут'), u('акр', 'Акр'),
      ],
    },
    {
      id: 'volume',
      label: 'Объём',
      pair: ['л', 'галлон'],
      units: [
        u('мл', 'Миллилитр'), u('л', 'Литр'), u('м^3', 'Куб. метр'), u('floz', 'Жидкая унция (США)'),
        u('галлон', 'Галлон (США)'),
      ],
    },
    {
      id: 'speed',
      label: 'Скорость',
      pair: ['км/ч', 'м/с'],
      units: [u('км/ч', 'Километр в час'), u('м/с', 'Метр в секунду'), u('mi/h', 'Миля в час'), u('узел', 'Узел')],
    },
    {
      id: 'time',
      label: 'Время',
      pair: ['ч', 'мин'],
      units: [
        u('мс', 'Миллисекунда'), u('с', 'Секунда'), u('мин', 'Минута'), u('ч', 'Час'), u('сут', 'Сутки'),
        u('нед', 'Неделя'), u('мес', 'Месяц'), u('год', 'Год'),
      ],
    },
    {
      id: 'data',
      label: 'Данные',
      pair: ['ГБ', 'МБ'],
      units: [u('бит', 'Бит'), u('Б', 'Байт'), u('КБ', 'Килобайт'), u('МБ', 'Мегабайт'), u('ГБ', 'Гигабайт'), u('ТБ', 'Терабайт')],
    },
    {
      id: 'pressure',
      label: 'Давление',
      pair: ['атм', 'кПа'],
      units: [
        u('Па', 'Паскаль'), u('кПа', 'Килопаскаль'), u('МПа', 'Мегапаскаль'), u('бар', 'Бар'),
        u('атм', 'Атмосфера'), u('ммртст', 'Мм рт. ст.'), u('psi', 'Фунт на кв. дюйм'),
      ],
    },
    {
      id: 'energy',
      label: 'Энергия',
      pair: ['ккал', 'кДж'],
      units: [u('Дж', 'Джоуль'), u('кДж', 'Килоджоуль'), u('кал', 'Калория'), u('ккал', 'Килокалория'), u('kWh', 'Киловатт-час')],
    },
    {
      id: 'power',
      label: 'Мощность',
      pair: ['лс', 'кВт'],
      units: [u('Вт', 'Ватт'), u('кВт', 'Киловатт'), u('МВт', 'Мегаватт'), u('лс', 'Лошадиная сила')],
    },
    {
      id: 'angle',
      label: 'Углы',
      pair: ['градус', 'рад'],
      units: [u('градус', 'Градус'), u('рад', 'Радиан'), u('grad', 'Град (гон)')],
    },
  ]
</script>

<script lang="ts">
  import { math } from '../engine/math'
  import { calculate, format, translateError } from '../engine/calc'
  import { formatUnitName } from '../engine/format'
  import { CURRENCIES } from '../engine/currency'
  import { settings, converter, currency, refreshRates } from '../lib/state.svelte'
  import Icon from './Icon.svelte'

  const currencyCategory: Category = {
    id: 'currency',
    label: 'Валюты',
    pair: ['USD', 'RUB'],
    units: CURRENCIES.map((c) => u(c.code, `${c.name}, ${c.code}`)),
  }

  const categories = [currencyCategory, ...CATEGORIES]

  const category = $derived(categories.find((c) => c.id === converter.category) ?? categories[1])
  const pair = $derived(converter.pairs[category.id] ?? category.pair)
  const isCurrency = $derived(category.id === 'currency')

  type Conversion = { ok: true; text: string } | { ok: false; error: string }

  function convert(amount: string, from: string, to: string): Conversion {
    currency.version
    if (!amount.trim()) return { ok: false, error: '' }
    const r = calculate(amount, settings)
    if (!r.ok) return { ok: false, error: r.error }
    if (!math.isBigNumber(r.value)) return { ok: false, error: 'Введите число' }
    try {
      const value = math.unit(r.value, from).toNumeric(to)
      // ten significant digits are plenty for a conversion: 0,6213711922 миль, not 0,621371192237334
      return { ok: true, text: format(value, { ...settings, digits: Math.min(settings.digits, 10) }) }
    } catch (e) {
      if (isCurrency && !currency.rates) return { ok: false, error: 'Курсы ещё не загружены' }
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

  function selectCategory(id: string) {
    converter.category = id
    if (id === 'currency') refreshRates()
  }

  const unitLabel = (code: string) => category.units.find((x) => x.u === code)?.label ?? code

  const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
</script>

<div class="converter">
  <div class="categories" role="tablist" aria-label="Что переводить">
    {#each categories as c (c.id)}
      <button role="tab" aria-selected={c.id === category.id} onclick={() => selectCategory(c.id)}>{c.label}</button>
    {/each}
  </div>

  <div class="card">
    {#snippet field(side: 'a' | 'b', value: string, unit: string, index: 0 | 1)}
      <div class="field" class:source={converter.side === side}>
        <label class="visually-hidden" for="amount-{side}">Значение, {unitLabel(unit)}</label>
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
        <label class="visually-hidden" for="unit-{side}">Единица</label>
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
            <option value={x.u}>{x.label}</option>
          {/each}
        </select>
      </div>
    {/snippet}

    {@render field('a', top, pair[0], 0)}

    <div class="middle">
      <span class="line" aria-hidden="true"></span>
      <button class="icon-btn swap" aria-label="Поменять местами" onclick={swap}><Icon name="swap" /></button>
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

  {#if isCurrency}
    <div class="rates">
      <span>
        {#if currency.loading}
          Загружаю курсы…
        {:else if currency.error}
          <span class="error">{currency.error}</span>
        {:else if currency.rates}
          Курсы на {dateFormat.format(currency.rates.updated)}
        {:else}
          Курсов пока нет — нужен интернет
        {/if}
      </span>
      <button class="refresh" onclick={() => refreshRates(true)} disabled={currency.loading}>
        <Icon name="refresh" size={18} /> Обновить
      </button>
    </div>
  {/if}
</div>

<style>
  .converter {
    height: 100%;
    overflow-y: auto;
    padding: 8px 12px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 720px;
    margin: 0 auto;
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

  .rates {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 4px;
    color: var(--muted);
    font-size: 15px;
  }

  .refresh {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 12px;
    background: var(--key-fn);
    color: var(--text);
    flex: none;
  }
</style>
