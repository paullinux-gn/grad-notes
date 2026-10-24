/**
 * Long lists, a screenful at a time. A view renders the first `limit` rows
 * and puts `more` (an attachment) on an element after them; as that element
 * nears the end of its scroll area, `limit` grows. Ten thousand rows open as
 * fast as fifty, and the DOM only grows as far as you scroll.
 */
export class Progressive {
  limit = $state(0);

  constructor(
    private first = 60,
    private step = 150,
  ) {
    this.limit = first;
  }

  /** Back to the first screenful (the list was filtered or re-sorted). */
  reset() {
    this.limit = this.first;
  }

  /** Attachment for the element after the last rendered row. */
  more = (node: Element) => {
    // Checked against the list's own scroller on scroll. Anything above its
    // bottom edge plus a screen or so counts, including a sentinel already
    // scrolled past: a list in the middle of a sidebar (a big folder) must
    // still fill in when you drag straight to the end.
    let root: Element | null = node.parentElement;
    while (root && !/auto|scroll/.test(getComputedStyle(root).overflowY)) root = root.parentElement;
    const source: EventTarget = root ?? window;
    let frame = 0;
    const check = () => {
      frame = 0;
      const edge = (root ? root.getBoundingClientRect().bottom : innerHeight) + 1200;
      if (node.getBoundingClientRect().top > edge) return;
      this.limit += this.step;
      // The new rows render before the next frame; look again then.
      schedule();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    source.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      source.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  };
}

/** The first `limit` items across groups, in order; emptied groups are dropped. */
export function takeGrouped<G, T>(groups: G[], items: (g: G) => T[], limit: number): { group: G; items: T[] }[] {
  const out: { group: G; items: T[] }[] = [];
  let left = limit;
  for (const group of groups) {
    if (left <= 0) break;
    const list = items(group);
    if (!list.length) continue;
    const taken = list.length > left ? list.slice(0, left) : list;
    out.push({ group, items: taken });
    left -= taken.length;
  }
  return out;
}

/**
 * The first `limit` items, stretched to include the last item `keep`
 * accepts (the open page, so it's never hidden past the cut).
 */
export function sliceKeeping<T>(list: T[], limit: number, keep: (item: T) => boolean): T[] {
  if (list.length <= limit) return list;
  let end = limit;
  for (let i = list.length - 1; i >= limit; i--) {
    if (keep(list[i])) {
      end = i + 1;
      break;
    }
  }
  return list.slice(0, end);
}
