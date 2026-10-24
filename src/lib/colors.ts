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

const COURSE_RGB: Record<string, { light: string; dark: string }> = {
  red: { light: '255, 59, 48', dark: '255, 69, 58' },
  orange: { light: '255, 149, 0', dark: '255, 159, 10' },
  yellow: { light: '255, 204, 0', dark: '255, 214, 10' },
  green: { light: '52, 199, 89', dark: '48, 209, 88' },
  teal: { light: '48, 176, 199', dark: '64, 200, 224' },
  blue: { light: '0, 122, 255', dark: '10, 132, 255' },
  indigo: { light: '88, 86, 214', dark: '94, 92, 230' },
  purple: { light: '175, 82, 222', dark: '191, 90, 242' },
  pink: { light: '255, 45, 85', dark: '255, 55, 95' },
  gray: { light: '142, 142, 147', dark: '152, 152, 157' },
};

/** A literal RGBA fill, so GTK's WebKit does not need CSS color-mix support. */
export function courseColorRgba(key: string | null | undefined, alpha: number): string {
  const values = COURSE_RGB[key ?? ''] ?? COURSE_RGB.gray;
  const appearance = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  return `rgba(${values[appearance]}, ${alpha})`;
}

export function colorRgbVar(key: string | null | undefined): string {
  return PALETTE.some((c) => c.key === key) ? `var(--c-${key}-rgb)` : 'var(--c-gray-rgb)';
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
