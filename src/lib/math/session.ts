/**
 * One open math editor at a time: under an inline formula as a popover, or
 * inside a math block. A click anywhere else finishes it.
 */

import { mount, unmount } from 'svelte';
import MathEditor, { type MathDone } from './MathEditor.svelte';

export type { MathDone };

export interface MathSession {
  /** Finishes from outside (keeps what was typed). */
  close: () => void;
  /** Re-anchors a popover after the formula it sits under changed size. */
  place: () => void;
}

let current: MathSession | null = null;

export function openMath(opts: {
  latex: string;
  display: boolean;
  /** The formula on the page; a popover sits under it. */
  anchor: HTMLElement;
  /** Where a block's editor goes (inline ones float in a popover). */
  host?: HTMLElement;
  onchange: (latex: string) => void;
  ondone: (latex: string, how: MathDone) => void;
}): MathSession {
  current?.close();
  const pop = !opts.host;
  const target = opts.host ?? document.body.appendChild(document.createElement('div'));
  if (pop) target.className = 'math-pop popover';

  let done = false;
  const place = () => {
    if (!pop) return;
    const r = opts.anchor.getBoundingClientRect();
    const w = target.offsetWidth;
    const h = target.offsetHeight;
    let left = Math.min(Math.max(8, r.left - 12), window.innerWidth - w - 8);
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8 && r.top - h - 8 > 8) top = r.top - h - 8;
    target.style.left = `${left}px`;
    target.style.top = `${top}px`;
  };

  const app = mount(MathEditor, {
    target,
    props: {
      latex: opts.latex,
      display: opts.display,
      onchange: (latex: string) => {
        opts.onchange(latex);
        requestAnimationFrame(place);
      },
      ondone: (latex: string, how: MathDone) => {
        if (done) return;
        done = true;
        cleanup();
        opts.ondone(latex, how);
      },
    },
  }) as { finish: (how?: MathDone) => void };

  const onDown = (e: MouseEvent) => {
    const t = e.target as Node;
    if (target.contains(t) || opts.anchor.contains(t)) return;
    app.finish('blur');
  };
  const onScroll = () => place();
  window.addEventListener('mousedown', onDown, true);
  if (pop) window.addEventListener('scroll', onScroll, true);
  place();

  function cleanup() {
    window.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('scroll', onScroll, true);
    // Let the last keystroke's handler finish before the component goes.
    queueMicrotask(() => {
      void unmount(app);
      if (pop) target.remove();
    });
    if (current === session) current = null;
  }

  const session: MathSession = { close: () => app.finish('blur'), place };
  current = session;
  return session;
}
