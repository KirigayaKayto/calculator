<script lang="ts" module>
  export interface Key {
    id: string
    label: string
    /** Text inserted at the cursor; keys without it are actions. */
    insert?: string
    kind: 'num' | 'fn' | 'op' | 'eq' | 'sci'
    aria?: string
    icon?: IconName
    pressed?: boolean
  }
</script>

<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte'
  import type { DecimalMark } from '../engine/input'
  import type { Angle } from '../engine/math'

  interface Props {
    onkey: (key: Key) => void
    decimal: DecimalMark
    angle: Angle
    inv: boolean
    sciOpen: boolean
    wide: boolean
  }

  let { onkey, decimal, angle, inv, sciOpen, wide }: Props = $props()

  const num = (d: string): Key => ({ id: d, label: d, insert: d, kind: 'num' })
  const op = (id: string, label: string, aria: string): Key => ({ id, label, insert: label, kind: 'op', aria })
  const sci = (id: string, label: string, insert: string, aria: string): Key => ({ id, label, insert, kind: 'sci', aria })

  const basic = $derived<Key[]>([
    { id: 'clear', label: 'AC', kind: 'fn', aria: 'Очистить всё' },
    { id: 'paren', label: '( )', kind: 'fn', aria: 'Скобка' },
    { id: 'percent', label: '%', insert: '%', kind: 'fn', aria: 'Процент' },
    op('div', '÷', 'Разделить'),
    num('7'), num('8'), num('9'),
    op('mul', '×', 'Умножить'),
    num('4'), num('5'), num('6'),
    op('sub', '−', 'Минус'),
    num('1'), num('2'), num('3'),
    op('add', '+', 'Плюс'),
    num('0'),
    { id: 'decimal', label: decimal, kind: 'num', aria: decimal === ',' ? 'Запятая' : 'Точка' },
    { id: 'back', label: '', icon: 'backspace', kind: 'fn', aria: 'Стереть' },
    { id: 'equals', label: '=', kind: 'eq', aria: 'Равно' },
  ])

  const sciKeys = $derived<Record<string, Key>>({
    root: inv ? sci('root', 'x²', '²', 'Квадрат') : sci('root', '√', '√(', 'Квадратный корень'),
    pow: sci('pow', 'xʸ', '^', 'Степень'),
    pi: sci('pi', 'π', 'π', 'Пи'),
    fact: sci('fact', 'x!', '!', 'Факториал'),
    recip: sci('recip', '1/x', '^(−1)', 'Обратное число'),
    toggle: {
      id: 'toggle',
      label: '',
      icon: sciOpen ? 'chevron-up' : 'chevron-down',
      kind: 'sci',
      aria: sciOpen ? 'Скрыть инженерные функции' : 'Показать инженерные функции',
      pressed: sciOpen,
    },
    inv: { id: 'inv', label: 'INV', kind: 'sci', aria: 'Обратные функции', pressed: inv },
    angle: {
      id: 'angle',
      label: angle === 'deg' ? 'град' : 'рад',
      kind: 'sci',
      aria: angle === 'deg' ? 'Углы в градусах, переключить на радианы' : 'Углы в радианах, переключить на градусы',
    },
    sin: inv ? sci('sin', 'sin⁻¹', 'asin(', 'Арксинус') : sci('sin', 'sin', 'sin(', 'Синус'),
    cos: inv ? sci('cos', 'cos⁻¹', 'acos(', 'Арккосинус') : sci('cos', 'cos', 'cos(', 'Косинус'),
    tan: inv ? sci('tan', 'tan⁻¹', 'atan(', 'Арктангенс') : sci('tan', 'tan', 'tan(', 'Тангенс'),
    lg: inv ? sci('lg', '10ˣ', '10^', 'Десять в степени') : sci('lg', 'lg', 'lg(', 'Десятичный логарифм'),
    ln: inv ? sci('ln', 'eˣ', 'e^', 'e в степени') : sci('ln', 'ln', 'ln(', 'Натуральный логарифм'),
    e: sci('e', 'e', 'e', 'Число e'),
    open: sci('open', '(', '(', 'Открыть скобку'),
    close: sci('close', ')', ')', 'Закрыть скобку'),
  })

  // phone: 5 columns, first row always visible; wide screen: 3 columns next to the main keys
  const PHONE = ['root', 'pow', 'pi', 'fact', 'toggle', 'inv', 'angle', 'sin', 'cos', 'tan', 'lg', 'ln', 'e', 'open', 'close']
  const WIDE = ['inv', 'angle', 'recip', 'sin', 'cos', 'tan', 'root', 'pow', 'fact', 'lg', 'ln', 'pi', 'open', 'close', 'e']

  const sciVisible = $derived(wide ? WIDE : sciOpen ? PHONE : PHONE.slice(0, 5))

  // keep the cursor in the expression field: buttons must not take focus on mouse/touch
  function keepFocus(e: MouseEvent) {
    e.preventDefault()
  }
</script>

{#snippet button(key: Key)}
  <button
    class="key {key.kind}"
    class:pressed={key.pressed}
    aria-label={key.aria}
    aria-pressed={key.pressed}
    onmousedown={keepFocus}
    onclick={() => onkey(key)}
  >
    {#if key.icon}<Icon name={key.icon} size={26} />{:else}{key.label}{/if}
  </button>
{/snippet}

<div class="pad" class:wide class:sci-open={sciOpen && !wide}>
  <div class="sci-keys">
    {#each sciVisible as id (id)}
      {@render button(sciKeys[id])}
    {/each}
  </div>
  <div class="basic-keys">
    {#each basic as key (key.id)}
      {@render button(key)}
    {/each}
  </div>
</div>

<style>
  .pad {
    display: grid;
    gap: 8px;
    padding: 8px 12px 12px;
    --row: clamp(52px, 8.6dvh, 76px);
    --sci-row: clamp(40px, 5.6dvh, 50px);
  }

  /* two more rows of scientific keys must fit on a small phone */
  .pad.sci-open {
    --row: clamp(44px, 7dvh, 76px);
    --sci-row: clamp(36px, 5dvh, 50px);
  }

  .pad.wide {
    grid-template-columns: 3fr 4fr;
    gap: 12px;
    padding: 12px 16px 16px;
    --row: clamp(52px, 9dvh, 72px);
  }

  .sci-keys,
  .basic-keys {
    display: grid;
    gap: 8px;
  }

  .sci-keys {
    grid-template-columns: repeat(5, 1fr);
    grid-auto-rows: var(--sci-row);
  }

  .wide .sci-keys {
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: var(--row);
  }

  /* phone on its side: five rows must fit under the display */
  @media (max-height: 520px) {
    .pad,
    .pad.wide {
      gap: 8px;
      padding: 6px 12px 8px;
      --row: clamp(32px, calc((100dvh - 190px) / 5), 60px);
    }
    .sci-keys,
    .basic-keys {
      gap: 6px;
    }
    .key {
      font-size: 20px;
    }
    .key.op,
    .key.eq {
      font-size: 24px;
    }
  }

  .basic-keys {
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: var(--row);
  }

  .key {
    display: grid;
    place-items: center;
    min-width: 0;
    border-radius: var(--radius);
    font-size: 26px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    background: var(--key);
    color: var(--text);
    box-shadow: var(--shadow);
    transition:
      background-color var(--fast),
      filter var(--fast);
  }

  .key:hover {
    filter: brightness(0.97);
  }

  .key:active {
    background: var(--key-active);
  }

  .key.fn {
    background: var(--key-fn);
    font-size: 22px;
  }

  .key.op {
    background: var(--key-op);
    font-size: 30px;
  }

  .key.eq {
    background: var(--key-eq);
    color: var(--key-eq-text);
    font-size: 32px;
  }

  .key.eq:active {
    filter: brightness(0.9);
  }

  .key.sci {
    background: transparent;
    box-shadow: none;
    font-size: 18px;
    color: var(--text);
    border-radius: var(--radius-sm);
  }

  .key.sci:hover {
    background: var(--key-fn);
    filter: none;
  }

  .key.sci:active {
    background: var(--key-active);
  }

  .key.sci.pressed {
    background: var(--key-fn);
    color: var(--accent-text);
    font-weight: 600;
  }

  .wide .key.sci {
    background: var(--key-fn);
    border-radius: var(--radius);
    font-size: 20px;
  }

  .wide .key.sci.pressed {
    background: var(--key-op);
  }
</style>
