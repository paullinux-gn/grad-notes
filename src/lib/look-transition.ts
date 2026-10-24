/**
 * Changing how the app looks, animated: a new light or dark theme spreads
 * out in a circle from where you clicked; smaller changes (accent, font)
 * cross-fade. Uses View Transitions where the engine has them; otherwise,
 * or with reduced motion, the change is simply made.
 */

import { flushSync } from 'svelte';
import { prefs } from './prefs.svelte';
import { shouldReduceMotion } from './motion';

type ViewTransition = { ready: Promise<void>; finished: Promise<void> };
type WithTransitions = Document & { startViewTransition?: (update: () => void) => ViewTransition };

/** Where the last click or tap was: where a reveal starts from. */
let last: { x: number; y: number } | null = null;
window.addEventListener('pointerdown', (e) => (last = { x: e.clientX, y: e.clientY }), true);

/**
 * Applies `change` with an animation. A switch between light and dark
 * reveals in a circle from `from` (default: the last click; top centre for
 * keyboard shortcuts); anything else cross-fades.
 */
export function changeLook(change: () => void, from?: { x: number; y: number } | 'keyboard') {
  const doc = document as WithTransitions;
  if (shouldReduceMotion() || !doc.startViewTransition) return change();
  const before = prefs.resolvedTheme;
  const root = document.documentElement;
  let flipped = false;
  root.dataset.lookChange = 'fade';
  const t = doc.startViewTransition(() => {
    change();
    // Theme and font are applied by effects; they must land before the new snapshot.
    flushSync();
    flipped = prefs.resolvedTheme !== before;
    if (flipped) root.dataset.lookChange = 'reveal';
  });
  t.ready
    .then(() => {
      if (!flipped) return;
      const at = from === 'keyboard' || (!from && !last) ? { x: innerWidth / 2, y: 0 } : (from ?? last)!;
      const r = Math.hypot(Math.max(at.x, innerWidth - at.x), Math.max(at.y, innerHeight - at.y));
      root.animate(
        { clipPath: [`circle(0px at ${at.x}px ${at.y}px)`, `circle(${r}px at ${at.x}px ${at.y}px)`] },
        { duration: 620, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {});
  void t.finished.finally(() => delete root.dataset.lookChange);
}
