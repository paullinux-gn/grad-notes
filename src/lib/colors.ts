/** The label palette (courses, events) and the accent colours. */

export const PALETTE = [
  { key: 'red', label: 'Red' },
  { key: 'orange', label: 'Orange' },
  { key: 'yellow', label: 'Yellow' },
  { key: 'green', label: 'Green' },
  { key: 'teal', label: 'Teal' },
  { key: 'blue', label: 'Blue' },
  { key: 'indigo', label: 'Indigo' },
  { key: 'purple', label: 'Purple' },
  { key: 'pink', label: 'Pink' },
  { key: 'gray', label: 'Gray' },
] as const;

export type ColorKey = (typeof PALETTE)[number]['key'];

export const ACCENTS = [
  { key: 'graphite', label: 'Graphite' },
  ...PALETTE.filter((c) => c.key !== 'gray'),
] as const;

/** A preset accent, or "custom" (made on the colour wheel). */
export type Accent = (typeof ACCENTS)[number]['key'] | 'custom';

/** CSS colour for a palette key; unknown or empty keys fall back to gray. */
export function colorVar(key: string | null | undefined): string {
  return PALETTE.some((c) => c.key === key) ? `var(--c-${key})` : 'var(--c-gray)';
}

/** A colour not used by any of `taken` yet (cycling once all are used). */
export function nextColor(taken: string[]): ColorKey {
  const keys = PALETTE.filter((c) => c.key !== 'gray').map((c) => c.key);
  return keys.find((k) => !taken.includes(k)) ?? keys[taken.length % keys.length];
}

/** Colour themes: surfaces and text for the whole app (see app.css). The
 * preview colours here only draw the little pictures in Settings. */
export const PALETTES = [
  { key: 'default', label: 'Default', light: ['#ffffff', '#f6f6f7', '#1d1d1f'], dark: ['#000000', '#0f0f10', '#f5f5f7'] },
  { key: 'paper', label: 'Paper', light: ['#fbf8f3', '#f3eee5', '#2b2620'], dark: ['#1a1814', '#211e19', '#f2ece2'] },
  { key: 'slate', label: 'Slate', light: ['#f8fafc', '#eef2f7', '#1b2333'], dark: ['#0e131b', '#121923', '#e7ecf4'] },
  { key: 'sage', label: 'Sage', light: ['#f8faf6', '#edf2e9', '#1e291d'], dark: ['#101510', '#141a14', '#e8efe5'] },
  { key: 'rose', label: 'Rose', light: ['#fdf8f8', '#f7eded', '#2c1f22'], dark: ['#191113', '#1f1517', '#f6eaec'] },
  { key: 'dusk', label: 'Dusk', light: ['#f9f8fd', '#efedf9', '#211e34'], dark: ['#12101c', '#171424', '#ecebf8'] },
] as const;

/** A preset theme, or "custom" (made on the colour wheel). */
export type Palette = (typeof PALETTES)[number]['key'] | 'custom';
