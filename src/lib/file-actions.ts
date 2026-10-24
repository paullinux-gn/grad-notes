/** Context menu for a library file, shared by Files, previews and pages. */

import { library, previewable } from './library.svelte';
import { ui, type MenuItem } from './ui.svelte';

export async function renameFile(id: string) {
  const f = library.byId.get(id);
  if (!f) return;
  const res = await ui.prompt({ title: 'Rename File', value: f.name, confirmLabel: 'Rename', icon: 'file', select: 'stem' });
  if (res) await library.rename(id, res.value);
}

export function fileMenuItems(id: string, { preview = true } = {}): MenuItem[] {
  const f = library.byId.get(id);
  if (!f) return [];
  const items: MenuItem[] = [];
  if (preview) items.push({ label: previewable(f) ? 'Preview' : 'Get Info', icon: 'eye', action: () => library.preview(id) });
  items.push(
    { label: 'Open in Default App', icon: 'external', disabled: f.missing, action: () => void library.open(id) },
    { label: 'Show in Folder', icon: 'folder', disabled: f.missing, action: () => void library.reveal(id) },
    { label: 'Save a Copy to Downloads', icon: 'download', disabled: f.missing, action: () => void library.saveCopy(id) },
    { separator: true },
    { label: 'Rename…', icon: 'pencil', action: () => void renameFile(id) },
    { separator: true },
    { label: 'Move to Trash', icon: 'trash', danger: true, action: () => void library.trash(id) },
  );
  return items;
}
