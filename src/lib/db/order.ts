/**
 * Order keys: strings that sort in the order things are shown, so moving a
 * row between two others gives it a key between theirs and nothing else is
 * renumbered (two devices reordering at once can't overwrite each other).
 *
 * A key is a variable-length "integer" part (its first letter says how long
 * it is) followed by an optional fraction, in base 62. Appending one after
 * another stays short ("a0", "a1", … "az", "b00"…); inserting between two
 * neighbours adds a character only now and then.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ZERO = DIGITS[0];
const SMALLEST_INT = 'A' + ZERO.repeat(26);

function intLength(head: string): number {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 97 + 2;
  if (head >= 'A' && head <= 'Z') return 90 - head.charCodeAt(0) + 2;
  throw new Error(`Bad order key head “${head}”`);
}

function intPart(key: string): string {
  const n = intLength(key[0]);
  if (n > key.length) throw new Error(`Bad order key “${key}”`);
  return key.slice(0, n);
}

/** A key between a and b (a < b); either side may be open. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] || ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = a ? DIGITS.indexOf(a[0]) : 0;
  const db = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)];
  if (b && b.length > 1) return b.slice(0, 1);
  return DIGITS[da] + midpoint(a.slice(1), null);
}

function increment(x: string): string | null {
  const [head, ...digs] = x.split('');
  let carry = true;
  for (let i = digs.length - 1; carry && i >= 0; i--) {
    const d = DIGITS.indexOf(digs[i]) + 1;
    if (d === DIGITS.length) digs[i] = ZERO;
    else {
      digs[i] = DIGITS[d];
      carry = false;
    }
  }
  if (!carry) return head + digs.join('');
  if (head === 'Z') return 'a' + ZERO;
  if (head === 'z') return null;
  const h = String.fromCharCode(head.charCodeAt(0) + 1);
  if (h > 'a') digs.push(ZERO);
  else digs.pop();
  return h + digs.join('');
}

function decrement(x: string): string | null {
  const [head, ...digs] = x.split('');
  let borrow = true;
  for (let i = digs.length - 1; borrow && i >= 0; i--) {
    const d = DIGITS.indexOf(digs[i]) - 1;
    if (d === -1) digs[i] = DIGITS[DIGITS.length - 1];
    else {
      digs[i] = DIGITS[d];
      borrow = false;
    }
  }
  if (!borrow) return head + digs.join('');
  if (head === 'a') return 'Z' + DIGITS[DIGITS.length - 1];
  if (head === 'A') return null;
  const h = String.fromCharCode(head.charCodeAt(0) - 1);
  if (h < 'Z') digs.push(DIGITS[DIGITS.length - 1]);
  else digs.pop();
  return h + digs.join('');
}

/** Whether a key is well formed (keys from elsewhere are checked first). */
export function validKey(key: string): boolean {
  try {
    if (!key || key === SMALLEST_INT) return false;
    const i = intPart(key);
    if (![...key].every((c) => DIGITS.includes(c))) return false;
    return !key.slice(i.length).endsWith(ZERO);
  } catch {
    return false;
  }
}

/**
 * A key that sorts after `a` and before `b` (null: the start or the end).
 * Keys that aren't well formed (or not in order) are treated as open ends.
 */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && !validKey(a)) a = null;
  if (b !== null && !validKey(b)) b = null;
  if (a !== null && b !== null && a >= b) b = null;
  if (a === null) {
    if (b === null) return 'a' + ZERO;
    const ib = intPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INT) return ib + midpoint('', fb);
    if (ib < b) return ib;
    return decrement(ib) ?? ib + midpoint('', fb);
  }
  if (b === null) {
    const ia = intPart(a);
    const fa = a.slice(ia.length);
    return increment(ia) ?? ia + midpoint(fa, null);
  }
  const ia = intPart(a);
  const fa = a.slice(ia.length);
  const ib = intPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) return ia + midpoint(fa, fb);
  const i = increment(ia);
  if (i !== null && i < b) return i;
  return ia + midpoint(fa, null);
}

/** `n` keys in order between a and b (for pasting or importing many rows). */
export function keysBetween(a: string | null, b: string | null, n: number): string[] {
  if (n <= 0) return [];
  if (b === null) {
    const out: string[] = [];
    let last = a;
    for (let i = 0; i < n; i++) out.push((last = keyBetween(last, null)));
    return out;
  }
  if (n === 1) return [keyBetween(a, b)];
  // Split the gap in half, then fill each side.
  const mid = keyBetween(a, b);
  const left = Math.floor((n - 1) / 2);
  return [...keysBetween(a, mid, left), mid, ...keysBetween(mid, b, n - 1 - left)];
}

/** Sorts by key, ties (two devices picked the same) by id. */
export function byKey<T extends { sortKey: string; id: string }>(a: T, b: T): number {
  return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
