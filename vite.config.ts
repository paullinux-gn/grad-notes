import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';

/**
 * KaTeX's stylesheet offers each font as woff2, woff and ttf. Every engine
 * Tauri runs on reads woff2, so the other two (1 MB) are left out.
 */
function katexWoff2Only(): Plugin {
  return {
    name: 'katex-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/katex(\.min)?\.css$/.test(id)) return;
      return code.replace(/,\s*url\([^)]+\.woff\) format\("woff"\)|,\s*url\([^)]+\.ttf\) format\("truetype"\)/g, '');
    },
  };
}

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  // Relative assets work both from Tauri's bundled asset directory and the
  // GTK desktop app's local production build.
  base: './',
  plugins: [katexWoff2Only(), svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // WebView2 is evergreen Chromium, so ship modern JS untranspiled.
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
