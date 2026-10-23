<script lang="ts" generics="T extends string | number | boolean">
  interface Props {
    label: string
    name: string
    options: { value: T; label: string }[]
    value: T
  }

  let { label, name, options, value = $bindable() }: Props = $props()
</script>

<fieldset>
  <legend>{label}</legend>
  <div class="options">
    {#each options as o (o.value)}
      <label class:active={value === o.value}>
        <input type="radio" {name} value={String(o.value)} checked={value === o.value} onchange={() => (value = o.value)} />
        {o.label}
      </label>
    {/each}
  </div>
</fieldset>

<style>
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
  }

  legend {
    padding: 0;
    margin-bottom: 8px;
    font-size: 15px;
    color: var(--muted);
  }

  .options {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 14px;
    background: var(--key-fn);
  }

  label {
    flex: 1;
    display: grid;
    place-items: center;
    min-height: 40px;
    padding: 0 8px;
    border-radius: 10px;
    font-size: 15px;
    text-align: center;
    cursor: pointer;
    color: var(--muted);
    transition: background-color var(--fast);
  }

  label.active {
    background: var(--key);
    color: var(--text);
    font-weight: 500;
    box-shadow: var(--shadow);
  }

  label:has(input:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
</style>
