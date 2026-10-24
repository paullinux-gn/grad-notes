/**
 * Formulas: a small expression language for computed properties.
 *
 *   {Price} * {Quantity}
 *   if({Status} == "Done", "✓", daysUntil({Due}) + " days left")
 *   formatDate(dateAdd({Start}, 2, "weeks"), "MMM D")
 *
 * Properties are written in braces ({Due date}); a one-word name works on
 * its own (Price * 2), and prop("Due date") works too. Empty values count as
 * 0 in arithmetic unless every input is empty (then the result is empty).
 */

/** A date (or date and time) inside a formula. */
export class FDate {
  constructor(
    readonly ms: number,
    readonly time: boolean,
  ) {}
}

export type FValue = number | string | boolean | FDate | FValue[] | null;

export class FormulaError extends Error {
  constructor(
    message: string,
    readonly at = -1,
  ) {
    super(message);
  }
}

// --------------------------------------------------------------------- parsing

type TokenKind = 'num' | 'str' | 'prop' | 'id' | 'op' | '(' | ')' | ',' | '?' | ':' | 'eof';
interface Token {
  t: TokenKind;
  v: string;
  at: number;
}

export type Node =
  | { k: 'lit'; v: FValue; at: number }
  | { k: 'prop'; name: string; at: number }
  | { k: 'call'; name: string; args: Node[]; at: number }
  | { k: 'un'; op: string; a: Node; at: number }
  | { k: 'bin'; op: string; a: Node; b: Node; at: number }
  | { k: 'if'; c: Node; a: Node; b: Node; at: number };

const OPS2 = ['==', '!=', '<=', '>=', '&&', '||'];
const OPS1 = '+-*/%^<>!=≠≤≥&';
const QUOTES: Record<string, string> = { '"': '"', "'": "'", '“': '”', '‘': '’' };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const num = /(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/iy;
  const ident = /[A-Za-z_\u00C0-\uFFFF][\w\u00C0-\uFFFF]*/uy;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const at = i;
    num.lastIndex = i;
    const n = num.exec(src);
    if (n && /[\d.]/.test(c)) {
      out.push({ t: 'num', v: n[0], at });
      i += n[0].length;
      continue;
    }
    if (QUOTES[c]) {
      const close = QUOTES[c];
      let s = '';
      i++;
      while (i < src.length && src[i] !== close && !(close === '”' && src[i] === '"')) {
        if (src[i] === '\\' && i + 1 < src.length) {
          const e = src[++i];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
        } else s += src[i];
        i++;
      }
      if (i >= src.length) throw new FormulaError('This text is missing its closing quote', at);
      i++;
      out.push({ t: 'str', v: s, at });
      continue;
    }
    if (c === '{') {
      const end = src.indexOf('}', i + 1);
      if (end < 0) throw new FormulaError('A property name is missing its closing }', at);
      out.push({ t: 'prop', v: src.slice(i + 1, end).trim(), at });
      i = end + 1;
      continue;
    }
    ident.lastIndex = i;
    const id = ident.exec(src);
    if (id) {
      out.push({ t: 'id', v: id[0], at });
      i += id[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) {
      out.push({ t: 'op', v: two, at });
      i += 2;
      continue;
    }
    if ('(),?:'.includes(c)) {
      out.push({ t: c as TokenKind, v: c, at });
      i++;
      continue;
    }
    if (OPS1.includes(c)) {
      out.push({ t: 'op', v: c, at });
      i++;
      continue;
    }
    throw new FormulaError(`“${c}” isn’t something formulas understand`, at);
  }
  out.push({ t: 'eof', v: '', at: src.length });
  return out;
}

/** Binary operators: canonical name, precedence, right-associative. */
function binary(tok: Token): { op: string; prec: number; right?: boolean } | null {
  const v = tok.t === 'id' ? tok.v.toLowerCase() : tok.t === 'op' ? tok.v : '';
  switch (v) {
    case 'or':
    case '||':
      return { op: 'or', prec: 1 };
    case 'and':
    case '&&':
      return { op: 'and', prec: 2 };
    case '==':
    case '=':
      return { op: '==', prec: 4 };
    case '!=':
    case '≠':
      return { op: '!=', prec: 4 };
    case '<':
    case '>':
      return { op: v, prec: 4 };
    case '<=':
    case '≤':
      return { op: '<=', prec: 4 };
    case '>=':
    case '≥':
      return { op: '>=', prec: 4 };
    case '+':
    case '-':
    case '&':
      return { op: v === '&' ? '+' : v, prec: 5 };
    case '*':
    case '/':
    case '%':
      return { op: v, prec: 6 };
    case '^':
      return { op: '^', prec: 8, right: true };
  }
  return null;
}

class Parser {
  i = 0;
  constructor(private toks: Token[]) {}

  peek(): Token {
    return this.toks[this.i];
  }

  next(): Token {
    return this.toks[this.i++];
  }

  expect(t: TokenKind, what: string) {
    const tok = this.next();
    if (tok.t !== t) throw new FormulaError(tok.t === 'eof' ? `Missing ${what} at the end` : `Expected ${what} before “${tok.v}”`, tok.at);
  }

  parse(): Node {
    if (this.peek().t === 'eof') return { k: 'lit', v: null, at: 0 };
    const node = this.expr(0);
    const tok = this.peek();
    if (tok.t !== 'eof') throw new FormulaError(tok.t === ')' ? 'There’s a ) without a (' : `Unexpected “${tok.v}”: is an operator missing?`, tok.at);
    return node;
  }

  expr(min: number): Node {
    let left = this.prefix();
    for (;;) {
      const tok = this.peek();
      if (tok.t === '?' && min <= 0) {
        this.next();
        const a = this.expr(0);
        this.expect(':', 'a “:”');
        const b = this.expr(0);
        left = { k: 'if', c: left, a, b, at: tok.at };
        continue;
      }
      const op = binary(tok);
      if (!op || op.prec < min) break;
      this.next();
      const right = this.expr(op.right ? op.prec : op.prec + 1);
      left = { k: 'bin', op: op.op, a: left, b: right, at: tok.at };
    }
    return left;
  }

  prefix(): Node {
    const tok = this.next();
    switch (tok.t) {
      case 'num':
        return { k: 'lit', v: Number(tok.v), at: tok.at };
      case 'str':
        return { k: 'lit', v: tok.v, at: tok.at };
      case 'prop':
        return { k: 'prop', name: tok.v, at: tok.at };
      case '(': {
        const inner = this.expr(0);
        this.expect(')', 'a “)”');
        return inner;
      }
      case 'op':
        if (tok.v === '-' || tok.v === '+') return { k: 'un', op: tok.v, a: this.expr(7), at: tok.at };
        if (tok.v === '!') return { k: 'un', op: 'not', a: this.expr(3), at: tok.at };
        break;
      case 'id': {
        const word = tok.v.toLowerCase();
        if (word === 'true' || word === 'false') return { k: 'lit', v: word === 'true', at: tok.at };
        if (word === 'not' && this.peek().t !== '(') return { k: 'un', op: 'not', a: this.expr(3), at: tok.at };
        if (this.peek().t === '(') {
          this.next();
          const args: Node[] = [];
          if (this.peek().t !== ')') {
            for (;;) {
              args.push(this.expr(0));
              if (this.peek().t === ',') this.next();
              else break;
            }
          }
          this.expect(')', 'a “)”');
          if (word === 'prop') {
            const arg = args[0];
            if (args.length !== 1 || arg.k !== 'lit' || typeof arg.v !== 'string') {
              throw new FormulaError('prop() takes a property name in quotes', tok.at);
            }
            return { k: 'prop', name: arg.v, at: tok.at };
          }
          if (!FUNCTIONS[word]) throw new FormulaError(`There’s no function called ${tok.v}()`, tok.at);
          const fn = FUNCTIONS[word];
          if (args.length < fn.min || (fn.max !== undefined && args.length > fn.max)) {
            throw new FormulaError(`${fn.name}() takes ${fn.sig}`, tok.at);
          }
          return { k: 'call', name: word, args, at: tok.at };
        }
        // A one-word property name.
        return { k: 'prop', name: tok.v, at: tok.at };
      }
    }
    if (tok.t === 'eof') throw new FormulaError('The formula ends too soon', tok.at);
    throw new FormulaError(`Unexpected “${tok.v}”`, tok.at);
  }
}

const parsed = new Map<string, Node | FormulaError>();

/** Parses a formula (cached); throws FormulaError with where it went wrong. */
export function parse(src: string): Node {
  let hit = parsed.get(src);
  if (!hit) {
    try {
      hit = new Parser(tokenize(src)).parse();
    } catch (e) {
      hit = e instanceof FormulaError ? e : new FormulaError(String(e));
    }
    if (parsed.size > 500) parsed.clear();
    parsed.set(src, hit);
  }
  if (hit instanceof FormulaError) throw hit;
  return hit;
}

/** Property names a formula uses (to find loops and to rename). */
export function references(node: Node, out = new Set<string>()): Set<string> {
  switch (node.k) {
    case 'prop':
      out.add(node.name.toLowerCase());
      break;
    case 'call':
      node.args.forEach((a) => references(a, out));
      break;
    case 'un':
      references(node.a, out);
      break;
    case 'bin':
      references(node.a, out);
      references(node.b, out);
      break;
    case 'if':
      references(node.c, out);
      references(node.a, out);
      references(node.b, out);
      break;
  }
  return out;
}

/** The formula with a property renamed everywhere it appears. */
export function renameProperty(src: string, from: string, to: string): string {
  let toks: Token[];
  try {
    toks = tokenize(src);
  } catch {
    return src;
  }
  const lower = from.toLowerCase();
  let out = '';
  let last = 0;
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    const bare = tok.t === 'id' && toks[i + 1]?.t !== '(' && !['and', 'or', 'not', 'true', 'false'].includes(tok.v.toLowerCase());
    if ((tok.t === 'prop' || bare) && tok.v.toLowerCase() === lower) {
      const end = tok.t === 'prop' ? src.indexOf('}', tok.at) + 1 : tok.at + tok.v.length;
      out += src.slice(last, tok.at) + `{${to}}`;
      last = end;
    } else if (tok.t === 'id' && tok.v.toLowerCase() === 'prop' && toks[i + 1]?.t === '(' && toks[i + 2]?.t === 'str' && toks[i + 2].v.toLowerCase() === lower && toks[i + 3]?.t === ')') {
      out += src.slice(last, tok.at) + `{${to}}`;
      last = toks[i + 3].at + 1;
      i += 3;
    }
  }
  return out + src.slice(last);
}

// ------------------------------------------------------------------ evaluation

export interface Scope {
  /** A property's value by name (any case); undefined when there's none. */
  prop(name: string): FValue | undefined;
  /** "Now", fixed for one render. */
  now: number;
}

const isNum = (v: FValue): v is number => typeof v === 'number';

export function isEmpty(v: FValue): boolean {
  return v === null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'number' && Number.isNaN(v));
}

function truthy(v: FValue): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof FDate) return true;
  return !!v;
}

function num(v: FValue, what: string): number | null {
  if (v === null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''));
    if (v.trim() && !Number.isNaN(n)) return n;
  }
  if (v instanceof FDate) return v.ms;
  if (Array.isArray(v) && v.length === 1) return num(v[0], what);
  throw new FormulaError(`${what} needs a number, not ${describe(v)}`);
}

function describe(v: FValue): string {
  if (v === null) return 'an empty value';
  if (Array.isArray(v)) return 'a list';
  if (v instanceof FDate) return 'a date';
  if (typeof v === 'string') return `the text “${v.length > 20 ? v.slice(0, 20) + '…' : v}”`;
  return typeof v === 'boolean' ? 'true/false' : 'a number';
}

/** A number without floating-point noise (0.1 + 0.2 shows as 0.3). */
export function cleanNumber(n: number): number {
  return Number.isFinite(n) ? Number(n.toPrecision(12)) : n;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatDateValue(d: FDate, pattern?: string): string {
  const date = new Date(d.ms);
  const p = pattern ?? (d.time ? 'MMM D, YYYY h:mm A' : 'MMM D, YYYY');
  const pad = (n: number) => String(n).padStart(2, '0');
  return p.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|hh|h|mm|A|a/g, (tok, lit) => {
    if (lit !== undefined) return lit;
    const h = date.getHours();
    switch (tok) {
      case 'YYYY':
        return String(date.getFullYear());
      case 'YY':
        return pad(date.getFullYear() % 100);
      case 'MMMM':
        return MONTHS[date.getMonth()];
      case 'MMM':
        return MONTHS[date.getMonth()].slice(0, 3);
      case 'MM':
        return pad(date.getMonth() + 1);
      case 'M':
        return String(date.getMonth() + 1);
      case 'dddd':
        return WEEKDAYS[date.getDay()];
      case 'ddd':
        return WEEKDAYS[date.getDay()].slice(0, 3);
      case 'DD':
        return pad(date.getDate());
      case 'D':
        return String(date.getDate());
      case 'HH':
        return pad(h);
      case 'H':
        return String(h);
      case 'hh':
        return pad(h % 12 || 12);
      case 'h':
        return String(h % 12 || 12);
      case 'mm':
        return pad(date.getMinutes());
      case 'A':
        return h < 12 ? 'AM' : 'PM';
      case 'a':
        return h < 12 ? 'am' : 'pm';
    }
    return tok;
  });
}

/** A formula value as text (for joining text, and for showing results). */
export function toText(v: FValue): string {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? String(cleanNumber(v)) : v > 0 ? '∞' : v < 0 ? '-∞' : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof FDate) return formatDateValue(v);
  return v.map(toText).filter(Boolean).join(', ');
}

function date(v: FValue, what: string): FDate | null {
  if (v === null || v === '') return null;
  if (v instanceof FDate) return v;
  if (Array.isArray(v) && v.length === 1) return date(v[0], what);
  if (typeof v === 'string') {
    const d = parseDateText(v);
    if (d) return d;
  }
  if (typeof v === 'number') return new FDate(v, true);
  throw new FormulaError(`${what} needs a date, not ${describe(v)}`);
}

/** "2026-10-14", "2026-10-14T09:30" or anything Date.parse reads. */
export function parseDateText(s: string): FDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/.exec(s.trim());
  if (m) {
    const [, y, mo, d, h, mi] = m;
    return new FDate(new Date(+y, +mo - 1, +d, h ? +h : 0, mi ? +mi : 0).getTime(), !!h);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new FDate(t, /\d:\d/.test(s));
}

function text(v: FValue): string {
  return toText(v);
}

function list(v: FValue): FValue[] {
  return Array.isArray(v) ? v : v === null ? [] : [v];
}

/** Flattens the arguments of sum(), min() and friends (lists count too). */
function numbers(args: FValue[], what: string): number[] {
  const out: number[] = [];
  for (const a of args.flatMap((x) => (Array.isArray(x) ? x : [x]))) {
    const n = num(a, what);
    if (n !== null) out.push(n);
  }
  return out;
}

const UNITS: Record<string, string> = {
  year: 'years', years: 'years', y: 'years',
  quarter: 'quarters', quarters: 'quarters',
  month: 'months', months: 'months',
  week: 'weeks', weeks: 'weeks', w: 'weeks',
  day: 'days', days: 'days', d: 'days',
  hour: 'hours', hours: 'hours', h: 'hours',
  minute: 'minutes', minutes: 'minutes', min: 'minutes', mins: 'minutes',
};

function unit(v: FValue): string {
  const u = UNITS[text(v).trim().toLowerCase()];
  if (!u) throw new FormulaError(`Units are "years", "months", "weeks", "days", "hours" or "minutes"`);
  return u;
}

function addTo(d: FDate, n: number, u: string): FDate {
  const x = new Date(d.ms);
  switch (u) {
    case 'years':
      x.setFullYear(x.getFullYear() + n);
      break;
    case 'quarters':
      x.setMonth(x.getMonth() + 3 * n);
      break;
    case 'months':
      x.setMonth(x.getMonth() + n);
      break;
    case 'weeks':
      x.setDate(x.getDate() + 7 * n);
      break;
    case 'days':
      x.setDate(x.getDate() + n);
      break;
    case 'hours':
      return new FDate(d.ms + n * 3_600_000, true);
    case 'minutes':
      return new FDate(d.ms + n * 60_000, true);
  }
  return new FDate(x.getTime(), d.time);
}

/** Calendar days from b to a (ignoring times and daylight-saving shifts). */
function dayDiff(a: FDate, b: FDate): number {
  const day = (d: FDate) => {
    const x = new Date(d.ms);
    return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86_400_000;
  };
  return day(a) - day(b);
}

function between(a: FDate, b: FDate, u: string): number {
  const trunc = Math.trunc;
  const da = new Date(a.ms);
  const db = new Date(b.ms);
  switch (u) {
    case 'years':
    case 'quarters':
    case 'months': {
      let months = (da.getFullYear() - db.getFullYear()) * 12 + da.getMonth() - db.getMonth();
      // A month only counts once its day has come round.
      if (months > 0 && da.getDate() < db.getDate()) months--;
      if (months < 0 && da.getDate() > db.getDate()) months++;
      return u === 'years' ? trunc(months / 12) : u === 'quarters' ? trunc(months / 3) : months;
    }
    case 'weeks':
      return trunc(dayDiff(a, b) / 7);
    case 'days':
      return a.time && b.time ? trunc((a.ms - b.ms) / 86_400_000) : dayDiff(a, b);
    case 'hours':
      return trunc((a.ms - b.ms) / 3_600_000);
    default:
      return trunc((a.ms - b.ms) / 60_000);
  }
}

function startOfToday(now: number): FDate {
  const d = new Date(now);
  return new FDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), false);
}

function equal(a: FValue, b: FValue): boolean {
  if (a instanceof FDate && b instanceof FDate) return a.ms === b.ms;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (isEmpty(a) && isEmpty(b)) return true;
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  // A select's option compared with text, a one-item list with its item.
  if (Array.isArray(a) && a.length === 1) return equal(a[0], b);
  if (Array.isArray(b) && b.length === 1) return equal(a, b[0]);
  if (typeof a === 'number' && typeof b === 'string') return String(a) === b.trim();
  if (typeof b === 'number' && typeof a === 'string') return String(b) === a.trim();
  return a === b;
}

function compare(a: FValue, b: FValue, op: string): boolean {
  if (a === null || b === null) return false;
  let x: number | string;
  let y: number | string;
  if (a instanceof FDate || b instanceof FDate) {
    x = date(a, 'Comparing')!.ms;
    y = date(b, 'Comparing')!.ms;
  } else if (typeof a === 'string' && typeof b === 'string') {
    x = a.toLowerCase();
    y = b.toLowerCase();
  } else {
    x = num(a, 'Comparing') ?? 0;
    y = num(b, 'Comparing') ?? 0;
  }
  switch (op) {
    case '<':
      return x < y;
    case '>':
      return x > y;
    case '<=':
      return x <= y;
    default:
      return x >= y;
  }
}

function arithmetic(op: string, a: FValue, b: FValue): FValue {
  if (op === '+' && (typeof a === 'string' || typeof b === 'string')) return text(a) + text(b);
  if (op === '+' && Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (op === '-' && a instanceof FDate && b instanceof FDate) return dayDiff(a, b);
  if (isEmpty(a) && isEmpty(b)) return null;
  const names: Record<string, string> = { '+': 'Adding', '-': 'Subtracting', '*': 'Multiplying', '/': 'Dividing', '%': 'Remainder', '^': 'A power' };
  const x = num(a, names[op]) ?? 0;
  const y = num(b, names[op]) ?? 0;
  switch (op) {
    case '+':
      return x + y;
    case '-':
      return x - y;
    case '*':
      return x * y;
    case '/':
      if (y === 0) throw new FormulaError('Can’t divide by zero');
      return x / y;
    case '%':
      if (y === 0) throw new FormulaError('Can’t divide by zero');
      return x % y;
    default:
      return x ** y;
  }
}

interface FnDef {
  name: string;
  sig: string;
  doc: string;
  group: 'Logic' | 'Math' | 'Text' | 'Dates' | 'Lists';
  min: number;
  max?: number;
  /** Gets its arguments unevaluated (if, ifs, and, or). */
  lazy?: (args: Node[], scope: Scope) => FValue;
  run?: (args: FValue[], scope: Scope) => FValue;
}

function def(group: FnDef['group'], name: string, sig: string, doc: string, min: number, max: number | undefined, run: FnDef['run'], lazy?: FnDef['lazy']): FnDef {
  return { name, sig, doc, group, min, max, run, lazy };
}

const round = (n: number, places = 0) => {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
};

export const FUNCTIONS: Record<string, FnDef> = Object.fromEntries(
  [
    def('Logic', 'if', 'a condition, a value if true, a value if false', 'Picks one of two values: if({Done}, "✓", "")', 2, 3, undefined, (args, s) =>
      truthy(evaluate(args[0], s)) ? evaluate(args[1], s) : args[2] ? evaluate(args[2], s) : null,
    ),
    def('Logic', 'ifs', 'conditions and values, then a fallback', 'The value after the first true condition: ifs({Score} >= 90, "A", {Score} >= 80, "B", "C")', 2, undefined, undefined, (args, s) => {
      for (let i = 0; i + 1 < args.length; i += 2) if (truthy(evaluate(args[i], s))) return evaluate(args[i + 1], s);
      return args.length % 2 ? evaluate(args[args.length - 1], s) : null;
    }),
    def('Logic', 'and', 'conditions', 'True when every condition is true', 1, undefined, undefined, (args, s) => args.every((a) => truthy(evaluate(a, s)))),
    def('Logic', 'or', 'conditions', 'True when any condition is true', 1, undefined, undefined, (args, s) => args.some((a) => truthy(evaluate(a, s)))),
    def('Logic', 'not', 'a condition', 'True when the condition is false', 1, 1, ([a]) => !truthy(a)),
    def('Logic', 'empty', 'a value', 'True when the value is empty: empty({Due})', 1, 1, ([a]) => isEmpty(a)),
    def('Logic', 'ifEmpty', 'a value, a fallback', 'The value, or the fallback when it’s empty', 2, 2, ([a, b]) => (isEmpty(a) ? b : a)),

    def('Math', 'round', 'a number, decimal places', 'Rounds: round(3.14159, 2) is 3.14', 1, 2, ([a, p]) => {
      const n = num(a, 'round()');
      return n === null ? null : round(n, num(p ?? 0, 'round()') ?? 0);
    }),
    def('Math', 'floor', 'a number', 'Rounds down', 1, 1, ([a]) => (num(a, 'floor()') === null ? null : Math.floor(num(a, 'floor()')!))),
    def('Math', 'ceil', 'a number', 'Rounds up', 1, 1, ([a]) => (num(a, 'ceil()') === null ? null : Math.ceil(num(a, 'ceil()')!))),
    def('Math', 'abs', 'a number', 'The number without its sign', 1, 1, ([a]) => (num(a, 'abs()') === null ? null : Math.abs(num(a, 'abs()')!))),
    def('Math', 'sqrt', 'a number', 'Square root', 1, 1, ([a]) => {
      const n = num(a, 'sqrt()');
      if (n !== null && n < 0) throw new FormulaError('sqrt() needs a number that isn’t negative');
      return n === null ? null : Math.sqrt(n);
    }),
    def('Math', 'pow', 'a number, a power', 'pow(2, 10) is 1024', 2, 2, ([a, b]) => arithmetic('^', a, b)),
    def('Math', 'mod', 'a number, a divisor', 'The remainder: mod(10, 3) is 1', 2, 2, ([a, b]) => arithmetic('%', a, b)),
    def('Math', 'min', 'numbers or lists', 'The smallest', 1, undefined, (args) => {
      const ns = numbers(args, 'min()');
      return ns.length ? ns.reduce((a, b) => Math.min(a, b), Infinity) : null;
    }),
    def('Math', 'max', 'numbers or lists', 'The largest', 1, undefined, (args) => {
      const ns = numbers(args, 'max()');
      return ns.length ? ns.reduce((a, b) => Math.max(a, b), -Infinity) : null;
    }),
    def('Math', 'sum', 'numbers or lists', 'Adds them up: sum({Q1}, {Q2}, {Q3})', 1, undefined, (args) => {
      const ns = numbers(args, 'sum()');
      return ns.length ? ns.reduce((x, y) => x + y, 0) : null;
    }),
    def('Math', 'average', 'numbers or lists', 'The mean of the numbers given', 1, undefined, (args) => {
      const ns = numbers(args, 'average()');
      return ns.length ? ns.reduce((x, y) => x + y, 0) / ns.length : null;
    }),
    def('Math', 'toNumber', 'text', 'Text as a number: toNumber("42") is 42', 1, 1, ([a]) => {
      if (a === null || a === '') return null;
      const n = Number(text(a).replace(/[^\d.eE+-]/g, ''));
      return Number.isNaN(n) ? null : n;
    }),

    def('Text', 'concat', 'texts', 'Joins texts end to end', 1, undefined, (args) => args.map(text).join('')),
    def('Text', 'length', 'text or a list', 'How many characters (or items)', 1, 1, ([a]) => (Array.isArray(a) ? a.length : text(a).length)),
    def('Text', 'lower', 'text', 'In lowercase', 1, 1, ([a]) => text(a).toLowerCase()),
    def('Text', 'upper', 'text', 'In uppercase', 1, 1, ([a]) => text(a).toUpperCase()),
    def('Text', 'trim', 'text', 'Without spaces at either end', 1, 1, ([a]) => text(a).trim()),
    def('Text', 'contains', 'text or a list, what to find', 'Whether it’s in there: contains({Tags}, "exam")', 2, 2, ([a, b]) =>
      Array.isArray(a) ? a.some((x) => equal(x, b)) : text(a).toLowerCase().includes(text(b).toLowerCase()),
    ),
    def('Text', 'startsWith', 'text, a start', 'Whether the text starts that way', 2, 2, ([a, b]) => text(a).toLowerCase().startsWith(text(b).toLowerCase())),
    def('Text', 'endsWith', 'text, an end', 'Whether the text ends that way', 2, 2, ([a, b]) => text(a).toLowerCase().endsWith(text(b).toLowerCase())),
    def('Text', 'replace', 'text, what to find, what to put instead', 'Replaces every match', 3, 3, ([a, b, c]) => text(a).split(text(b)).join(text(c))),
    def('Text', 'slice', 'text, start, end', 'Part of the text: slice("Thought", 0, 3) is "Tho"', 2, 3, ([a, b, c]) =>
      text(a).slice(num(b, 'slice()') ?? 0, c === undefined || c === null ? undefined : (num(c, 'slice()') ?? undefined)),
    ),
    def('Text', 'split', 'text, a separator', 'Text as a list: split("a, b", ", ")', 2, 2, ([a, b]) => text(a).split(text(b)).filter(Boolean)),
    def('Text', 'format', 'a value', 'Any value as text', 1, 1, ([a]) => text(a)),
    def('Text', 'repeat', 'text, times', 'repeat("★", {Rating})', 2, 2, ([a, b]) => text(a).repeat(Math.max(0, Math.min(1000, num(b, 'repeat()') ?? 0)))),

    def('Dates', 'now', '', 'The current date and time', 0, 0, (_a, s) => new FDate(s.now, true)),
    def('Dates', 'today', '', 'Today’s date', 0, 0, (_a, s) => startOfToday(s.now)),
    def('Dates', 'date', 'text', 'Text as a date: date("2026-10-14")', 1, 1, ([a]) => date(a, 'date()')),
    def('Dates', 'dateAdd', 'a date, an amount, a unit', 'dateAdd({Due}, 2, "weeks")', 3, 3, ([a, n, u]) => {
      const d = date(a, 'dateAdd()');
      return d ? addTo(d, num(n, 'dateAdd()') ?? 0, unit(u)) : null;
    }),
    def('Dates', 'dateSubtract', 'a date, an amount, a unit', 'dateSubtract({Due}, 3, "days")', 3, 3, ([a, n, u]) => {
      const d = date(a, 'dateSubtract()');
      return d ? addTo(d, -(num(n, 'dateSubtract()') ?? 0), unit(u)) : null;
    }),
    def('Dates', 'dateBetween', 'a date, another date, a unit', 'How long from the second to the first: dateBetween({End}, {Start}, "days")', 3, 3, ([a, b, u]) => {
      const x = date(a, 'dateBetween()');
      const y = date(b, 'dateBetween()');
      return x && y ? between(x, y, unit(u)) : null;
    }),
    def('Dates', 'daysUntil', 'a date', 'Days from today until the date (negative once it’s past)', 1, 1, ([a], s) => {
      const d = date(a, 'daysUntil()');
      return d ? dayDiff(d, startOfToday(s.now)) : null;
    }),
    def('Dates', 'formatDate', 'a date, a pattern', 'formatDate({Due}, "dddd, MMM D") — YYYY, MMM, MM, D, dddd, h:mm A…', 1, 2, ([a, p]) => {
      const d = date(a, 'formatDate()');
      return d ? formatDateValue(d, p === undefined || p === null ? undefined : text(p)) : null;
    }),
    def('Dates', 'year', 'a date', 'The year', 1, 1, ([a]) => {
      const d = date(a, 'year()');
      return d ? new Date(d.ms).getFullYear() : null;
    }),
    def('Dates', 'month', 'a date', 'The month, 1 to 12', 1, 1, ([a]) => {
      const d = date(a, 'month()');
      return d ? new Date(d.ms).getMonth() + 1 : null;
    }),
    def('Dates', 'day', 'a date', 'The day of the month', 1, 1, ([a]) => {
      const d = date(a, 'day()');
      return d ? new Date(d.ms).getDate() : null;
    }),
    def('Dates', 'weekday', 'a date', 'The day of the week, 1 (Monday) to 7 (Sunday)', 1, 1, ([a]) => {
      const d = date(a, 'weekday()');
      return d ? new Date(d.ms).getDay() || 7 : null;
    }),
    def('Dates', 'hour', 'a date', 'The hour, 0 to 23', 1, 1, ([a]) => {
      const d = date(a, 'hour()');
      return d ? new Date(d.ms).getHours() : null;
    }),
    def('Dates', 'minute', 'a date', 'The minute, 0 to 59', 1, 1, ([a]) => {
      const d = date(a, 'minute()');
      return d ? new Date(d.ms).getMinutes() : null;
    }),

    def('Lists', 'count', 'a list', 'How many items', 1, 1, ([a]) => list(a).filter((x) => !isEmpty(x)).length),
    def('Lists', 'first', 'a list', 'The first item', 1, 1, ([a]) => list(a)[0] ?? null),
    def('Lists', 'last', 'a list', 'The last item', 1, 1, ([a]) => list(a).at(-1) ?? null),
    def('Lists', 'at', 'a list, a position', 'The item at a position, from 0', 2, 2, ([a, i]) => list(a)[num(i, 'at()') ?? 0] ?? null),
    def('Lists', 'join', 'a list, a separator', 'The items as text: join({Tags}, " · ")', 1, 2, ([a, sep]) => list(a).map(text).join(sep === undefined ? ', ' : text(sep))),
    def('Lists', 'unique', 'a list', 'Without repeats', 1, 1, ([a]) => list(a).filter((x, i, all) => all.findIndex((y) => equal(x, y)) === i)),
    def('Lists', 'sort', 'a list', 'In order', 1, 1, ([a]) =>
      [...list(a)].sort((x, y) => (typeof x === 'number' && typeof y === 'number' ? x - y : text(x).localeCompare(text(y), undefined, { numeric: true }))),
    ),
  ].map((f) => [f.name.toLowerCase(), f]),
);

export function evaluate(node: Node, scope: Scope): FValue {
  switch (node.k) {
    case 'lit':
      return node.v;
    case 'prop': {
      const v = scope.prop(node.name);
      if (v === undefined) throw new FormulaError(`There’s no property called “${node.name}”`, node.at);
      return v;
    }
    case 'if':
      return truthy(evaluate(node.c, scope)) ? evaluate(node.a, scope) : evaluate(node.b, scope);
    case 'un': {
      const a = evaluate(node.a, scope);
      if (node.op === 'not') return !truthy(a);
      const n = num(a, 'A minus sign');
      return n === null ? null : node.op === '-' ? -n : n;
    }
    case 'bin': {
      if (node.op === 'and') return truthy(evaluate(node.a, scope)) && truthy(evaluate(node.b, scope));
      if (node.op === 'or') return truthy(evaluate(node.a, scope)) || truthy(evaluate(node.b, scope));
      const a = evaluate(node.a, scope);
      const b = evaluate(node.b, scope);
      try {
        switch (node.op) {
          case '==':
            return equal(a, b);
          case '!=':
            return !equal(a, b);
          case '<':
          case '>':
          case '<=':
          case '>=':
            return compare(a, b, node.op);
          default: {
            const v = arithmetic(node.op, a, b);
            return isNum(v) ? cleanNumber(v) : v;
          }
        }
      } catch (e) {
        if (e instanceof FormulaError && e.at < 0) throw new FormulaError(e.message, node.at);
        throw e;
      }
    }
    case 'call': {
      const fn = FUNCTIONS[node.name];
      try {
        if (fn.lazy) return fn.lazy(node.args, scope);
        const v = fn.run!(
          node.args.map((a) => evaluate(a, scope)),
          scope,
        );
        return isNum(v) ? cleanNumber(v) : v;
      } catch (e) {
        if (e instanceof FormulaError && e.at < 0) throw new FormulaError(e.message, node.at);
        throw e;
      }
    }
  }
}

/** Runs a formula; errors come back as a FormulaError instead of throwing. */
export function run(src: string, scope: Scope): FValue | FormulaError {
  try {
    const v = evaluate(parse(src), scope);
    return typeof v === 'number' && !Number.isFinite(v) && !Number.isNaN(v) ? v : v;
  } catch (e) {
    return e instanceof FormulaError ? e : new FormulaError(e instanceof Error ? e.message : String(e));
  }
}
