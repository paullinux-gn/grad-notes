<script lang="ts">
  /**
   * A page's icon: its emoji, or a line icon drawn at the surrounding font
   * size (1em) so it drops in wherever an emoji did.
   */
  import { colorVar } from '../colors';
  import { parseIcon } from '../page-icon';

  let { icon }: { icon: string | null | undefined } = $props();
  const parsed = $derived(parseIcon(icon));
</script>

{#if parsed?.kind === 'emoji'}{parsed.text}{:else if parsed?.kind === 'icon'}<svg
    class="page-glyph"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
    style:color={parsed.color ? colorVar(parsed.color) : null}
    aria-hidden="true">{@html parsed.def.svg}</svg
  >{/if}

