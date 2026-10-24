import { mount } from 'svelte';
import './app.css';
import './lib/prefs.svelte';
import './lib/zoom.svelte';
import './lib/updates.svelte';
import App from './App.svelte';

// In a plain browser (UI development without the Rust side), fake the backend.
if (
  import.meta.env.DEV &&
  !('__TAURI_INTERNALS__' in window) &&
  !(window as Window & { __GRAD_NOTES_GTK_HOST__?: boolean }).__GRAD_NOTES_GTK_HOST__
) {
  await import('./dev-mock');
}

export default mount(App, { target: document.getElementById('app')! });
