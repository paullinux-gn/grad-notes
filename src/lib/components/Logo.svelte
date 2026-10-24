<script lang="ts">
  /**
   * The app's mark in the current theme: a tile in the text colour with the
   * hands cut from the background.
   */
  import { FRAME, HANDS } from '../logo-art';

  let { size = 20, class: klass = '' }: { size?: number; class?: string } = $props();
  const uid = $props.id();
  const clip = `logo-${uid}`;
</script>

<svg class="logo {klass}" width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
  <defs><clipPath id={clip}><rect x="64" y="64" width="896" height="896" rx="230" /></clipPath></defs>
  <rect x="64" y="64" width="896" height="896" rx="230" fill="var(--logo-tile, var(--text))" />
  <g clip-path="url(#{clip})">
    <g transform={FRAME}>
      <path d={HANDS} fill="var(--logo-hands, var(--bg))" />
    </g>
  </g>
</svg>
