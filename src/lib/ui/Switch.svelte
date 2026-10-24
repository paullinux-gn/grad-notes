<script lang="ts">
  let { on, label, onchange }: { on: boolean; label: string; onchange: () => void } = $props();
</script>

<button class="switch round" class:on onclick={onchange} role="switch" aria-checked={on} aria-label={label}>
  <span class="knob round"></span>
</button>

<style>
  .switch {
    position: relative;
    flex: none;
    width: 40px;
    height: var(--h-xs);
    border-radius: 12px;
    background: var(--fill-3);
    transition: background-color var(--dur) var(--ease);
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow:
      0 0 0 0.5px rgba(0, 0, 0, 0.04),
      0 2px 4px rgba(0, 0, 0, 0.15),
      0 1px 1px rgba(0, 0, 0, 0.06);
    transition:
      transform var(--dur-slow) var(--spring),
      background-color var(--dur) var(--ease);
  }
  .switch.on {
    background: var(--accent);
  }
  .switch.on .knob {
    transform: translateX(16px);
    background: var(--on-accent);
  }
</style>
