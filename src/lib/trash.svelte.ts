/** One Trash for everything: pages, assignments, events and files. */

import { api } from './api';
import { library } from './library.svelte';
import { planner } from './planner.svelte';
import { store } from './store.svelte';
import { ui } from './ui.svelte';
import type { FileMeta, TrashTable } from './types';

export interface TrashItem {
  table: TrashTable;
  id: string;
  title: string;
  /** Where it came from, e.g. the parent page or the course. */
  origin: string | null;
  emoji?: string;
  icon: string;
  color?: string;
  file?: FileMeta;
  deletedAt: number;
}

export const TABLE_LABELS: Record<TrashTable, { one: string; many: string }> = {
  pages: { one: 'Page', many: 'Pages' },
  assignments: { one: 'Assignment', many: 'Assignments' },
  events: { one: 'Event', many: 'Events' },
  files: { one: 'File', many: 'Files' },
};

/** Everything in the trash, most recently deleted first. */
export function trashItems(): TrashItem[] {
  const items: TrashItem[] = [];
  for (const p of store.trash) {
    const path = store.ancestors(p.id);
    items.push({
      table: 'pages',
      id: p.id,
      title: p.title || 'Untitled',
      origin: path.length ? path.map((a) => a.title || 'Untitled').join(' › ') : null,
      emoji: p.icon || undefined,
      icon: 'page',
      deletedAt: p.deletedAt ?? 0,
    });
  }
  for (const a of planner.assignments) {
    if (!a.deletedAt) continue;
    items.push({
      table: 'assignments',
      id: a.id,
      title: a.title || 'Untitled',
      origin: a.courseId ? (planner.courseById.get(a.courseId)?.name ?? null) : null,
      icon: 'assignment',
      color: planner.courseColor(a.courseId),
      deletedAt: a.deletedAt,
    });
  }
  for (const e of planner.events) {
    if (!e.deletedAt) continue;
    items.push({
      table: 'events',
      id: e.id,
      title: e.title || 'Untitled',
      origin: null,
      icon: 'calendar',
      color: planner.eventColor(e),
      deletedAt: e.deletedAt,
    });
  }
  for (const f of library.files) {
    if (!f.deletedAt) continue;
    items.push({ table: 'files', id: f.id, title: f.name, origin: null, icon: 'file', file: f, deletedAt: f.deletedAt });
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function restoreItem(item: TrashItem) {
  if (item.table === 'pages') await store.restore(item.id);
  else if (item.table === 'files') await library.restore(item.id);
  else await planner.restore(item.table, item.id);
}

export async function deleteItem(item: TrashItem) {
  const extra = item.table === 'pages' ? ' and its sub-pages' : '';
  const ok = await ui.confirm({
    title: 'Delete Permanently?',
    message: `“${item.title}”${extra} will be deleted. You can’t undo this.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  if (item.table === 'pages') await store.deleteForever(item.id);
  else if (item.table === 'files') await library.deleteForever(item.id);
  else await planner.deleteForever(item.table, item.id);
}

export async function emptyTrash(count: number) {
  if (count === 0) return;
  const ok = await ui.confirm({
    title: 'Empty the Trash?',
    message: `${count} item${count === 1 ? '' : 's'} will be deleted, files included. You can’t undo this.`,
    confirmLabel: 'Empty Trash',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.emptyTrash();
    await Promise.all([store.refresh(), planner.load(), library.load()]);
  } catch (e) {
    ui.error(e);
  }
}
