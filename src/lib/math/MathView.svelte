<script lang="ts">
  /** A formula typeset for reading (a flashcard side), outside the editor. */
  import { renderMath } from './katex';

  let { latex, display = false }: { latex: string; display?: boolean } = $props();
  let el: HTMLElement;

  $effect(() => renderMath(el, latex, display));
</script>

<span class="math-view" class:display bind:this={el}></span>

<style>
  .math-view.display {
    display: block;
    text-align: center;
  }
  :global(.math-view[data-pending]) {
    font-family: var(--font-mono);
    font-size: 0.86em;
    color: var(--text-3);
  }
</style>
