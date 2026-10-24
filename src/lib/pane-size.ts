/**
 * Lets a view lay itself out for the space it has, not the window's: a
 * page pane (the main one, or split view's side) gets `--pane-w` and a
 * `data-below-N` attribute for each width N it's narrower than. Views use
 * `:global([data-below-720]) .x { … }` where they'd have used a media
 * query. (CSS container queries would do this, but they'd also make each
 * pane the frame for the fixed-position menus inside it.)
 */

const STEPS = [820, 720, 640, 560] as const;

export function paneSize(node: HTMLElement) {
  const apply = (width: number) => {
    node.style.setProperty('--pane-w', `${Math.round(width)}px`);
    for (const step of STEPS) node.toggleAttribute(`data-below-${step}`, width < step);
  };
  apply(node.clientWidth);
  const observer = new ResizeObserver(([entry]) => apply(entry.contentRect.width));
  observer.observe(node);
  return { destroy: () => observer.disconnect() };
}
