/** Shared popup renderer for "/" commands and "@" page links. */

import type { Editor, Range } from '@tiptap/core';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { mount, unmount } from 'svelte';
import SuggestionList from './SuggestionList.svelte';

export interface MenuEntry {
  id: string;
  title: string;
  description?: string;
  /** Icon name, short text label, or emoji for the glyph box. */
  icon?: string;
  label?: string;
  emoji?: string;
  hint?: string;
  group?: string;
  keywords?: string;
  run: (editor: Editor, range: Range) => void;
}

export interface SuggestionState {
  items: MenuEntry[];
  selected: number;
  rect: DOMRect | null;
  empty: string;
  pick: (index: number) => void;
}

export function suggestionRenderer(empty: string) {
  return () => {
    let target: HTMLDivElement | null = null;
    let component: ReturnType<typeof mount> | null = null;
    let command: ((item: MenuEntry) => void) | null = null;

    const ctl: SuggestionState = $state({
      items: [],
      selected: 0,
      rect: null,
      empty,
      pick: (i: number) => {
        const item = ctl.items[i];
        if (item && command) command(item);
      },
    });

    const sync = (props: SuggestionProps<MenuEntry, MenuEntry>) => {
      command = props.command;
      const changed = props.items.length !== ctl.items.length || props.items.some((it, i) => it.id !== ctl.items[i]?.id);
      ctl.items = props.items;
      if (changed) ctl.selected = 0;
      ctl.rect = props.clientRect?.() ?? null;
    };

    return {
      onStart(props: SuggestionProps<MenuEntry, MenuEntry>) {
        target = document.createElement('div');
        document.body.appendChild(target);
        component = mount(SuggestionList, { target, props: { ctl } });
        sync(props);
      },
      onUpdate(props: SuggestionProps<MenuEntry, MenuEntry>) {
        sync(props);
      },
      onKeyDown({ event }: SuggestionKeyDownProps) {
        const n = ctl.items.length;
        if (event.key === 'ArrowDown') {
          if (n) ctl.selected = (ctl.selected + 1) % n;
          return true;
        }
        if (event.key === 'ArrowUp') {
          if (n) ctl.selected = (ctl.selected - 1 + n) % n;
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          if (!n) return false;
          ctl.pick(ctl.selected);
          return true;
        }
        return false;
      },
      onExit() {
        if (component) void unmount(component);
        target?.remove();
        component = null;
        target = null;
      },
    };
  };
}

/** Lowercases and drops punctuation/spaces, so "todo" matches "To-do". */
const squash = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

function isSubsequence(needle: string, hay: string) {
  let i = 0;
  for (const c of hay) if (c === needle[i] && ++i === needle.length) return true;
  return needle.length === 0;
}

/** How well an entry's title/keywords match a (lowercased) query; 0 = not at all. */
export function matchScore(item: { title: string; keywords?: string }, q: string): number {
  const sq = squash(q);
  const title = item.title.toLowerCase();
  const words = `${title} ${item.keywords ?? ''}`.toLowerCase();
  if (title === q) return 100;
  if (title.startsWith(q) || (sq && squash(title).startsWith(sq))) return 80;
  if (words.split(/\s+/).some((w) => w.startsWith(q) || (sq && squash(w).startsWith(sq)))) return 60;
  if (words.includes(q)) return 40;
  if (sq.length > 1 && isSubsequence(sq, squash(title))) return 10;
  return 0;
}

/** Ranks entries by how well their title/keywords match the query. */
export function rank<T extends { title: string; keywords?: string }>(items: T[], query: string, limit = 50): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const score = matchScore(item, q);
    if (score) scored.push({ item, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}

/**
 * Ranks several kinds of entries (pages, assignments…), each kept together
 * under its heading, with the kind holding the best match listed first.
 */
export function rankGroups<T extends { title: string; keywords?: string }>(groups: [T[], number][], query: string): T[] {
  const q = query.trim().toLowerCase();
  return groups
    .map(([items, limit], order) => {
      const ranked = rank(items, q, limit);
      return { ranked, order, best: ranked.length ? matchScore(ranked[0], q) : 0 };
    })
    .sort((a, b) => b.best - a.best || a.order - b.order)
    .flatMap((g) => g.ranked);
}
