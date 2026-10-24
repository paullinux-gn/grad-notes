/**
 * Calendar dates as local "YYYY-MM-DD" strings and times as "HH:MM", the
 * same shape they're stored in. Arithmetic goes through local Dates at noon,
 * so daylight-saving changes never move a day.
 */

import type { CalEvent } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local noon of a "YYYY-MM-DD" date. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Same day of the month `n` months later, clamped to the month's length. */
export function addMonths(iso: string, n: number): string {
  const d = parseDate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

export function weekday(iso: string): number {
  return parseDate(iso).getDay();
}

/** The first day of the week containing `iso`. */
export function startOfWeek(iso: string, weekStart: 0 | 1): string {
  return addDays(iso, -((weekday(iso) - weekStart + 7) % 7));
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** "HH:MM" → minutes after midnight. */
export function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  const t = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

export function nowTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// --------------------------------------------------------------- formatting

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const hourFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return timeFmt.format(new Date(2000, 0, 1, h, m));
}

/** "9 AM" style labels for the week view's hour gutter. */
export function formatHour(h: number): string {
  return hourFmt.format(new Date(2000, 0, 1, h));
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  const d = parseDate(iso);
  if (opts.year === undefined && d.getFullYear() !== new Date().getFullYear() && !opts.weekday) {
    opts = { ...opts, year: 'numeric' };
  }
  return d.toLocaleDateString(undefined, opts);
}

export function formatMonth(iso: string): { month: string; year: string } {
  const d = parseDate(iso);
  return {
    month: d.toLocaleDateString(undefined, { month: 'long' }),
    year: String(d.getFullYear()),
  };
}

/** Weekday labels starting at `weekStart`. */
export function weekdayNames(weekStart: 0 | 1, style: 'short' | 'narrow' | 'long' = 'short'): string[] {
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2023, 0, 1 + ((i + weekStart) % 7), 12).toLocaleDateString(undefined, { weekday: style }),
  );
}

/** "Today", "Tomorrow", "Friday", "Oct 20": how people say due dates. */
export function relativeDay(iso: string, today = todayISO()): string {
  const n = diffDays(today, iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return formatDate(iso, { weekday: 'long' });
  return formatDate(iso);
}

export function formatDue(date: string | null, time: string | null, today = todayISO()): string {
  if (!date) return 'No due date';
  const day = relativeDay(date, today);
  return time ? `${day}, ${formatTime(time)}` : day;
}

export type DueState = 'done' | 'overdue' | 'today' | 'soon' | 'later' | 'none';

/** Urgency of an assignment, for colouring its due label. */
export function dueState(
  a: { dueDate: string | null; dueTime: string | null; status: string },
  today = todayISO(),
  now = nowTime(),
): DueState {
  if (a.status === 'done') return 'done';
  if (!a.dueDate) return 'none';
  const n = diffDays(today, a.dueDate);
  if (n < 0 || (n === 0 && a.dueTime !== null && a.dueTime < now)) return 'overdue';
  if (n === 0) return 'today';
  if (n <= 2) return 'soon';
  return 'later';
}

// ---------------------------------------------------------------- recurrence

export interface Occurrence {
  event: CalEvent;
  /** Unique per occurrence (repeating events share an id). */
  key: string;
  start: string;
  end: string;
}

/** Occurrences of an event that overlap [from, to] (inclusive dates). */
export function occurrences(event: CalEvent, from: string, to: string): Occurrence[] {
  const span = diffDays(event.startDate, event.endDate);
  const out: Occurrence[] = [];
  const skip = new Set(event.exdates ?? []);
  const push = (start: string) => {
    const end = addDays(start, span);
    if (skip.has(start)) return;
    if (end >= from && start <= to) out.push({ event, key: `${event.id}:${start}`, start, end });
  };
  if (event.repeat === 'none') {
    push(event.startDate);
    return out;
  }
  const until = event.repeatUntil && event.repeatUntil < to ? event.repeatUntil : to;
  // Jump close to the range instead of stepping from a start years ago.
  let i = 0;
  if (event.repeat === 'daily') i = Math.max(0, diffDays(event.startDate, from) - span);
  if (event.repeat === 'weekly') i = Math.max(0, Math.floor((diffDays(event.startDate, from) - span) / 7));
  if (event.repeat === 'monthly') {
    const [fy, fm] = from.split('-').map(Number);
    const [sy, sm] = event.startDate.split('-').map(Number);
    i = Math.max(0, (fy - sy) * 12 + (fm - sm) - 1);
  }
  for (let guard = 0; guard < 500; guard++, i++) {
    const start =
      event.repeat === 'daily'
        ? addDays(event.startDate, i)
        : event.repeat === 'weekly'
          ? addDays(event.startDate, i * 7)
          : addMonths(event.startDate, i);
    if (start > until) break;
    // Monthly repeats skip months that don't have the day (no Feb 31st).
    if (event.repeat === 'monthly' && start.slice(8) !== event.startDate.slice(8)) continue;
    push(start);
  }
  return out;
}

export const REPEAT_LABELS: Record<string, string> = {
  none: 'Never',
  daily: 'Every Day',
  weekly: 'Every Week',
  monthly: 'Every Month',
};
