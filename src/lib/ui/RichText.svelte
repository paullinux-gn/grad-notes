<script lang="ts">
  /**
   * Read-only inline content as the editor stores it (a flashcard side):
   * text with its marks, line breaks, formulas, and links shown as their titles.
   */
  import RichText from './RichText.svelte';
  import MathView from '../math/MathView.svelte';
  import { titleOf, type MentionKind } from '../editor/page-link';
  import type { RichNode } from '../types';

  let { nodes }: { nodes: RichNode[] } = $props();

  const MARKS: Record<string, string> = {
    bold: 'b',
    italic: 'i',
    underline: 'u',
    strike: 's',
    code: 'code',
    highlight: 'hl',
    link: 'link',
  };
  const classes = (n: RichNode) => (n.marks ?? []).map((m) => MARKS[m.type]).filter(Boolean).join(' ');
</script>

{#each nodes as n, i (i)}
  {#if n.type === 'text'}<span class={classes(n)}>{n.text}</span>
  {:else if n.type === 'hardBreak'}<br />
  {:else if n.type === 'inlineMath'}<MathView latex={String(n.attrs?.latex ?? '')} />
  {:else if n.type === 'mention' || n.type === 'pageLink'}<span class="ref">{titleOf(String(n.attrs?.id ?? ''), (n.attrs?.kind as MentionKind) ?? 'page')}</span>
  {:else if n.content}<RichText nodes={n.content} />
  {/if}
{/each}

<style>
  /* Heavier than whatever it sits in (a question is already semibold). */
  .b {
    font-weight: bolder;
  }
  .i {
    font-style: italic;
  }
  .u {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .s {
    text-decoration: line-through;
  }
  .u.s {
    text-decoration: underline line-through;
  }
  .code {
    padding: 1px 5px;
    border-radius: var(--r-xs);
    background: var(--fill-2);
    font-family: var(--font-mono);
    font-size: 0.86em;
  }
  .hl {
    padding: 0 2px;
    border-radius: 3px;
    background: var(--mark);
  }
  .link,
  .ref {
    text-decoration: underline;
    text-decoration-color: var(--text-4);
    text-underline-offset: 3px;
  }
</style>
