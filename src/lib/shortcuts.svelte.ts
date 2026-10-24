/**
 * Keyboard shortcuts: the commands that have one, their defaults, and the
 * user's own choices (Settings → Keyboard). A shortcut is written as
 * modifiers then a key code, e.g. "Mod+Shift+KeyL" or "Alt+ArrowLeft"; "Mod"
 * is Ctrl. Key codes name physical keys, so they work on any layout.
 */

import { prefs } from './prefs.svelte';

export type ShortcutId =
  | 'search'
  | 'newPage'
  | 'capture'
  | 'goHome'
  | 'goAssignments'
  | 'goCalendar'
  | 'goFiles'
  | 'goCards'
  | 'sidebar'
  | 'theme'
  | 'settings'
  | 'help'
  | 'split'
  | 'back'
  | 'forward'
  | 'calendarPrev'
  | 'calendarNext'
  | 'calendarToday'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset';

export interface ShortcutDef {
  id: ShortcutId;
  label: string;
  group: 'General' | 'Go To' | 'Calendar';
  defaults: string[];
  /** May be a single key with no modifier (only where typing can't happen). */
  bare?: boolean;
  /** Also works system-wide (Quick Capture). */
  global?: boolean;
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'search', label: 'Search everything', group: 'General', defaults: ['Mod+KeyK', 'Mod+KeyP'] },
  { id: 'newPage', label: 'New page', group: 'General', defaults: ['Mod+KeyN'] },
  { id: 'capture', label: 'Quick Capture', group: 'General', defaults: ['Mod+Shift+Space'], global: true },
  { id: 'sidebar', label: 'Show or hide the sidebar', group: 'General', defaults: ['Mod+Backslash'] },
  { id: 'split', label: 'Split view (a second page beside this one)', group: 'General', defaults: ['Mod+Shift+Backslash'] },
  { id: 'theme', label: 'Light or dark', group: 'General', defaults: ['Mod+Shift+KeyL'] },
  { id: 'settings', label: 'Settings', group: 'General', defaults: ['Mod+Comma'] },
  { id: 'help', label: 'Keyboard shortcuts', group: 'General', defaults: ['Mod+Slash'] },
  { id: 'back', label: 'Back', group: 'General', defaults: ['Alt+ArrowLeft'] },
  { id: 'forward', label: 'Forward', group: 'General', defaults: ['Alt+ArrowRight'] },
  { id: 'zoomIn', label: 'Zoom in', group: 'General', defaults: ['Mod+Equal', 'Mod+Shift+Equal', 'Mod+NumpadAdd'] },
  { id: 'zoomOut', label: 'Zoom out', group: 'General', defaults: ['Mod+Minus', 'Mod+NumpadSubtract'] },
  { id: 'zoomReset', label: 'Actual size', group: 'General', defaults: ['Mod+Digit0', 'Mod+Numpad0'] },
  { id: 'goHome', label: 'Home', group: 'Go To', defaults: ['Mod+Digit1'] },
  { id: 'goAssignments', label: 'Assignments', group: 'Go To', defaults: ['Mod+Digit2'] },
  { id: 'goCalendar', label: 'Calendar', group: 'Go To', defaults: ['Mod+Digit3'] },
  { id: 'goFiles', label: 'Files', group: 'Go To', defaults: ['Mod+Digit4'] },
  { id: 'goCards', label: 'Flashcards', group: 'Go To', defaults: ['Mod+Digit5'] },
  { id: 'calendarPrev', label: 'Previous month or week', group: 'Calendar', defaults: ['ArrowLeft'], bare: true },
  { id: 'calendarNext', label: 'Next month or week', group: 'Calendar', defaults: ['ArrowRight'], bare: true },
  { id: 'calendarToday', label: 'Today', group: 'Calendar', defaults: ['KeyT'], bare: true },
];

/** Shortcuts the editor (and the system) own; they can't be reassigned. */
export const RESERVED: Record<string, string> = {
  'Mod+KeyA': 'Select all',
  'Mod+KeyB': 'Bold',
  'Mod+KeyC': 'Copy',
  'Mod+KeyD': 'Duplicate block',
  'Mod+KeyE': 'Inline code',
  'Mod+KeyI': 'Italic',
  'Mod+KeyS': 'Save',
  'Mod+KeyU': 'Underline',
  'Mod+KeyV': 'Paste',
  'Mod+KeyX': 'Cut',
  'Mod+KeyY': 'Redo',
  'Mod+KeyZ': 'Undo',
  'Mod+Shift+KeyZ': 'Redo',
  'Mod+Shift+KeyS': 'Strikethrough',
  'Mod+Shift+KeyH': 'Highlight',
  'Mod+Shift+KeyE': 'Inline math',
  'Mod+Alt+Digit1': 'Heading 1',
  'Mod+Alt+Digit2': 'Heading 2',
  'Mod+Alt+Digit3': 'Heading 3',
  'Alt+F4': 'Close window',
};

/** Shortcuts the editor keeps, as keycaps (shown in Settings for reference). */
export const EDITOR_KEYS: { label: string; keys: string[][] }[] = [
  { label: 'Insert a block', keys: [['/']] },
  { label: 'Link a page, assignment or file', keys: [['@']] },
  { label: 'Add a link to selected text', keys: [['Ctrl', 'K']] },
  { label: 'Bold, italic, underline', keys: [['Ctrl', 'B'], ['Ctrl', 'I'], ['Ctrl', 'U']] },
  { label: 'Duplicate block', keys: [['Ctrl', 'D']] },
  { label: 'Inline math (or turn selected text into math)', keys: [['Ctrl', 'Shift', 'E']] },
  { label: 'Inline math as you type', keys: [['$', 'x^2', '$']] },
  { label: 'In a formula: suggestions, next gap, done', keys: [['\\'], ['Tab'], ['Enter']] },
  { label: 'Indent list item', keys: [['Tab'], ['Shift', 'Tab']] },
  { label: 'Flashcards: show answer, then rate', keys: [['Space'], ['1'], ['2'], ['3'], ['4']] },
];

/** Typing these at the start of a line (then Space, unless `now`) turns it into a block. */
export const MARKDOWN_KEYS: { label: string; type: string; now?: boolean }[] = [
  { label: 'Heading', type: '#' },
  { label: 'Bulleted list', type: '-' },
  { label: 'Numbered list', type: '1.' },
  { label: 'Checklist', type: '[ ]' },
  { label: 'Quote', type: '>' },
  { label: 'Code block', type: '```' },
  { label: 'Math block', type: '$$' },
  { label: 'Divider', type: '---', now: true },
];

const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

/** The shortcut a key press makes, or null for a bare modifier. */
export function comboOf(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code) || !e.code) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.code);
  return parts.join('+');
}

const KEY_NAMES: Record<string, string> = {
  Mod: 'Ctrl',
  Backslash: '\\',
  Slash: '/',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Delete: 'Del',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

/** One key's name: "KeyK" → "K", "Digit1" → "1". */
export function keyName(part: string): string {
  if (part.startsWith('Key')) return part.slice(3);
  if (part.startsWith('Digit')) return part.slice(5);
  if (part.startsWith('Numpad')) return `Num ${part.slice(6)}`;
  return KEY_NAMES[part] ?? part;
}

/** The keys of a shortcut, for keycaps: ["Ctrl", "Shift", "L"]. */
export const comboKeys = (combo: string) => combo.split('+').map(keyName);

/** "Ctrl+Shift+L", for tooltips. */
export const comboLabel = (combo: string) => comboKeys(combo).join('+');

/** The form the system-wide shortcut takes on the Rust side. */
export const toAccelerator = (combo: string) => combo.replace(/^Mod\b/, 'CmdOrCtrl');

class Shortcuts {
  /** The shortcuts in effect for a command (the user's, or the defaults). */
  combos(id: ShortcutId): string[] {
    const custom = prefs.shortcuts[id];
    return custom !== undefined ? (custom ? [custom] : []) : (SHORTCUTS.find((s) => s.id === id)?.defaults ?? []);
  }

  /** The first shortcut's label, for tooltips ("" when there's none). */
  label(id: ShortcutId): string {
    const first = this.combos(id)[0];
    return first ? comboLabel(first) : '';
  }

  matches(e: KeyboardEvent, id: ShortcutId): boolean {
    const combo = comboOf(e);
    return !!combo && this.combos(id).includes(combo);
  }

  /** The command a key press stands for, if any. */
  match(e: KeyboardEvent, among: ShortcutId[] = SHORTCUTS.map((s) => s.id)): ShortcutId | null {
    const combo = comboOf(e);
    if (!combo) return null;
    return among.find((id) => this.combos(id).includes(combo)) ?? null;
  }

  isCustom(id: ShortcutId): boolean {
    return prefs.shortcuts[id] !== undefined;
  }

  /** Who else uses a shortcut (another command, or the editor). */
  conflict(id: ShortcutId, combo: string): { id?: ShortcutId; label: string } | null {
    if (RESERVED[combo]) return { label: RESERVED[combo] };
    for (const s of SHORTCUTS) {
      if (s.id !== id && this.combos(s.id).includes(combo)) return { id: s.id, label: s.label };
    }
    return null;
  }

  /** Sets a command's shortcut (null: none), taking it from another command. */
  set(id: ShortcutId, combo: string | null) {
    const next = { ...prefs.shortcuts };
    if (combo) {
      for (const s of SHORTCUTS) {
        if (s.id === id || !this.combos(s.id).includes(combo)) continue;
        const rest = this.combos(s.id).filter((c) => c !== combo);
        next[s.id] = rest[0] ?? null;
      }
    }
    next[id] = combo;
    // Back to the defaults: forget the override.
    const def = SHORTCUTS.find((s) => s.id === id)!.defaults;
    if (combo && def.length === 1 && def[0] === combo) delete next[id];
    prefs.shortcuts = next;
  }

  /** Back to the default (all of them without `id`). A default that another
   * command took in the meantime is taken back from it. */
  reset(id?: ShortcutId) {
    if (!id) {
      prefs.shortcuts = {};
      return;
    }
    const next: Partial<Record<ShortcutId, string | null>> = { ...prefs.shortcuts };
    delete next[id];
    const defaults = SHORTCUTS.find((s) => s.id === id)!.defaults;
    for (const s of SHORTCUTS) {
      const custom = next[s.id];
      if (s.id !== id && custom && defaults.includes(custom)) next[s.id] = null;
    }
    prefs.shortcuts = next;
  }
}

export const shortcuts = new Shortcuts();
