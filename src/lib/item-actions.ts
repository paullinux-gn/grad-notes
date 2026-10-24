/** Context menus for assignments and events, shared by every view that shows them. */

import { calendar } from './calendar.svelte';
import { addDays, startOfWeek, todayISO } from './dates';
import { planner } from './planner.svelte';
import { store } from './store.svelte';
import { ui, type MenuItem } from './ui.svelte';

/** Opens an item's notes page, creating it first if needed. */
export async function openNotesPage(kind: 'assignment' | 'event', id: string) {
  const item = kind === 'assignment' ? planner.assignmentById.get(id) : planner.eventById.get(id);
  if (!item) return;
  const linked = item.pageId ? store.byId.get(item.pageId) : undefined;
  const pageId = linked && !linked.deletedAt ? linked.id : await planner.createNotesPage(kind, id);
  if (!pageId) return;
  ui.assignmentSheet = null;
  ui.eventSheet = null;
  store.open(pageId);
}

export function assignmentMenuItems(id: string): MenuItem[] {
  const a = planner.assignmentById.get(id);
  if (!a) return [];
  const today = todayISO();
  const nextWeek = addDays(startOfWeek(today, 1), 7);
  const due = (date: string | null) => () => planner.updateAssignment(id, { dueDate: date }, { immediate: true });
  const hasPage = !!(a.pageId && store.byId.get(a.pageId) && !store.byId.get(a.pageId)!.deletedAt);
  return [
    { label: 'Open', icon: 'assignment', action: () => planner.openAssignment(id) },
    {
      label: a.status === 'done' ? 'Mark as Not Done' : 'Mark as Done',
      icon: 'check',
      action: () => planner.toggleDone(id),
    },
    {
      label: 'In Progress',
      icon: 'clock',
      checked: a.status === 'doing',
      action: () => planner.updateAssignment(id, { status: a.status === 'doing' ? 'todo' : 'doing' }, { immediate: true }),
    },
    { separator: true },
    { header: 'Due' },
    { label: 'Today', icon: 'today', checked: a.dueDate === today, action: due(today) },
    { label: 'Tomorrow', icon: 'calendar', checked: a.dueDate === addDays(today, 1), action: due(addDays(today, 1)) },
    { label: 'Next Week', icon: 'calendar', checked: a.dueDate === nextWeek, action: due(nextWeek) },
    { label: 'No Due Date', icon: 'x', disabled: !a.dueDate, action: due(null) },
    { separator: true },
    { label: hasPage ? 'Open Notes Page' : 'Create Notes Page', icon: 'note', action: () => void openNotesPage('assignment', id) },
    {
      label: 'Show in Calendar',
      icon: 'calendar',
      disabled: !a.dueDate || store.view === 'calendar',
      action: () => a.dueDate && calendar.show(a.dueDate),
    },
    { separator: true },
    { label: 'Move to Trash', icon: 'trash', danger: true, action: () => void planner.trash('assignments', id) },
  ];
}

export function eventMenuItems(id: string, date?: string): MenuItem[] {
  const e = planner.eventById.get(id);
  if (!e) return [];
  const repeats = e.repeat !== 'none';
  const items: MenuItem[] = [{ label: 'Open', icon: 'calendar', action: () => planner.openEvent(id, date) }];
  if (date || !repeats) {
    // Notes for this session (a one-off event has just the one).
    const session = date ?? e.startDate;
    const has = !!planner.sessionPage(id, session);
    items.push({ label: has ? 'Open Notes' : 'Take Notes', icon: 'note', action: () => void planner.takeNotes(id, session) });
  } else {
    const hasPage = !!(e.pageId && store.byId.get(e.pageId) && !store.byId.get(e.pageId)!.deletedAt);
    items.push({ label: hasPage ? 'Open Notes Page' : 'Create Notes Page', icon: 'note', action: () => void openNotesPage('event', id) });
  }
  items.push({
    label: 'Show in Calendar',
    icon: 'calendar',
    disabled: store.view === 'calendar',
    action: () => calendar.show(date ?? e.startDate),
  });
  items.push({ separator: true });
  if (repeats && date) {
    items.push({ label: 'Skip This Date', icon: 'x', action: () => planner.skipDate(id, date) });
  }
  items.push({
    label: repeats ? 'Delete Series' : 'Move to Trash',
    icon: 'trash',
    danger: true,
    action: () => void planner.trash('events', id),
  });
  return items;
}
