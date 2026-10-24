/**
 * Filtering, sorting, grouping, searching and summing up rows. Works on
 * plain values from a Ctx (the databases store provides it), so it knows
 * nothing about pages, courses or formulas.
 */

import { byKey } from './order';
import { CALC_LABELS, formatDay, formatNumber, isoDate, kindOf, toDate, type ValueKind } from './schema';
import type { CalcFn, DateValue, DbRow, FilterRule, Property, SortRule } from '../types';

/** A row's value, normalised by kind (see ValueKind):
 * text → string, number → number | null, option → id | null,
 * options/list → string[], date → DateValue | null, checkbox → boolean. */
export type Plain = string | number | boolean | string[] | DateValue | null;

export interface Ctx {
  get(row: DbRow, p: Property): Plain;
  text(row: DbRow, p: Property): string;
  kind(p: Property): ValueKind;
  /** Where an option (or course) sits in its list, for sorting and grouping. */
  rank(p: Property, key: string): number;
  /** Every group an option-like property can have, in order. */
  groups(p: Property): { key: string; label: string; color?: string }[];
  /** A value's name (an option's name, a course's name…). */
  label(p: Property, key: string): string;
  today: string;
}

// -------------------------------------------------------------------- filters

export interface OpInfo {
  op: string;
  label: string;
  /** What the filter's value is. */
  input: 'text' | 'number' | 'options' | 'date' | 'days' | 'none';
}

const EMPTY_OPS: OpInfo[] = [
  { op: 'isEmpty', label: 'is empty', input: 'none' },
  { op: 'isNotEmpty', label: 'is not empty', input: 'none' },
];

export const OPS: Record<ValueKind, OpInfo[]> = {
  text: [
    { op: 'contains', label: 'contains', input: 'text' },
    { op: 'notContains', label: 'does not contain', input: 'text' },
    { op: 'is', label: 'is', input: 'text' },
    { op: 'isNot', label: 'is not', input: 'text' },
    { op: 'startsWith', label: 'starts with', input: 'text' },
    { op: 'endsWith', label: 'ends with', input: 'text' },
    ...EMPTY_OPS,
  ],
  number: [
    { op: 'eq', label: '=', input: 'number' },
    { op: 'neq', label: '≠', input: 'number' },
    { op: 'gt', label: '>', input: 'number' },
    { op: 'lt', label: '<', input: 'number' },
    { op: 'gte', label: '≥', input: 'number' },
    { op: 'lte', label: '≤', input: 'number' },
    ...EMPTY_OPS,
  ],
  option: [
    { op: 'is', label: 'is', input: 'options' },
    { op: 'isNot', label: 'is not', input: 'options' },
    ...EMPTY_OPS,
  ],
  options: [
    { op: 'hasAny', label: 'has any of', input: 'options' },
    { op: 'hasAll', label: 'has all of', input: 'options' },
    { op: 'hasNone', label: 'has none of', input: 'options' },
    ...EMPTY_OPS,
  ],
  list: [{ op: 'hasAny', label: 'includes', input: 'options' }, { op: 'hasNone', label: 'does not include', input: 'options' }, ...EMPTY_OPS],
  date: [
    { op: 'is', label: 'is', input: 'date' },
    { op: 'before', label: 'is before', input: 'date' },
    { op: 'after', label: 'is after', input: 'date' },
    { op: 'onOrBefore', label: 'is on or before', input: 'date' },
    { op: 'onOrAfter', label: 'is on or after', input: 'date' },
    { op: 'pastDays', label: 'is within the past', input: 'days' },
    { op: 'nextDays', label: 'is within the next', input: 'days' },
    { op: 'thisWeek', label: 'is this week', input: 'none' },
    { op: 'thisMonth', label: 'is this month', input: 'none' },
    ...EMPTY_OPS,
  ],
  checkbox: [
    { op: 'checked', label: 'is checked', input: 'none' },
    { op: 'unchecked', label: 'is not checked', input: 'none' },
  ],
};

/** Relative days a date filter can use instead of a fixed date. */
export const RELATIVE_DAYS: { key: string; label: string; days: number }[] = [
  { key: 'today', label: 'Today', days: 0 },
  { key: 'tomorrow', label: 'Tomorrow', days: 1 },
  { key: 'yesterday', label: 'Yesterday', days: -1 },
  { key: 'oneWeekAgo', label: 'One week ago', days: -7 },
  { key: 'oneWeekFromNow', label: 'One week from now', days: 7 },
];

export function addDaysIso(day: string, n: number): string {
  const d = toDate(day);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** A filter's date: a fixed day, or a relative one worked out from today. */
export function resolveDay(value: unknown, today: string): string | null {
  if (typeof value !== 'string' || !value) return null;
  const rel = RELATIVE_DAYS.find((r) => r.key === value);
  return rel ? addDaysIso(today, rel.days) : value.slice(0, 10);
}

/** First day of the week holding `day` (Monday, or Sunday when weeks start then). */
function weekStart(day: string, sunday: boolean): string {
  const d = toDate(day);
  const back = sunday ? d.getDay() : (d.getDay() + 6) % 7;
  return addDaysIso(day, -back);
}

function isEmptyPlain(v: Plain): boolean {
  return v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0);
}

export function matches(row: DbRow, rule: FilterRule, p: Property, ctx: Ctx, weekStartsSunday = false): boolean {
  const kind = ctx.kind(p);
  const v = ctx.get(row, p);
  if (rule.op === 'isEmpty') return kind === 'checkbox' ? v !== true : isEmptyPlain(v);
  if (rule.op === 'isNotEmpty') return kind === 'checkbox' ? v === true : !isEmptyPlain(v);
  const want = rule.value;
  switch (kind) {
    case 'checkbox':
      return rule.op === 'checked' ? v === true : v !== true;
    case 'number': {
      const target = typeof want === 'number' ? want : want === '' || want === undefined || want === null ? null : Number(want);
      if (target === null || Number.isNaN(target)) return true;
      if (typeof v !== 'number') return rule.op === 'neq';
      switch (rule.op) {
        case 'eq':
          return v === target;
        case 'neq':
          return v !== target;
        case 'gt':
          return v > target;
        case 'lt':
          return v < target;
        case 'gte':
          return v >= target;
        case 'lte':
          return v <= target;
      }
      return true;
    }
    case 'option':
    case 'options':
    case 'list': {
      const ids = Array.isArray(want) ? (want as string[]) : typeof want === 'string' && want ? [want] : [];
      if (!ids.length) return true;
      const have = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [];
      switch (rule.op) {
        case 'is':
        case 'hasAny':
          return have.some((x) => ids.includes(x));
        case 'isNot':
        case 'hasNone':
          return !have.some((x) => ids.includes(x));
        case 'hasAll':
          return ids.every((x) => have.includes(x));
      }
      return true;
    }
    case 'date': {
      const day = v && typeof v === 'object' && !Array.isArray(v) ? (v as DateValue).start.slice(0, 10) : null;
      const end = v && typeof v === 'object' && !Array.isArray(v) ? ((v as DateValue).end ?? (v as DateValue).start).slice(0, 10) : null;
      if (rule.op === 'thisWeek' || rule.op === 'thisMonth') {
        if (!day) return false;
        if (rule.op === 'thisMonth') return day.slice(0, 7) === ctx.today.slice(0, 7);
        const from = weekStart(ctx.today, weekStartsSunday);
        return day >= from && day <= addDaysIso(from, 6);
      }
      if (rule.op === 'pastDays' || rule.op === 'nextDays') {
        const n = Math.max(0, Number(want) || 0);
        if (!day) return false;
        return rule.op === 'pastDays' ? day <= ctx.today && day >= addDaysIso(ctx.today, -n) : day >= ctx.today && day <= addDaysIso(ctx.today, n);
      }
      const target = resolveDay(want, ctx.today);
      if (!target) return true;
      if (!day || !end) return false;
      switch (rule.op) {
        case 'is':
          return day <= target && end >= target;
        case 'before':
          return day < target;
        case 'after':
          return day > target;
        case 'onOrBefore':
          return day <= target;
        case 'onOrAfter':
          return day >= target;
      }
      return true;
    }
    default: {
      const needle = String(want ?? '').trim().toLowerCase();
      if (!needle) return true;
      const hay = ctx.text(row, p).toLowerCase();
      switch (rule.op) {
        case 'contains':
          return hay.includes(needle);
        case 'notContains':
          return !hay.includes(needle);
        case 'is':
          return hay.trim() === needle;
        case 'isNot':
          return hay.trim() !== needle;
        case 'startsWith':
          return hay.startsWith(needle);
        case 'endsWith':
          return hay.trimEnd().endsWith(needle);
      }
      return true;
    }
  }
}

/** Whether a rule is complete enough to apply (an empty "contains" isn't). */
export function ruleActive(rule: FilterRule, p: Property | undefined, ctx: Ctx): boolean {
  if (!p) return false;
  const info = OPS[ctx.kind(p)].find((o) => o.op === rule.op);
  if (!info) return false;
  if (info.input === 'none') return true;
  const v = rule.value;
  return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '';
}

export function filterRows(
  rows: DbRow[],
  rules: FilterRule[],
  match: 'all' | 'any',
  props: Map<string, Property>,
  ctx: Ctx,
  weekStartsSunday = false,
): DbRow[] {
  const active = rules.filter((r) => ruleActive(r, props.get(r.prop), ctx));
  if (!active.length) return rows;
  return rows.filter((row) => {
    const test = (r: FilterRule) => matches(row, r, props.get(r.prop)!, ctx, weekStartsSunday);
    return match === 'any' ? active.some(test) : active.every(test);
  });
}

// ------------------------------------------------------------------- sorting

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** A comparable stand-in for a value; null sorts last either way. */
function sortKey(v: Plain, p: Property, ctx: Ctx): number | string | null {
  const kind = ctx.kind(p);
  if (v === null || v === '' || (Array.isArray(v) && !v.length)) return kind === 'checkbox' ? 0 : null;
  switch (kind) {
    case 'number':
      return typeof v === 'number' ? v : null;
    case 'checkbox':
      return v === true ? 1 : 0;
    case 'option':
      return ctx.rank(p, String(v));
    case 'date':
      return typeof v === 'object' && !Array.isArray(v) ? (v as DateValue).start : null;
    default:
      return null;
  }
}

/** A row's value for sorting by a property: a number, text, or null (always last). */
function sortValue(row: DbRow, p: Property, ctx: Ctx, textual: boolean): string | number | null {
  return textual ? ctx.text(row, p) || null : sortKey(ctx.get(row, p), p, ctx);
}

function compareValues(x: string | number | null, y: string | number | null, desc: boolean): number {
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  const c = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
  return desc ? -c : c;
}

const isTextual = (kind: string) => kind === 'text' || kind === 'options' || kind === 'list';

export function compareRows(a: DbRow, b: DbRow, rule: SortRule, p: Property, ctx: Ctx): number {
  const textual = isTextual(ctx.kind(p));
  return compareValues(sortValue(a, p, ctx, textual), sortValue(b, p, ctx, textual), rule.dir === 'desc');
}

/**
 * Rows in order. Each row's sort values are worked out once, not at every
 * comparison: tens of thousands of rows make hundreds of thousands of those.
 */
export function sortRows(rows: DbRow[], sorts: SortRule[], props: Map<string, Property>, ctx: Ctx): DbRow[] {
  const rules = sorts.filter((s) => props.has(s.prop));
  if (!rules.length) return [...rows].sort(byKey);
  const specs = rules.map((r) => {
    const p = props.get(r.prop)!;
    return { p, desc: r.dir === 'desc', textual: isTextual(ctx.kind(p)) };
  });
  const keyed = rows.map((row) => ({ row, keys: specs.map((s) => sortValue(row, s.p, ctx, s.textual)) }));
  keyed.sort((a, b) => {
    for (let i = 0; i < specs.length; i++) {
      const c = compareValues(a.keys[i], b.keys[i], specs[i].desc);
      if (c) return c;
    }
    return byKey(a.row, b.row);
  });
  return keyed.map((k) => k.row);
}

/**
 * Rows just added in a view go first (newest on top) until the view is left:
 * they're on screen at once and stay put while being filled in, however long
 * the list or wherever the sort would put them.
 */
export function pinFirst(rows: DbRow[], ids: string[]): DbRow[] {
  if (!ids.length) return rows;
  const at = new Map(ids.map((id, i) => [id, i]));
  const top = rows.filter((r) => at.has(r.id)).sort((a, b) => at.get(a.id)! - at.get(b.id)!);
  return top.length ? [...top, ...rows.filter((r) => !at.has(r.id))] : rows;
}

// ------------------------------------------------------------------ searching

export function searchRows(rows: DbRow[], query: string, props: Property[], ctx: Ctx, hay?: (row: DbRow) => string): DbRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  const text = hay ?? ((row: DbRow) => props.map((p) => ctx.text(row, p)).join('\n').toLowerCase());
  return rows.filter((row) => {
    const h = text(row);
    return words.every((w) => h.includes(w));
  });
}

// ------------------------------------------------------------------- grouping

export interface Group {
  key: string;
  label: string;
  color?: string;
  rows: DbRow[];
}

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

/** Properties a view can be grouped by. */
export function canGroup(p: Property): boolean {
  return !['title', 'id', 'rollup', 'created', 'edited', 'files', 'button'].includes(p.type);
}

export function groupRows(rows: DbRow[], p: Property, ctx: Ctx): Group[] {
  const kind = ctx.kind(p);
  const empty: Group = { key: '', label: `No ${p.name || 'value'}`, rows: [] };
  if (kind === 'option' || kind === 'options') {
    const groups = ctx.groups(p).map((g) => ({ ...g, rows: [] as DbRow[] }));
    const byKey = new Map(groups.map((g) => [g.key, g]));
    for (const row of rows) {
      const v = ctx.get(row, p);
      const keys = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [];
      let placed = false;
      for (const k of keys) {
        let g = byKey.get(k);
        if (!g) {
          // A value whose option was deleted (or a tag with no list): its own group.
          g = { key: k, label: ctx.label(p, k), rows: [] };
          byKey.set(k, g);
          groups.push(g);
        }
        g.rows.push(row);
        placed = true;
      }
      if (!placed) empty.rows.push(row);
    }
    return [empty, ...groups];
  }
  if (kind === 'checkbox') {
    const off: Group = { key: 'false', label: 'Not checked', rows: [] };
    const on: Group = { key: 'true', label: 'Checked', rows: [] };
    for (const row of rows) (ctx.get(row, p) === true ? on : off).rows.push(row);
    return [off, on];
  }
  const map = new Map<string, Group>();
  for (const row of rows) {
    const v = ctx.get(row, p);
    let key = '';
    let label = '';
    if (kind === 'date') {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        key = (v as DateValue).start.slice(0, 7);
        label = monthFmt.format(toDate(`${key}-01`));
      }
    } else if (Array.isArray(v)) {
      // Lists (relations): one group per item.
      for (const item of v) {
        const g = map.get(item) ?? { key: item, label: ctx.label(p, item), rows: [] };
        g.rows.push(row);
        map.set(item, g);
      }
      if (v.length) continue;
    } else {
      key = ctx.text(row, p).trim();
      label = key;
    }
    if (!key) {
      empty.rows.push(row);
      continue;
    }
    const g = map.get(key) ?? { key, label, rows: [] };
    g.rows.push(row);
    map.set(key, g);
  }
  const groups = [...map.values()].sort((a, b) =>
    kind === 'number' ? Number(a.key) - Number(b.key) : kind === 'date' ? (a.key < b.key ? -1 : 1) : collator.compare(a.label, b.label),
  );
  return kind === 'date' ? [...groups, empty] : [empty, ...groups];
}

// ---------------------------------------------------------------- summaries

/** A column's summary, ready to show ("12", "$1,204.50", "45%"). */
export function calculate(rows: DbRow[], p: Property, fn: CalcFn, ctx: Ctx): string {
  if (fn === 'none') return '';
  const kind = ctx.kind(p);
  const values = rows.map((r) => ctx.get(r, p));
  const filled = values.filter((v) => !isEmptyPlain(v));
  const pct = (n: number) => (rows.length ? `${Math.round((n / rows.length) * 1000) / 10}%` : '0%');
  const numFmt = (n: number) => (p.type === 'number' || p.type === 'formula' || p.type === 'rollup' ? formatNumber(n, p.config) : formatNumber(n));
  switch (fn) {
    case 'count':
      return String(rows.length);
    case 'countValues':
      return String(filled.length);
    case 'countEmpty':
      return String(rows.length - filled.length);
    case 'countUnique':
      return String(new Set(rows.filter((r) => !isEmptyPlain(ctx.get(r, p))).flatMap((r) => (kind === 'options' || kind === 'list' ? (ctx.get(r, p) as string[]) : [ctx.text(r, p)]))).size);
    case 'percentFilled':
      return pct(filled.length);
    case 'percentEmpty':
      return pct(rows.length - filled.length);
    case 'checked':
      return String(values.filter((v) => v === true).length);
    case 'unchecked':
      return String(values.filter((v) => v !== true).length);
    case 'percentChecked':
      return pct(values.filter((v) => v === true).length);
  }
  if (kind === 'date') {
    const days = filled.map((v) => (v as DateValue).start).sort();
    if (!days.length) return '';
    if (fn === 'earliest') return formatDay(days[0]);
    if (fn === 'latest') return formatDay(days[days.length - 1]);
    if (fn === 'range') {
      const span = Math.round((toDate(days[days.length - 1].slice(0, 10)).getTime() - toDate(days[0].slice(0, 10)).getTime()) / 86_400_000);
      return `${span} day${span === 1 ? '' : 's'}`;
    }
    return '';
  }
  const nums = filled.filter((v): v is number => typeof v === 'number');
  if (!nums.length) return '';
  switch (fn) {
    case 'sum':
      return numFmt(nums.reduce((a, b) => a + b, 0));
    case 'average':
      return numFmt(nums.reduce((a, b) => a + b, 0) / nums.length);
    case 'median': {
      const s = [...nums].sort((a, b) => a - b);
      const mid = s.length >> 1;
      return numFmt(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
    }
    case 'min':
      return numFmt(nums.reduce((a, b) => Math.min(a, b), Infinity));
    case 'max':
      return numFmt(nums.reduce((a, b) => Math.max(a, b), -Infinity));
    case 'range':
      return numFmt(nums.reduce((a, b) => Math.max(a, b), -Infinity) - nums.reduce((a, b) => Math.min(a, b), Infinity));
  }
  return '';
}

/** "Sum", "Count all"… shown before a summary. */
export const calcLabel = (fn: CalcFn) => CALC_LABELS[fn];

export { kindOf, isoDate };
