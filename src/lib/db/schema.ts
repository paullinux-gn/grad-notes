/**
 * Property types: what each one is called, how its values look as text, and
 * how text (typed, pasted or imported) becomes a value.
 */

import { nextColor } from '../colors';
import type { CalcFn, DateValue, NumberFormat, Property, PropertyConfig, PropertyType, RollupFn, SelectOption } from '../types';

export interface TypeInfo {
  type: PropertyType;
  label: string;
  icon: string;
  hint: string;
  group: 'Basic' | 'Grad Notes' | 'Advanced' | 'Automatic';
}

export const TYPES: TypeInfo[] = [
  { type: 'title', label: 'Title', icon: 'text', hint: 'The row’s name', group: 'Basic' },
  { type: 'text', label: 'Text', icon: 'text', hint: 'Notes, names, anything', group: 'Basic' },
  { type: 'number', label: 'Number', icon: 'hash', hint: 'Amounts, prices, scores', group: 'Basic' },
  { type: 'select', label: 'Select', icon: 'select', hint: 'One choice from a list', group: 'Basic' },
  { type: 'multiSelect', label: 'Multi-select', icon: 'list', hint: 'Several choices', group: 'Basic' },
  { type: 'status', label: 'Status', icon: 'status', hint: 'To do, in progress, done', group: 'Basic' },
  { type: 'date', label: 'Date', icon: 'calendar', hint: 'A day, with a time if you like', group: 'Basic' },
  { type: 'checkbox', label: 'Checkbox', icon: 'check-square', hint: 'Yes or no', group: 'Basic' },
  { type: 'url', label: 'URL', icon: 'link', hint: 'A web address', group: 'Basic' },
  { type: 'email', label: 'Email', icon: 'mail', hint: 'An email address', group: 'Basic' },
  { type: 'phone', label: 'Phone', icon: 'phone', hint: 'A phone number', group: 'Basic' },
  { type: 'course', label: 'Course', icon: 'book', hint: 'One of your courses', group: 'Grad Notes' },
  { type: 'tags', label: 'Tags', icon: 'tag', hint: 'Your tags, shared with pages', group: 'Grad Notes' },
  { type: 'files', label: 'Files', icon: 'paperclip', hint: 'Files from your library', group: 'Grad Notes' },
  { type: 'relation', label: 'Relation', icon: 'relation', hint: 'Links to rows of a database', group: 'Advanced' },
  { type: 'rollup', label: 'Rollup', icon: 'sigma', hint: 'Totals from related rows', group: 'Advanced' },
  { type: 'formula', label: 'Formula', icon: 'function', hint: 'Calculated from other properties', group: 'Advanced' },
  { type: 'button', label: 'Button', icon: 'pointer', hint: 'Does something in one click', group: 'Advanced' },
  { type: 'id', label: 'ID', icon: 'hash', hint: 'A number for each row (TASK-12)', group: 'Automatic' },
  { type: 'created', label: 'Created time', icon: 'clock', hint: 'When the row was added', group: 'Automatic' },
  { type: 'edited', label: 'Last edited', icon: 'clock', hint: 'When the row last changed', group: 'Automatic' },
];

export const typeInfo = (t: PropertyType): TypeInfo => TYPES.find((x) => x.type === t) ?? TYPES[1];

/** Types whose values are typed in (not calculated or automatic). */
export const EDITABLE = new Set<PropertyType>(['title', 'text', 'number', 'select', 'multiSelect', 'status', 'date', 'checkbox', 'url', 'email', 'phone', 'files', 'relation', 'tags', 'course']);
/** Types with a list of options. */
export const HAS_OPTIONS = new Set<PropertyType>(['select', 'multiSelect', 'status']);
/** Types whose values live on the row's page rather than in its cells. */
export const ON_PAGE = new Set<PropertyType>(['title', 'tags', 'created', 'edited', 'id']);

/** A short random id for properties, views and options. */
export function shortId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const abc = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from(bytes, (b) => abc[b % 62]).join('');
}

export const STATUS_OPTIONS: SelectOption[] = [
  { id: 'todo', name: 'Not started', color: 'gray', group: 'todo' },
  { id: 'doing', name: 'In progress', color: 'blue', group: 'doing' },
  { id: 'done', name: 'Done', color: 'green', group: 'done' },
];

export const STATUS_GROUPS: { key: 'todo' | 'doing' | 'done'; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'In progress' },
  { key: 'done', label: 'Complete' },
];

/** Settings a new property of a type starts with. */
export function defaultConfig(type: PropertyType): PropertyConfig {
  switch (type) {
    case 'select':
    case 'multiSelect':
      return { options: [] };
    case 'status':
      return { options: STATUS_OPTIONS.map((o) => ({ ...o })) };
    case 'number':
      return { format: 'number' };
    case 'formula':
      return { expression: '' };
    case 'rollup':
      return { fn: 'count' };
    case 'id':
      return { prefix: '' };
    case 'button':
      return { label: '', actions: [] };
    default:
      return {};
  }
}

export function options(p: Property): SelectOption[] {
  return p.config.options ?? [];
}

/** Options by id, per list (a list is replaced, never changed in place, when edited). */
const optionMaps = new WeakMap<SelectOption[], Map<string, SelectOption>>();

export function option(p: Property, id: unknown): SelectOption | undefined {
  if (typeof id !== 'string') return undefined;
  const list = options(p);
  // Short lists are quicker to scan than to index.
  if (list.length < 8) return list.find((o) => o.id === id);
  let map = optionMaps.get(list);
  if (!map) optionMaps.set(list, (map = new Map(list.map((o) => [o.id, o]))));
  return map.get(id);
}

/** A new option for a property's list, in the next unused colour. */
export function newOption(p: Property, name: string): SelectOption {
  const used = options(p).map((o) => o.color);
  return { id: shortId(), name: name.trim(), color: nextColor(used), ...(p.type === 'status' ? { group: 'todo' as const } : {}) };
}

/** The option called `name` (any case), if there is one. */
export function optionNamed(p: Property, name: string): SelectOption | undefined {
  const n = name.trim().toLowerCase();
  return options(p).find((o) => o.name.toLowerCase() === n);
}

// ------------------------------------------------------------------ numbers

export const NUMBER_FORMATS: { key: NumberFormat; label: string; example: string }[] = [
  { key: 'number', label: 'Number', example: '1234.5' },
  { key: 'comma', label: 'With commas', example: '1,234.5' },
  { key: 'percent', label: 'Percent', example: '45%' },
  { key: 'dollar', label: 'Dollar', example: '$1,234.50' },
  { key: 'euro', label: 'Euro', example: '€1,234.50' },
  { key: 'pound', label: 'Pound', example: '£1,234.50' },
  { key: 'yen', label: 'Yen', example: '¥1,235' },
  { key: 'rupee', label: 'Rupee', example: '₹1,234.50' },
];

const CURRENCY: Partial<Record<NumberFormat, string>> = { dollar: 'USD', euro: 'EUR', pound: 'GBP', yen: 'JPY', rupee: 'INR' };
const formatters = new Map<string, Intl.NumberFormat>();

export function formatNumber(n: number | null | undefined, config: PropertyConfig = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  const format = config.format ?? 'number';
  const decimals = config.decimals ?? null;
  const key = `${format}|${decimals}`;
  let f = formatters.get(key);
  if (!f) {
    const digits = decimals === null ? undefined : decimals;
    const currency = CURRENCY[format];
    f = new Intl.NumberFormat(undefined, {
      style: currency ? 'currency' : 'decimal',
      currency,
      useGrouping: format !== 'number',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits ?? (currency ? undefined : 6),
    });
    formatters.set(key, f);
  }
  return f.format(n) + (format === 'percent' ? '%' : '');
}

/** "1,234.5", "$12", "45%", "(30)", "1.5k" → a number; null if it isn't one. */
export function parseNumber(text: string): number | null {
  let s = text.trim();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s$€£¥₹%]|,(?=\d{3}\b)/g, '').replace(/^(USD|EUR|GBP|JPY|INR)/i, '');
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([kmb])?$/i.exec(s);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as 'k'] ?? 1;
  return sign * Number(m[1]) * mult;
}

// -------------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, '0');

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses a stored date ("2026-10-14" or "2026-10-14T09:30") as local time. */
export function toDate(s: string): Date {
  const [day, time] = s.split('T');
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = (time ?? '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, h || 0, mi || 0);
}

export const hasTime = (s: string) => s.includes('T');

const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dayYearFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** "Oct 14", "Oct 14, 2025" (another year), "Oct 14, 9:30 AM". */
export function formatDay(s: string): string {
  const d = toDate(s);
  const day = d.getFullYear() === new Date().getFullYear() ? dayFmt.format(d) : dayYearFmt.format(d);
  return hasTime(s) ? `${day}, ${timeFmt.format(d)}` : day;
}

export function formatDateValue(v: DateValue | null | undefined): string {
  if (!v?.start) return '';
  return v.end ? `${formatDay(v.start)} → ${formatDay(v.end)}` : formatDay(v.start);
}

export function formatTimestamp(ms: number): string {
  return formatDay(`${isoDate(new Date(ms))}T${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Text people type or paste as a date ("2026-10-14", "10/14/2026",
 * "14 Oct 2026", "Oct 14", "today", "tomorrow 3pm"…). */
export function parseDate(text: string, today = new Date()): DateValue | null {
  let s = text.trim().toLowerCase();
  if (!s) return null;
  // A range written "start → end", "start - end" or "start to end".
  const range = s.split(/\s*(?:→|–|—| to | - )\s*/);
  if (range.length === 2 && range[0] && range[1]) {
    const a = parseDate(range[0], today);
    const b = parseDate(range[1], today);
    if (a && b) return { start: a.start, end: b.start };
  }
  let time = '';
  const tm = /(?:^|\s|t|,)(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(s);
  if (tm && (tm[2] || tm[3])) {
    let h = +tm[1];
    const mi = tm[2] ? +tm[2] : 0;
    const ap = tm[3]?.[0];
    if (ap === 'p' && h < 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
    if (h < 24 && mi < 60) {
      time = `T${pad(h)}:${pad(mi)}`;
      s = s.slice(0, tm.index).replace(/[,\s]+$/, '').replace(/t$/, '');
    }
  }
  const y0 = today.getFullYear();
  let day: Date | null = null;
  const rel: Record<string, number> = { today: 0, tomorrow: 1, yesterday: -1 };
  let m: RegExpExecArray | null;
  if (!s && time) day = today;
  else if (s in rel) day = new Date(y0, today.getMonth(), today.getDate() + rel[s]);
  else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) day = new Date(+m[1], +m[2] - 1, +m[3]);
  else if ((m = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/.exec(s))) {
    // Month first in the US, day first elsewhere; a value over 12 settles it.
    const dayFirst = !/^en-us/i.test(navigator.language) || +m[1] > 12;
    const [d, mo] = dayFirst && +m[2] <= 12 ? [+m[1], +m[2]] : [+m[2], +m[1]];
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : y0;
    day = new Date(y, mo - 1, d);
  } else if ((m = /^(?:[a-z]+,?\s+)?([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?$/.exec(s)) && MONTHS.includes(m[1].slice(0, 3))) {
    day = new Date(m[3] ? +m[3] : y0, MONTHS.indexOf(m[1].slice(0, 3)), +m[2]);
  } else if ((m = /^(?:[a-z]+,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?,?(?:\s+(\d{4}))?$/.exec(s)) && MONTHS.includes(m[2].slice(0, 3))) {
    day = new Date(m[3] ? +m[3] : y0, MONTHS.indexOf(m[2].slice(0, 3)), +m[1]);
  } else {
    const t = Date.parse(text);
    if (!Number.isNaN(t) && /\d/.test(text)) {
      const d = new Date(t);
      day = d;
      if (!time && /\d:\d/.test(text)) time = `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  if (!day || Number.isNaN(day.getTime())) return null;
  return { start: isoDate(day) + time };
}

// ---------------------------------------------------------------- checkboxes

export function parseCheckbox(text: string): boolean | null {
  const s = text.trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'x', '✓', '✔', '☑', 'checked', 'done', 'on'].includes(s)) return true;
  if (['false', 'no', 'n', '0', '', '☐', 'unchecked', 'off'].includes(s)) return false;
  return null;
}

// ------------------------------------------------------------- guessing types

const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s().-]{7,}$/;

/** A good type for a column of imported text. */
export function inferType(values: string[]): { type: PropertyType; config: PropertyConfig } {
  const vals = values.map((v) => v.trim()).filter(Boolean);
  if (!vals.length) return { type: 'text', config: {} };
  const share = (test: (v: string) => boolean) => vals.filter(test).length / vals.length;
  if (share((v) => parseCheckbox(v) !== null && !/^\d$/.test(v)) >= 0.95 && vals.some((v) => !/^[01]$/.test(v))) return { type: 'checkbox', config: {} };
  if (share((v) => parseNumber(v) !== null) >= 0.9) {
    const format: NumberFormat = vals.some((v) => v.includes('$'))
      ? 'dollar'
      : vals.some((v) => v.includes('€'))
        ? 'euro'
        : vals.some((v) => v.includes('£'))
          ? 'pound'
          : vals.some((v) => v.includes('%'))
            ? 'percent'
            : vals.some((v) => /\d,\d{3}/.test(v))
              ? 'comma'
              : 'number';
    return { type: 'number', config: { format } };
  }
  if (share((v) => /\d/.test(v) && parseDate(v) !== null) >= 0.9) return { type: 'date', config: {} };
  if (share((v) => URL_RE.test(v)) >= 0.9) return { type: 'url', config: {} };
  if (share((v) => EMAIL_RE.test(v)) >= 0.9) return { type: 'email', config: {} };
  if (share((v) => PHONE_RE.test(v) && /\d{3}/.test(v)) >= 0.9) return { type: 'phone', config: {} };
  // Short values that repeat: a list of choices.
  const listy = vals.filter((v) => v.includes(',') && v.length < 120);
  if (listy.length >= vals.length * 0.3) {
    const parts = vals.flatMap((v) => v.split(',').map((x) => x.trim()).filter(Boolean));
    const distinct = new Set(parts.map((p) => p.toLowerCase()));
    if (distinct.size <= Math.max(12, parts.length / 3) && parts.every((p) => p.length <= 40)) {
      return { type: 'multiSelect', config: { options: optionsFrom([...new Set(parts)]) } };
    }
  }
  const distinct = new Set(vals.map((v) => v.toLowerCase()));
  if (distinct.size <= 12 && distinct.size < vals.length && vals.every((v) => v.length <= 40)) {
    return { type: 'select', config: { options: optionsFrom([...new Map(vals.map((v) => [v.toLowerCase(), v])).values()]) } };
  }
  return { type: 'text', config: {} };
}

function optionsFrom(names: string[]): SelectOption[] {
  const out: SelectOption[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ id: shortId(), name, color: nextColor(out.map((o) => o.color)) });
  }
  return out;
}

// --------------------------------------------------------------- summaries

export const ROLLUP_FNS: { key: RollupFn; label: string }[] = [
  { key: 'show', label: 'Show values' },
  { key: 'count', label: 'Count rows' },
  { key: 'countValues', label: 'Count values' },
  { key: 'sum', label: 'Sum' },
  { key: 'average', label: 'Average' },
  { key: 'min', label: 'Smallest' },
  { key: 'max', label: 'Largest' },
  { key: 'percentChecked', label: 'Percent checked' },
  { key: 'percentDone', label: 'Percent complete (status)' },
  { key: 'earliest', label: 'Earliest date' },
  { key: 'latest', label: 'Latest date' },
];

export const CALC_LABELS: Record<CalcFn, string> = {
  none: 'None',
  count: 'Count all',
  countValues: 'Count values',
  countEmpty: 'Count empty',
  countUnique: 'Count unique',
  percentFilled: 'Percent filled',
  percentEmpty: 'Percent empty',
  sum: 'Sum',
  average: 'Average',
  median: 'Median',
  min: 'Smallest',
  max: 'Largest',
  range: 'Range',
  checked: 'Checked',
  unchecked: 'Unchecked',
  percentChecked: 'Percent checked',
  earliest: 'Earliest',
  latest: 'Latest',
};

/** The same, short enough for the line under a narrow column. */
export const CALC_SHORT: Record<CalcFn, string> = {
  none: '',
  count: 'Count',
  countValues: 'Values',
  countEmpty: 'Empty',
  countUnique: 'Unique',
  percentFilled: 'Filled',
  percentEmpty: 'Empty',
  sum: 'Sum',
  average: 'Avg',
  median: 'Median',
  min: 'Min',
  max: 'Max',
  range: 'Range',
  checked: 'Checked',
  unchecked: 'Unchecked',
  percentChecked: 'Done',
  earliest: 'From',
  latest: 'To',
};

/** Summaries that make sense for a kind of value. */
export function calcsFor(kind: ValueKind): CalcFn[] {
  const base: CalcFn[] = ['none', 'count', 'countValues', 'countEmpty', 'countUnique', 'percentFilled', 'percentEmpty'];
  if (kind === 'number') return [...base, 'sum', 'average', 'median', 'min', 'max', 'range'];
  if (kind === 'checkbox') return ['none', 'count', 'checked', 'unchecked', 'percentChecked'];
  if (kind === 'date') return [...base, 'earliest', 'latest', 'range'];
  return base;
}

/** What a property's values are like, for sorting, filtering and sums. */
export type ValueKind = 'text' | 'number' | 'option' | 'options' | 'date' | 'checkbox' | 'list';

export function kindOf(p: Property, formulaKind?: ValueKind): ValueKind {
  switch (p.type) {
    case 'number':
    case 'id':
      return 'number';
    case 'select':
    case 'status':
    case 'course':
      return 'option';
    case 'multiSelect':
    case 'tags':
      return 'options';
    case 'date':
    case 'created':
    case 'edited':
      return 'date';
    case 'checkbox':
      return 'checkbox';
    case 'files':
    case 'relation':
      return 'list';
    case 'formula':
    case 'rollup':
      return formulaKind ?? 'text';
    default:
      return 'text';
  }
}
