/** The file library: imports, previews, renames and trash for files. */

import { api, fileUrl } from './api';
import { planner } from './planner.svelte';
import { store } from './store.svelte';
import { ui } from './ui.svelte';
import type { Assignment, FileMeta, PageMeta } from './types';

/** Big enough for lecture recordings, small enough to read into memory. */
const MAX_BYTES = 250 * 1024 * 1024;

export type FileKind = 'image' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'audio' | 'video' | 'archive' | 'code' | 'text' | 'other';

export const KINDS: Record<FileKind, { label: string; icon: string; color: string }> = {
  image: { label: 'Image', icon: 'image', color: 'var(--c-blue)' },
  pdf: { label: 'PDF', icon: 'file-text', color: 'var(--c-red)' },
  doc: { label: 'Document', icon: 'file-text', color: 'var(--c-indigo)' },
  sheet: { label: 'Spreadsheet', icon: 'sheet', color: 'var(--c-green)' },
  slides: { label: 'Presentation', icon: 'presentation', color: 'var(--c-orange)' },
  audio: { label: 'Audio', icon: 'music', color: 'var(--c-pink)' },
  video: { label: 'Video', icon: 'film', color: 'var(--c-purple)' },
  archive: { label: 'Archive', icon: 'archive', color: 'var(--c-gray)' },
  code: { label: 'Code', icon: 'code', color: 'var(--c-teal)' },
  text: { label: 'Text', icon: 'file-text', color: 'var(--c-gray)' },
  other: { label: 'File', icon: 'file', color: 'var(--c-gray)' },
};

const EXT_KIND: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc', pages: 'doc',
  xls: 'sheet', xlsx: 'sheet', ods: 'sheet', csv: 'sheet', tsv: 'sheet', numbers: 'sheet',
  ppt: 'slides', pptx: 'slides', odp: 'slides', key: 'slides',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  js: 'code', ts: 'code', py: 'code', rs: 'code', c: 'code', cpp: 'code', h: 'code', java: 'code',
  json: 'code', html: 'code', css: 'code', sql: 'code', ipynb: 'code', tex: 'code',
  txt: 'text', md: 'text', log: 'text',
};

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function fileKind(f: { name: string; mime: string }): FileKind {
  const byExt = EXT_KIND[extOf(f.name)];
  if (byExt) return byExt;
  if (f.mime.startsWith('image/')) return 'image';
  if (f.mime.startsWith('audio/')) return 'audio';
  if (f.mime.startsWith('video/')) return 'video';
  if (f.mime.startsWith('text/')) return 'text';
  return 'other';
}

/** What the in-app preview can show for a kind. */
export function previewable(f: FileMeta): 'image' | 'pdf' | 'audio' | 'video' | 'text' | null {
  if (f.missing) return null;
  const kind = fileKind(f);
  if (kind === 'image' || kind === 'pdf' || kind === 'audio' || kind === 'video') return kind;
  if (kind === 'text' || kind === 'code' || extOf(f.name) === 'csv' || extOf(f.name) === 'tsv') return 'text';
  return null;
}

export function fileSrc(f: FileMeta): string {
  return fileUrl(f.stored);
}

/** Opens the system file picker. Resolves with nothing when cancelled. */
export function pickFiles({ multiple = true, accept = '' } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    if (accept) input.accept = accept;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

class Library {
  files = $state<FileMeta[]>([]);
  /** File id → ids of live pages that show or link to it. */
  usage = $state.raw<Record<string, string[]>>({});
  loaded = $state(false);

  byId = $derived(new Map(this.files.map((f) => [f.id, f])));
  /** Live files, newest first. */
  live = $derived(this.files.filter((f) => !f.deletedAt).sort((a, b) => b.createdAt - a.createdAt));
  totalBytes = $derived(this.live.reduce((n, f) => n + f.size, 0));

  /** File id → number of live pages and assignments using it, in one pass. */
  #useCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const [fileId, pageIds] of Object.entries(this.usage)) {
      const n = pageIds.filter((pid) => {
        const p = store.byId.get(pid);
        return p && !p.deletedAt;
      }).length;
      if (n) counts.set(fileId, n);
    }
    for (const a of planner.live) for (const fileId of a.fileIds) counts.set(fileId, (counts.get(fileId) ?? 0) + 1);
    return counts;
  });

  /** How many places use a file (what `usedIn` lists, counted). */
  useCount(id: string): number {
    return this.#useCounts.get(id) ?? 0;
  }

  async load() {
    this.files = await api.listFiles();
    this.loaded = true;
    void this.refreshUsage();
  }

  async refreshUsage() {
    try {
      await store.flush();
      const list = await api.fileUsage();
      this.usage = Object.fromEntries(list.map((u) => [u.fileId, u.pageIds]));
    } catch (e) {
      console.error(e);
    }
  }

  /** Copies files into the library. Returns the ones that made it. */
  async add(files: File[]): Promise<FileMeta[]> {
    const added: FileMeta[] = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        ui.toast(`“${file.name}” is larger than 250 MB`);
        continue;
      }
      try {
        const meta = await api.saveFile(file, file.name || 'Untitled');
        this.files.push(meta);
        added.push(meta);
      } catch (e) {
        ui.error(e);
      }
    }
    return added;
  }

  /** Pages and assignments that use a file. */
  usedIn(id: string): { pages: PageMeta[]; assignments: Assignment[] } {
    const pages = (this.usage[id] ?? []).map((pid) => store.byId.get(pid)).filter((p): p is PageMeta => !!p && !p.deletedAt);
    const assignments = planner.live.filter((a) => a.fileIds.includes(id));
    return { pages, assignments };
  }

  async rename(id: string, name: string) {
    const f = this.byId.get(id);
    const clean = name.trim();
    if (!f || !clean || clean === f.name) return;
    f.name = clean;
    try {
      Object.assign(f, await api.updateFile(id, { name: clean }));
    } catch (e) {
      ui.error(e);
    }
  }

  async trash(id: string) {
    const f = this.byId.get(id);
    if (!f) return;
    const { pages, assignments } = this.usedIn(id);
    const uses = pages.length + assignments.length;
    if (uses) {
      const ok = await ui.confirm({
        title: 'Move to Trash?',
        message: `“${f.name}” is used in ${uses} place${uses === 1 ? '' : 's'}. It keeps working there until you empty the Trash.`,
        confirmLabel: 'Move to Trash',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      f.deletedAt = await api.trashItem('files', id);
      if (ui.filePreview === id) ui.filePreview = null;
      ui.toast(`Moved “${f.name}” to Trash`, { label: 'Undo', run: () => void this.restore(id) });
    } catch (e) {
      ui.error(e);
    }
  }

  async restore(id: string) {
    try {
      await api.restoreItem('files', id);
      const f = this.byId.get(id);
      if (f) f.deletedAt = null;
    } catch (e) {
      ui.error(e);
    }
  }

  async deleteForever(id: string) {
    try {
      await api.deleteItem('files', id);
      this.files = this.files.filter((f) => f.id !== id);
      for (const a of planner.assignments) a.fileIds = a.fileIds.filter((x) => x !== id);
    } catch (e) {
      ui.error(e);
    }
  }

  preview(id: string) {
    if (this.byId.get(id)?.deletedAt) return;
    ui.filePreview = id;
  }

  async open(id: string) {
    try {
      await api.openFile(id);
    } catch (e) {
      ui.error(e);
    }
  }

  async reveal(id: string) {
    try {
      await api.revealFile(id);
    } catch (e) {
      ui.error(e);
    }
  }

  async saveCopy(id: string) {
    try {
      const path = await api.exportFile(id);
      ui.toast(`Saved ${path.split(/[\\/]/).pop()} to Downloads`);
    } catch (e) {
      ui.error(e);
    }
  }
}

export const library = new Library();
