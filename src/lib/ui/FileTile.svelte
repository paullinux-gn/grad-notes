<script lang="ts">
  /** A file's thumbnail (images) or its type icon on a tinted tile. */
  import Icon from '../components/Icon.svelte';
  import { KINDS, extOf, fileKind, fileSrc } from '../library.svelte';
  import type { FileMeta } from '../types';

  let { file, size = 32, thumb = true }: { file: FileMeta; size?: number; thumb?: boolean } = $props();

  const kind = $derived(fileKind(file));
  const style = $derived(KINDS[kind]);
  const showThumb = $derived(thumb && kind === 'image' && !file.missing);
  const ext = $derived(extOf(file.name).slice(0, 4).toUpperCase());
  let broken = $state(false);
</script>

<span class="tile" style:--k={style.color} style:--size="{size}px" class:thumb={showThumb && !broken}>
  {#if showThumb && !broken}
    <img src={fileSrc(file)} alt="" loading="lazy" draggable="false" onerror={() => (broken = true)} />
  {:else}
    <Icon name={file.missing ? 'info' : style.icon} size={Math.round(size * 0.5)} stroke={1.9} />
    {#if size >= 56 && ext}<span class="ext">{ext}</span>{/if}
  {/if}
</span>

<style>
  .tile {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 2px;
    width: var(--size);
    height: var(--size);
    /* About a quarter of the size, rounded to whole pixels. */
    border-radius: round(calc(var(--size) * 0.24), 1px);
    background: color-mix(in srgb, var(--k) 14%, transparent);
    color: var(--k);
    overflow: hidden;
  }
  .tile.thumb {
    background: var(--fill);
    box-shadow: inset 0 0 0 0.5px var(--hairline);
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .ext {
    font-size: 10px;
    font-weight: var(--fw-650);
    letter-spacing: 0.04em;
  }
</style>
