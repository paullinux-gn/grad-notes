<script lang="ts">
  /** The round completion check used for assignments everywhere. */
  let {
    done,
    color = 'var(--accent)',
    size = 18,
    label,
    ontoggle,
  }: { done: boolean; color?: string; size?: number; label: string; ontoggle: () => void } = $props();
</script>

<button
  class="check round"
  class:done
  style:--c={color}
  style:--mark={color === 'var(--accent)' ? 'var(--check)' : 'var(--check-white)'}
  style:--s="{size}px"
  role="checkbox"
  aria-checked={done}
  aria-label={label}
  onclick={(e) => {
    e.stopPropagation();
    ontoggle();
  }}
></button>

<style>
  .check {
    flex: none;
    position: relative;
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 70%, var(--text-3));
    transition:
      background-color var(--dur) var(--ease),
      box-shadow var(--dur) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .check:hover {
    background: color-mix(in srgb, var(--c) 14%, transparent);
  }
  .check:active {
    transform: scale(0.88);
  }
  .check.done {
    /* The accent can be light (Graphite in dark mode), so it gets a matching mark. */
    background: var(--c) var(--mark) center / 72% no-repeat;
    box-shadow: inset 0 0 0 1.5px var(--c);
    animation: check-pop var(--dur-slow) var(--spring);
  }
</style>
