/** Menu actions for a page, shared by the sidebar and the title bar. */

import { generateJSON, type AnyExtension } from '@tiptap/core';
import { api } from './api';
import { toMarkdown, type JNode } from './markdown';
import { titleOf } from './editor/page-link';
import { buildExtensions } from './editor/extensions';
import { store } from './store.svelte';
import { ui, type MenuItem } from './ui.svelte';
import { prefs } from './prefs.svelte';
import { toDocx } from './docx';
import { exportImage } from './export-images';
import { cards } from './cards.svelte';
import { databases } from './databases.svelte';
import { split } from './split.svelte';

/** Saves the open editor and returns the page's document. */
async function pageDoc(id: string): Promise<{ title: string; doc: JNode }> {
  window.dispatchEvent(new Event('td:flush'));
  await store.flush();
  const page = await api.getPage(id);
  return { title: page.title || 'Untitled', doc: expandDatabases(docOf(page.content)) };
}

let extensions: AnyExtension[] | null = null;

/** A stored page body as editor JSON. */
export function docOf(content: string): JNode {
  if (!content) return { type: 'doc', content: [] };
  try {
    return JSON.parse(content);
  } catch {
    // A seeded page nobody has edited yet is still HTML: read it the way
    // the editor would.
    extensions ??= buildExtensions({ onMenu: () => {} });
    return generateJSON(content, extensions) as JNode;
  }
}

/** Databases inside a page export as their title and a table of their rows. */
export function expandDatabases(node: JNode): JNode {
  if (!node.content) return node;
  const content: JNode[] = [];
  for (const child of node.content) {
    if (child.type === 'databaseBlock' && child.attrs?.id) content.push(...databases.asTable(child.attrs.id, child.attrs.view ?? null));
    else content.push(expandDatabases(child));
  }
  return { ...node, content };
}

async function pageMarkdown(id: string): Promise<{ title: string; markdown: string }> {
  const { title, doc } = await pageDoc(id);
  return { title, markdown: toMarkdown(doc, title, titleOf) };
}

/** Writes the page as a Word document in Downloads. */
export async function exportWord(id: string) {
  try {
    const { title, doc } = await pageDoc(id);
    const bytes = await toDocx(doc, title, { titleOf, image: exportImage });
    const path = await api.exportDocument(title, 'docx', bytes);
    ui.toast(`Saved ${path.split(/[\\/]/).pop()} to Downloads`);
  } catch (e) {
    ui.error(e);
  }
}

/**
 * Saves the page as a PDF in Downloads: the page on its own, in plain light
 * colours (whatever the theme), with no print dialog and nothing stamped in
 * the margins.
 */
export async function exportPdf(id: string) {
  const page = store.byId.get(id);
  if (!page) return;
  if (store.currentId !== id || store.view !== 'page') {
    store.open(id);
    // Wait for the page to load and render.
    for (let i = 0; i < 40 && !document.querySelector('.page .ProseMirror'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
  }
  window.dispatchEvent(new Event('td:flush'));
  const root = document.documentElement;
  const { theme, palette } = root.dataset;
  const scheme = root.style.colorScheme;
  root.dataset.theme = 'light';
  root.dataset.palette = 'default';
  root.style.colorScheme = 'light';
  root.classList.add('printing');
  try {
    // WebKitGTK does not expose WebView2's silent PrintToPdf API. Its native
    // print dialog includes “Save to PDF”, so let the user choose that output.
    if (navigator.userAgent.includes('Linux') || navigator.platform.startsWith('Linux')) {
      window.print();
      return;
    }
    const path = await api.exportPdf(page.title || 'Untitled');
    ui.toast(`Saved ${path.split(/[\\/]/).pop()} to Downloads`);
  } catch (e) {
    ui.error(e);
  } finally {
    root.dataset.theme = theme;
    root.dataset.palette = palette;
    root.style.colorScheme = scheme;
    root.classList.remove('printing');
  }
}

/** A database's menu: no sub-pages or document exports, but CSV. */
function databaseMenuItems(id: string, sidebar: boolean): MenuItem[] {
  const page = store.byId.get(id)!;
  const view = databases.view(id, prefs.dbViews[id]);
  return [
    { label: page.favorite ? 'Remove from Favorites' : 'Add to Favorites', icon: 'star', action: () => store.toggleFavorite(id) },
    { label: 'Open to the Side', icon: 'split', hint: 'Alt+click', action: () => split.show(id) },
    ...(sidebar
      ? [
          {
            label: 'Rename',
            icon: 'pencil',
            action: () => {
              store.open(id);
              ui.focusTitle = id;
            },
          },
        ]
      : []),
    { label: 'Duplicate', icon: 'copy', hint: 'with its rows', action: () => void store.duplicate(id) },
    { separator: true },
    { label: 'Export as CSV', icon: 'download', hint: view?.name, action: () => view && void databases.exportCsv(id, view.id) },
    { separator: true },
    { label: 'Move to Trash', icon: 'trash', danger: true, action: () => void store.trashPage(id) },
    { separator: true },
    { header: `${databases.rowCount(id).toLocaleString()} rows · created ${new Date(page.createdAt).toLocaleDateString()}` },
  ];
}

export function pageMenuItems(id: string, opts: { words?: number; sidebar?: boolean } = {}): MenuItem[] {
  const page = store.byId.get(id);
  if (!page) return [];
  if (page.kind === 'database') return databaseMenuItems(id, !!opts.sidebar);
  const items: MenuItem[] = [
    {
      label: page.favorite ? 'Remove from Favorites' : 'Add to Favorites',
      icon: 'star',
      action: () => store.toggleFavorite(id),
    },
    { label: 'Open to the Side', icon: 'split', hint: 'Alt+click', action: () => split.show(id) },
  ];
  if (opts.sidebar) {
    items.push(
      { label: 'Add Subpage', icon: 'page-plus', action: () => void store.create(id) },
      {
        label: 'Rename',
        icon: 'pencil',
        action: () => {
          store.open(id);
          ui.focusTitle = id;
        },
      },
    );
  }
  items.push({ label: 'Duplicate', icon: 'copy', action: () => void store.duplicate(id) });
  // A database row can become a template; a template makes rows.
  const row = databases.rows[id];
  if (row && !row.template) items.push({ label: 'Save as Template', icon: 'template', action: () => void databases.newTemplate(row.dbId, row) });
  if (row?.template) {
    items.push({
      label: 'New Row from Template',
      icon: 'plus',
      action: async () => {
        const made = await databases.addRow(row.dbId, { template: row.id });
        if (made) {
          store.open(made.id);
          ui.focusTitle = made.id;
        }
      },
    });
  }
  const deck = cards.deck(id);
  if (deck) {
    items.push({ label: `Study ${deck.count} Flashcard${deck.count === 1 ? '' : 's'}`, icon: 'cards', action: () => void cards.study([id], page.title || 'Untitled', { all: !(deck.due + deck.fresh) }) });
  }
  if (!opts.sidebar) {
    items.push({
      label: 'Full Width',
      icon: 'width',
      checked: page.fullWidth,
      action: () => store.update(id, { fullWidth: !page.fullWidth }, { immediate: true }),
    });
  }
  items.push(
    { separator: true },
    {
      label: 'Copy as Markdown',
      icon: 'clipboard',
      action: async () => {
        try {
          const { markdown } = await pageMarkdown(id);
          await navigator.clipboard.writeText(markdown);
          ui.toast('Copied as Markdown');
        } catch (e) {
          ui.error(e);
        }
      },
    },
    { label: 'Export as PDF', icon: 'file-text', action: () => void exportPdf(id) },
    { label: 'Export as Word', icon: 'file', action: () => void exportWord(id) },
    {
      label: 'Export as Markdown',
      icon: 'download',
      action: async () => {
        try {
          const { title, markdown } = await pageMarkdown(id);
          const path = await api.exportMarkdown(title, markdown);
          ui.toast(`Saved ${path.split(/[\\/]/).pop()} to Downloads`);
        } catch (e) {
          ui.error(e);
        }
      },
    },
    { separator: true },
    { label: 'Move to Trash', icon: 'trash', danger: true, action: () => void store.trashPage(id) },
  );
  if (opts.words !== undefined) {
    items.push({ separator: true }, { header: `${opts.words.toLocaleString()} words · created ${new Date(page.createdAt).toLocaleDateString()}` });
  }
  return items;
}
