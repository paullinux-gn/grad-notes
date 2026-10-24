<script lang="ts">
  /**
   * One tooltip for the whole app. Any element with `data-tip` (and optional
   * `data-tip-key` for a shortcut) gets it. Like macOS: a short delay the
   * first time, then instant while moving between controls.
   */
  import { onMount, tick } from 'svelte';

  let el = $state<HTMLDivElement>();
  let text = $state('');
  let keys = $state('');
  let visible = $state(false);
  let pos = $state({ left: 0, top: 0, below: true });

  const DELAY = 550;
  const WARM_FOR = 700;

  onMount(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let warmUntil = 0;
    let anchor: HTMLElement | null = null;

    const hide = () => {
      clearTimeout(timer);
      if (visible) warmUntil = performance.now() + WARM_FOR;
      visible = false;
      anchor = null;
    };

    const show = async (target: HTMLElement) => {
      text = target.dataset.tip ?? '';
      keys = target.dataset.tipKey ?? '';
      if (!text) return;
      visible = true;
      await tick();
      if (!el || anchor !== target) return;
      const a = target.getBoundingClientRect();
      const t = el.getBoundingClientRect();
      let left = a.left + a.width / 2 - t.width / 2;
      left = Math.max(6, Math.min(left, window.innerWidth - t.width - 6));
      const below = a.bottom + 6 + t.height < window.innerHeight - 6;
      pos = { left, top: below ? a.bottom + 6 : a.top - t.height - 6, below };
    };

    const over = (e: PointerEvent) => {
      const target = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (target === anchor) return;
      clearTimeout(timer);
      if (!target) {
        hide();
        return;
      }
      if (visible) visible = false;
      anchor = target;
      const wait = performance.now() < warmUntil ? 0 : DELAY;
      timer = setTimeout(() => anchor === target && void show(target), wait);
    };

    const leaveWindow = (e: PointerEvent) => {
      if (!e.relatedTarget) hide();
    };

    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', leaveWindow);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('keydown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', leaveWindow);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  });
</script>

{#if visible}
  <div
    class="tip"
    class:above={!pos.below}
    bind:this={el}
    style:left="{pos.left}px"
    style:top="{pos.top}px"
    role="tooltip"
  >
    <span>{text}</span>
    {#if keys}<span class="keys">{keys}</span>{/if}
  </div>
{/if}

<style>
  .tip {
    position: fixed;
    z-index: 200;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
    padding: 0 8px;
    border-radius: var(--r-xs);
    background: color-mix(in srgb, var(--ink) 90%, transparent);
    -webkit-backdrop-filter: blur(16px);
    backdrop-filter: blur(16px);
    color: var(--on-ink);
    font-size: var(--fs-footnote);
    font-weight: var(--fw-500);
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 4px 14px -4px rgba(0, 0, 0, 0.3);
    animation: tip-in 140ms var(--ease-out);
  }
  .tip.above {
    animation-name: tip-in-above;
  }
  @keyframes tip-in {
    from {
      opacity: 0;
      translate: 0 -2px;
    }
  }
  @keyframes tip-in-above {
    from {
      opacity: 0;
      translate: 0 2px;
    }
  }
  .keys {
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }
</style>
