<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../components/Icon.svelte';

  let {
    icon,
    title,
    text,
    compact = false,
    children,
  }: { icon: string; title: string; text?: string; compact?: boolean; children?: Snippet } = $props();
</script>

<!-- Full size: centred, for an empty view. Compact: one row inside a list
     group, lined up with the rows that will replace it. -->
<div class="empty" class:compact>
  <span class="badge"><Icon name={icon} size={compact ? 16 : 22} /></span>
  <span class="copy">
    <strong>{title}</strong>
    {#if text}<span class="text">{text}</span>{/if}
  </span>
  {#if children}<div class="actions">{@render children()}</div>{/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 36px 24px 40px;
    text-align: center;
    font-size: var(--fs-ui);
    color: var(--text-3);
  }
  .copy {
    display: contents;
  }
  .badge {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    margin-bottom: 10px;
    border-radius: var(--r-lg);
    background: var(--fill);
    color: var(--tint);
  }
  strong {
    font-size: var(--fs-callout);
    line-height: 20px;
    font-weight: var(--fw-600);
    color: var(--text);
  }
  .text {
    max-width: 300px;
    line-height: 18px;
    text-wrap: balance;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }

  .compact {
    flex-direction: row;
    gap: 12px;
    min-height: 60px;
    padding: 10px 16px;
    text-align: left;
  }
  .compact .badge {
    flex: none;
    width: 28px;
    height: 28px;
    margin: 0;
    border-radius: var(--r-sm);
    color: var(--text-3);
  }
  .compact .copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .compact strong {
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-500);
  }
  .compact .text {
    max-width: none;
    font-size: var(--fs-footnote);
    line-height: 16px;
    text-wrap: pretty;
  }
  .compact .actions {
    flex: none;
    margin: 0;
  }
</style>
