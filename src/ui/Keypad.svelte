<script lang="ts" module>
  export interface Key {
    id: string
    kind: 'num' | 'fn' | 'op' | 'eq' | 'sci'
    aria: string
    /** Plain label, or a label drawn as a formula, or an icon. */
    label?: string
    labelLatex?: string
    icon?: IconName
    /** Typed as if from the keyboard: digits, + − ( ) ! */
    typed?: string
    /** A LaTeX template inserted at the cursor: #@ takes what is before it, #? and #0 are empty boxes. */
    latex?: string
    /** After "=", the key continues from the answer instead of starting anew. */
    continues?: boolean
    pressed?: boolean
  }
</script>

<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte'
  import { latexMarkup } from '../lib/markup'
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

  const BOX = '\\square'

  const num = (d: string): Key => ({ id: d, label: d, typed: d, kind: 'num', aria: d })

  const basic = $derived<Key[]>([
    { id: 'clear', label: 'AC', kind: 'fn', aria: 'Очистить всё' },
    { id: 'paren', label: '( )', kind: 'fn', aria: 'Скобка' },
    { id: 'percent', label: '%', latex: '\\%', kind: 'fn', aria: 'Процент', continues: true },
    // keys use calculator symbols; the formula is typeset the Russian textbook way: 6 : 2, 3 · 4
    { id: 'div', label: '÷', latex: ':', kind: 'op', aria: 'Разделить', continues: true },
    num('7'), num('8'), num('9'),
    { id: 'mul', label: '×', latex: '\\cdot', kind: 'op', aria: 'Умножить', continues: true },
    num('4'), num('5'), num('6'),
    { id: 'sub', label: '−', typed: '-', kind: 'op', aria: 'Минус', continues: true },
    num('1'), num('2'), num('3'),
    { id: 'add', label: '+', typed: '+', kind: 'op', aria: 'Плюс', continues: true },
    num('0'),
    { id: 'decimal', label: decimal, kind: 'num', aria: decimal === ',' ? 'Запятая' : 'Точка' },
    { id: 'back', icon: 'backspace', kind: 'fn', aria: 'Стереть' },
    { id: 'equals', label: '=', kind: 'eq', aria: 'Равно' },
  ])

  const sci = (id: string, labelLatex: string, latex: string, aria: string, continues = false): Key => ({
    id,
    labelLatex,
    latex,
    aria,
    continues,
    kind: 'sci',
  })
  const fn = (id: string, name: string, aria: string): Key =>
    sci(id, `\\operatorname{${name}}`, `\\operatorname{${name}}\\left(#0\\right)`, aria)

  const sciKeys = $derived<Record<string, Key>>({
    left: { id: 'left', icon: 'chevron-left', kind: 'sci', aria: 'Курсор влево' },
    right: { id: 'right', icon: 'chevron-right', kind: 'sci', aria: 'Курсор вправо' },
    frac: inv
      ? sci('frac', `${BOX}\\frac{${BOX}}{${BOX}}`, '\\frac{#?}{#?}', 'Смешанное число')
      : sci('frac', `\\frac{${BOX}}{${BOX}}`, '\\frac{#@}{#?}', 'Дробь', true),
    root: inv
      ? sci('root', `\\sqrt[3]{${BOX}}`, '\\sqrt[3]{#0}', 'Кубический корень')
      : sci('root', `\\sqrt{${BOX}}`, '\\sqrt{#0}', 'Квадратный корень'),
    nroot: sci('nroot', `\\sqrt[n]{${BOX}}`, '\\sqrt[#?]{#0}', 'Корень n-й степени'),
    square: sci('square', `${BOX}^2`, '#@^{2}', 'Квадрат', true),
    pow: sci('pow', `${BOX}^{${BOX}}`, '#@^{#?}', 'Степень', true),
    recip: sci('recip', `\\frac{1}{${BOX}}`, '\\frac{1}{#@}', 'Обратное число', true),
    abs: sci('abs', `\\left|${BOX}\\right|`, '\\left|#0\\right|', 'Модуль'),
    pi: sci('pi', '\\pi', '\\pi', 'Пи'),
    e: sci('e', 'e', '\\exponentialE', 'Число e'),
    fact: { id: 'fact', labelLatex: 'x!', typed: '!', kind: 'sci', aria: 'Факториал', continues: true },
    degree: sci('degree', `${BOX}^{\\circ}`, '\\degree', 'Градусы', true),
    sin: inv ? fn('sin', 'arcsin', 'Арксинус') : fn('sin', 'sin', 'Синус'),
    cos: inv ? fn('cos', 'arccos', 'Арккосинус') : fn('cos', 'cos', 'Косинус'),
    tan: inv ? fn('tan', 'arctg', 'Арктангенс') : fn('tan', 'tg', 'Тангенс'),
    lg: inv ? sci('lg', `10^{${BOX}}`, '10^{#?}', 'Десять в степени') : fn('lg', 'lg', 'Десятичный логарифм'),
    ln: inv ? sci('ln', `e^{${BOX}}`, '\\exponentialE^{#?}', 'e в степени') : fn('ln', 'ln', 'Натуральный логарифм'),
    log: sci('log', `\\log_{${BOX}}`, '\\log_{#?}\\left(#?\\right)', 'Логарифм по основанию'),
    open: { id: 'open', label: '(', typed: '(', kind: 'sci', aria: 'Открыть скобку' },
    close: { id: 'close', label: ')', typed: ')', kind: 'sci', aria: 'Закрыть скобку', continues: true },
    inv: { id: 'inv', label: 'INV', kind: 'sci', aria: 'Обратные функции', pressed: inv },
    angle: {
      id: 'angle',
      label: angle === 'deg' ? 'град' : 'рад',
      kind: 'sci',
      aria: angle === 'deg' ? 'Углы в градусах, переключить на радианы' : 'Углы в радианах, переключить на градусы',
    },
    toggle: {
      id: 'toggle',
      icon: sciOpen ? 'chevron-up' : 'chevron-down',
      kind: 'sci',
      aria: sciOpen ? 'Скрыть функции' : 'Показать все функции',
      pressed: sciOpen,
    },
  })

  // phone: 6 columns, the first row (cursor, fraction, root, square) is always there;
  // wide screen: 4 columns next to the main keys
  const PHONE = [
    'left', 'frac', 'root', 'square', 'right', 'toggle',
    'pow', 'nroot', 'pi', 'e', 'fact', 'abs',
    'inv', 'angle', 'sin', 'cos', 'tan', 'log',
    'lg', 'ln', 'open', 'close', 'recip', 'degree',
  ]
  const WIDE = [
    'inv', 'angle', 'left', 'right',
    'frac', 'root', 'square', 'pow',
    'sin', 'cos', 'tan', 'nroot',
    'lg', 'ln', 'log', 'pi',
    'abs', 'recip', 'fact', 'e',
  ]

  const sciVisible = $derived(wide ? WIDE : sciOpen ? PHONE : PHONE.slice(0, 6))

  // keep the cursor in the formula: buttons must not take focus on mouse/touch
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
    {#if key.icon}
      <Icon name={key.icon} size={26} />
    {:else if key.labelLatex}
      <span class="formula" aria-hidden="true">{@html latexMarkup(key.labelLatex)}</span>
    {:else}
      {key.label}
    {/if}
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
    --sci-row: clamp(42px, 5.8dvh, 52px);
  }

  /* more rows of functions must fit on a small phone */
  .pad.sci-open {
    --row: clamp(44px, 6.6dvh, 76px);
    --sci-row: clamp(38px, 4.8dvh, 50px);
  }

  .pad.wide {
    grid-template-columns: 4fr 4fr;
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
    grid-template-columns: repeat(6, 1fr);
    grid-auto-rows: var(--sci-row);
    gap: 6px;
  }

  .wide .sci-keys {
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: var(--row);
    gap: 8px;
  }

  .basic-keys {
    grid-template-columns: repeat(4, 1fr);
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
    .basic-keys,
    .wide .sci-keys {
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

  .key {
    display: grid;
    place-items: center;
    min-width: 0;
    overflow: hidden;
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
    font-size: 17px;
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
    font-size: 19px;
  }

  .wide .key.sci.pressed {
    background: var(--key-op);
  }

  /* formulas on the keys: small enough for the empty boxes to fit */
  .formula {
    font-size: 16px;
    line-height: 1;
    pointer-events: none;
  }

  .wide .formula {
    font-size: 18px;
  }

  /* the empty boxes ("put a number here") are drawn lighter than the symbols */
  .formula :global(.ML__ams) {
    color: var(--muted);
  }
</style>
