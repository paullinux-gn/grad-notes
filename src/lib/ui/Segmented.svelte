<script lang="ts" generics="T extends string | number">
  import Icon from '../components/Icon.svelte';

  let {
    options,
    value,
    onchange,
    label,
    iconOnly = false,
  }: {
    options: { value: T; label: string; icon?: string }[];
    value: T;
    onchange: (value: T) => void;
    label: string;
    /** Show only icons (labels become tooltips). */
    iconOnly?: boolean;
  } = $props();
</script>

<div class="segmented" class:icon-only={iconOnly} role="radiogroup" aria-label={label}>
  {#each options as o (o.value)}
    <button
      class:on={value === o.value}
      role="radio"
      aria-checked={value === o.value}
      aria-label={iconOnly ? o.label : undefined}
      data-tip={iconOnly ? o.label : undefined}
      onclick={() => onchange(o.value)}
    >
      {#if o.icon}<Icon name={o.icon} size={14} stroke={2} />{/if}
      {#if !iconOnly}{o.label}{/if}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: flex;
    flex: none;
    padding: 2px;
    border-radius: var(--r-sm);
    background: var(--fill-2);
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    /* 28px segments + 2px padding = a 32px control, like buttons and fields;
       8px − 2px = 6px corners, concentric with the track. */
    height: var(--h-sm);
    padding: 0 12px;
    border-radius: var(--r-xs);
    font-size: var(--fs-ui);
    font-weight: var(--fw-500);
    color: var(--text-2);
    white-space: nowrap;
    transition:
      background-color var(--dur) var(--ease),
      color var(--dur) var(--ease),
      box-shadow var(--dur) var(--ease);
  }
  .icon-only button {
    width: 32px;
    padding: 0;
  }
  button:hover:not(.on) {
    color: var(--text);
  }
  button.on {
    background: var(--knob);
    color: var(--text);
    box-shadow:
      0 0 0 0.5px var(--hairline),
      var(--shadow-sm);
  }
</style>
