<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { fadeOut, pop } from '../motion';
  import { ui, type MenuItem, type MenuState } from '../ui.svelte';

  let { menu }: { menu: MenuState } = $props();

  let el: HTMLDivElement;
  // Positioned after the first render, once the menu's size is known.
  let pos = $state({ left: -9999, top: -9999, origin: 'top left' });
  let selected = $state(-1);

  type Action = Extract<MenuItem, { action: () => void }>;
  const actionable = $derived(
    menu.items.map((it, i) => ('action' in it && !it.disabled ? i : -1)).filter((i) => i >= 0),
  );

  onMount(() => {
    void tick().then(() => {
      // Keep the menu fully on screen.
      // Its laid-out size: the bounding box is still scaled down while it pops in.
      const r = { width: el.offsetWidth, height: el.offsetHeight };
      let left = menu.alignRight ? menu.x - r.width : menu.x;
      let top = menu.y;
      let vertical = 'top';
      if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8;
      if (top + r.height > window.innerHeight - 8) {
        // Flip above the anchor if it fits there, otherwise slide up just enough.
        const above = menu.y - r.height - 40;
        top = above >= 8 ? above : window.innerHeight - r.height - 8;
        vertical = above >= 8 ? 'bottom' : 'center';
      }
      pos = { left: Math.max(8, left), top: Math.max(8, top), origin: `${vertical} ${menu.alignRight ? 'right' : 'left'}` };
    });

    const onDown = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) ui.closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        ui.closeMenu();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const n = actionable.length;
        if (!n) return;
        const at = actionable.indexOf(selected);
        const next = e.key === 'ArrowDown' ? (at + 1) % n : (at - 1 + n) % n;
        selected = actionable[at === -1 && e.key === 'ArrowUp' ? n - 1 : next];
      } else if (e.key === 'Enter' && selected >= 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        run(menu.items[selected] as Action);
      }
    };
    const close = () => ui.closeMenu();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  });

  function run(item: Action) {
    if (item.disabled) return;
    ui.closeMenu();
    item.action();
  }
</script>

<div
  class="menu popover"
  bind:this={el}
  style:left="{pos.left}px"
  style:top="{pos.top}px"
  style:transform-origin={pos.origin}
  role="menu"
  in:pop|global
  out:fadeOut|global
>
  {#each menu.items as item, i}
    {#if 'separator' in item}
      <div class="sep" role="separator"></div>
    {:else if 'header' in item}
      <div class="header">{item.header}</div>
    {:else}
      <button
        class="item"
        class:danger={item.danger}
        class:selected={i === selected}
        disabled={item.disabled}
        role="menuitem"
        onmousedown={(e) => e.preventDefault()}
        onmousemove={() => (selected = i)}
        onmouseleave={() => (selected = -1)}
        onclick={() => run(item)}
      >
        {#if item.dot}<span class="icon"><span class="dot" style:--dot={item.dot}></span></span>{:else if item.icon}<span class="icon"><Icon name={item.icon} /></span>{/if}
        <span class="label">{item.label}</span>
        {#if item.hint}<span class="hint">{item.hint}</span>{/if}
        {#if item.checked}<span class="check"><Icon name="check" size={14} stroke={2.4} /></span>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 90;
    min-width: 224px;
    max-width: 320px;
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    /* 12px popover − 4px padding = 8px rows: concentric corners. */
    padding: 4px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: var(--h-sm);
    padding: 0 12px 0 8px;
    border-radius: var(--r-sm);
    font-size: var(--fs-body-ui);
    color: var(--text);
    text-align: left;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 20px;
    color: var(--text-2);
  }
  .item.selected:not(:disabled) {
    background: var(--fill-2);
  }
  .item.danger {
    color: var(--danger);
  }
  .item.danger .icon {
    color: var(--danger);
  }
  .item.danger.selected:not(:disabled) {
    background: var(--danger);
    color: #ffffff;
  }
  .item.danger.selected .icon,
  .item.danger.selected .hint {
    color: #ffffff;
  }
  .item:disabled {
    color: var(--text-4);
  }
  .item:disabled .icon {
    color: var(--text-4);
  }
  .label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hint {
    font-size: var(--fs-footnote);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .check {
    display: grid;
    color: var(--text);
  }
  .sep {
    height: 1px;
    margin: 4px 8px;
    background: var(--hairline);
  }
  .header {
    padding: 8px 8px 4px;
    font-size: var(--fs-caption);
    font-weight: var(--fw-600);
    letter-spacing: 0.01em;
    color: var(--text-3);
  }
</style>
