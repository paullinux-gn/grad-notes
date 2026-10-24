/** Quick Capture: notes and to-dos go to the Inbox page, the rest to the planner. */

import { api } from './api';
import { calendar } from './calendar.svelte';
import { todayISO } from './dates';
import { planner } from './planner.svelte';
import { prefs } from './prefs.svelte';
import { store } from './store.svelte';
import { ui } from './ui.svelte';
import { lineIcon } from './page-icon';

export type CaptureKind = 'todo' | 'note' | 'assignment' | 'event';

interface JNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JNode[];
  text?: string;
}

/** Plain text of a document, one line per block (for search). */
function plainText(node: JNode): string {
  if (node.type === 'text') return node.text ?? '';
  const parts = (node.content ?? []).map(plainText);
  return ['doc', 'taskList', 'bulletList', 'orderedList'].includes(node.type) ? parts.join('\n') : parts.join('');
}

const paragraph = (text: string): JNode => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });

/** The Inbox page, created at the top of the sidebar the first time. */
async function inbox(): Promise<string | null> {
  const known = prefs.inboxId ? store.byId.get(prefs.inboxId) : undefined;
  if (known && !known.deletedAt) return known.id;
  const byName = store.roots.find((p) => p.title === 'Inbox');
  if (byName) {
    prefs.inboxId = byName.id;
    return byName.id;
  }
  const meta = await store.create(null, { open: false, title: 'Inbox', icon: lineIcon('inbox', 'blue'), index: 0 });
  if (!meta) return null;
  prefs.inboxId = meta.id;
  return meta.id;
}

async function addTodo(text: string): Promise<string | null> {
  const id = await inbox();
  if (!id) return null;
  const item: JNode = { type: 'taskItem', attrs: { checked: false }, content: [paragraph(text)] };
  // The Inbox is open: let its editor insert, so nothing is overwritten.
  if (store.view === 'page' && store.currentId === id) {
    window.dispatchEvent(new CustomEvent('td:append-todo', { detail: { pageId: id, text } }));
    return id;
  }
  await store.flush();
  const page = await api.getPage(id);
  let doc: JNode = { type: 'doc', content: [] };
  try {
    if (page.content) doc = JSON.parse(page.content);
  } catch {
    doc = { type: 'doc', content: [paragraph(page.content.replace(/<[^>]+>/g, ' ').trim())] };
  }
  const blocks = (doc.content ??= []);
  const last = blocks[blocks.length - 1];
  if (last?.type === 'paragraph' && !last.content?.length) blocks.pop();
  const tail = blocks[blocks.length - 1];
  if (tail?.type === 'taskList') tail.content = [...(tail.content ?? []), item];
  else blocks.push({ type: 'taskList', content: [item] });
  store.update(id, { content: JSON.stringify(doc), text: plainText(doc) }, { immediate: true });
  await store.flush();
  return id;
}

async function addNote(text: string): Promise<string | null> {
  const parent = await inbox();
  const [first, ...rest] = text.split('\n');
  const title = first.trim().slice(0, 120) || 'Untitled';
  const meta = await store.create(parent, { open: false, title });
  if (!meta) return null;
  const body = rest.join('\n').trim();
  if (body) {
    const doc: JNode = { type: 'doc', content: body.split('\n').map((l) => paragraph(l.trim())) };
    store.update(meta.id, { content: JSON.stringify(doc), text: plainText(doc) }, { immediate: true });
  }
  return meta.id;
}

/** Saves a capture and says where it went, with a way to open it. */
export async function capture(kind: CaptureKind, text: string, opts: { date?: string; time?: string } = {}): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;
  try {
    if (kind === 'todo') {
      const id = await addTodo(value);
      if (id) ui.toast('Added to Inbox', { label: 'Open', run: () => store.open(id) });
      return !!id;
    }
    if (kind === 'note') {
      const id = await addNote(value);
      if (id) ui.toast('Note saved to Inbox', { label: 'Open', run: () => store.open(id) });
      return !!id;
    }
    if (kind === 'assignment') {
      const a = await planner.addAssignment({ title: value, dueDate: opts.date || null, dueTime: opts.date && opts.time ? opts.time : null });
      if (a) ui.toast('Assignment added', { label: 'Open', run: () => planner.openAssignment(a.id) });
      return !!a;
    }
    const date = opts.date || todayISO();
    const ev = await planner.addEvent({ title: value, startDate: date, endDate: date, startTime: opts.time || null, endTime: opts.time || null });
    if (ev) {
      ui.toast('Event added', {
        label: 'Show',
        run: () => {
          calendar.show(ev.startDate);
          planner.openEvent(ev.id);
        },
      });
    }
    return !!ev;
  } catch (e) {
    ui.error(e);
    return false;
  }
}
