/** Calendar navigation, items per day, and drag-to-reschedule. */

import { addDays, diffDays, minutes, occurrences, todayISO, fromMinutes, type Occurrence } from './dates';
import { planner } from './planner.svelte';
import { store } from './store.svelte';
import { databases } from './databases.svelte';
import { colorVar } from './colors';
import { option } from './db/schema';
import type { Assignment, DbRow } from './types';

/** A database row placed on the calendar by a date property shown there. */
export interface RowItem {
  key: string;
  row: DbRow;
  dbId: string;
  propId: string;
  /** "HH:MM" on its first day, if it has a time. */
  time: string | null;
  color: string;
}

export interface DayItems {
  allDay: Occurrence[];
  timed: Occurrence[];
  due: Assignment[];
  rows: RowItem[];
}

/** What's being dragged between days (or onto the week's time grid). */
export interface DragItem {
  kind: 'event' | 'assignment' | 'row';
  id: string;
  /** The day it was picked up from; dropping shifts the item by the difference. */
  from: string;
  /** For events: the start of the session picked up (repeats move just that one). */
  session?: string;
  /** For database rows: the date property that placed it. */
  prop?: string;
}

class CalendarState {
  /** Any date inside the month or week on screen. */
  cursor = $state(todayISO());
  /** The day whose agenda shows beside the month. */
  selected = $state(todayISO());
  drag = $state<DragItem | null>(null);

  /** Opens the calendar on `date`. */
  show(date: string) {
    this.cursor = date;
    this.selected = date;
    store.go('calendar');
  }

  /** Moves the dragged item to `day` (and `time`, for timed events). */
  drop(day: string, time?: string) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.kind === 'assignment') {
      planner.updateAssignment(d.id, { dueDate: day, ...(time ? { dueTime: time } : {}) }, { immediate: true });
      return;
    }
    if (d.kind === 'row') {
      if (d.prop) databases.shiftDate(d.id, d.prop, diffDays(d.from, day));
      return;
    }
    const e = planner.eventById.get(d.id);
    if (!e) return;
    const repeats = e.repeat !== 'none';
    if (repeats && !d.session) return;
    // A repeat moves only the session that was dragged.
    const startDate = repeats ? d.session! : e.startDate;
    const endDate = addDays(startDate, diffDays(e.startDate, e.endDate));
    const shift = diffDays(d.from, day);
    const patch: Parameters<typeof planner.updateEvent>[1] = {
      startDate: addDays(startDate, shift),
      endDate: addDays(endDate, shift),
    };
    if (time && e.startTime) {
      // Keep the duration when moving to another time of day.
      const length = diffDays(startDate, endDate) * 1440 + minutes(e.endTime ?? e.startTime) - minutes(e.startTime);
      const start = minutes(time);
      const end = start + length;
      patch.startTime = time;
      patch.endDate = addDays(patch.startDate!, Math.floor(end / 1440));
      patch.endTime = fromMinutes(end % 1440);
    }
    if (shift === 0 && (!time || time === e.startTime)) return;
    if (repeats) void planner.moveSession(e.id, startDate, patch);
    else planner.updateEvent(d.id, patch, { immediate: true });
  }
}

export const calendar = new CalendarState();

/** Events (expanded repeats) and due assignments for each day in [from, to]. */
export function itemsByDay(from: string, to: string): Map<string, DayItems> {
  const map = new Map<string, DayItems>();
  const at = (day: string) => {
    let items = map.get(day);
    if (!items) map.set(day, (items = { allDay: [], timed: [], due: [], rows: [] }));
    return items;
  };
  for (const e of planner.liveEvents) {
    for (const occ of occurrences(e, from, to)) {
      const first = occ.start < from ? from : occ.start;
      const last = occ.end > to ? to : occ.end;
      for (let day = first; day <= last; day = addDays(day, 1)) {
        // Multi-day timed events read as all-day on the days in between.
        const timed = e.startTime && (occ.start === occ.end || day === occ.start);
        (timed ? at(day).timed : at(day).allDay).push(occ);
      }
    }
  }
  for (const [day, list] of planner.dueByDate) {
    if (day >= from && day <= to) at(day).due.push(...list);
  }
  for (const it of databases.calendarItems) {
    if (it.end < from || it.start > to) continue;
    const page = store.byId.get(it.row.id);
    if (!page || page.deletedAt) continue;
    // A row takes the colour of its first choice (a status, a select).
    let color = 'var(--text-3)';
    for (const p of databases.props(it.dbId)) {
      if (p.type !== 'select' && p.type !== 'status') continue;
      const o = option(p, databases.cell(it.row, p.id));
      if (o) {
        color = colorVar(o.color);
        break;
      }
    }
    for (let day = it.start < from ? from : it.start; day <= it.end && day <= to; day = addDays(day, 1)) {
      at(day).rows.push({ key: `${it.row.id}:${it.prop.id}`, row: it.row, dbId: it.dbId, propId: it.prop.id, time: day === it.start ? it.time : null, color });
    }
  }
  for (const items of map.values()) {
    items.rows.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
    items.timed.sort((a, b) => (a.event.startTime ?? '').localeCompare(b.event.startTime ?? ''));
    items.allDay.sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
    items.due.sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.dueTime ?? '24').localeCompare(b.dueTime ?? '24'));
  }
  return map;
}
