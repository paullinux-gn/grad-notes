import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { clock } from '../clock.svelte';
import { formatDate, formatDue } from '../dates';
import { KINDS, fileKind, library } from '../library.svelte';
import { planner } from '../planner.svelte';
import { store } from '../store.svelte';
import type { MentionKind } from './page-link';
import { rankGroups, suggestionRenderer, type MenuEntry } from './suggestion.svelte';

function insertMention(editor: Editor, range: Range | null, id: string, kind: MentionKind) {
  const content = [{ type: 'mention', attrs: { id, kind } }, { type: 'text', text: ' ' }];
  const chain = editor.chain().focus();
  if (range) chain.insertContentAt(range, content).run();
  else chain.insertContent(content).run();
}

/**
 * "@" links to anything in the workspace: pages, assignments, events and
 * files. With no query it offers recent pages and what's due next.
 */
export const MentionSuggest = Extension.create({
  name: 'mentionSuggest',
  addProseMirrorPlugins() {
    return [
      Suggestion<MenuEntry, MenuEntry>({
        editor: this.editor,
        pluginKey: new PluginKey('mentionSuggest'),
        char: '@',
        allowSpaces: true,
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => {
          const q = query.trim();
          const pages: MenuEntry[] = store.all
            .filter((p) => !p.deletedAt && p.id !== store.currentId)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((p) => {
              const path = store.ancestors(p.id).map((a) => a.title || 'Untitled');
              return {
                id: p.id,
                title: p.title || 'Untitled',
                description: path.length ? path.join(' / ') : undefined,
                emoji: p.icon || undefined,
                icon: p.icon ? undefined : 'page',
                group: 'Pages',
                run: (editor, range) => insertMention(editor, range, p.id, 'page'),
              };
            });
          const assignments: MenuEntry[] = planner.live
            .filter((a) => (q ? true : a.status !== 'done'))
            .map((a) => ({
              id: `a:${a.id}`,
              title: a.title || 'Untitled',
              description: [a.courseId ? planner.courseById.get(a.courseId)?.name : null, formatDue(a.dueDate, a.dueTime, clock.today)]
                .filter(Boolean)
                .join(' · '),
              icon: 'assignment',
              keywords: a.courseId ? planner.courseById.get(a.courseId)?.name : undefined,
              group: 'Assignments',
              run: (editor, range) => insertMention(editor, range, a.id, 'assignment'),
            }));
          const events: MenuEntry[] = planner.liveEvents
            .filter((e) => (q ? true : e.endDate >= clock.today))
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .map((e) => ({
              id: `e:${e.id}`,
              title: e.title || 'Untitled',
              description: formatDate(e.startDate) + (e.repeat !== 'none' ? ' · repeats' : ''),
              icon: 'calendar',
              group: 'Events',
              run: (editor, range) => insertMention(editor, range, e.id, 'event'),
            }));
          const files: MenuEntry[] = library.live.map((f) => ({
            id: `f:${f.id}`,
            title: f.name,
            description: KINDS[fileKind(f)].label,
            icon: KINDS[fileKind(f)].icon,
            group: 'Files',
            run: (editor, range) => insertMention(editor, range, f.id, 'file'),
          }));

          const results: MenuEntry[] = q
            ? rankGroups([[pages, 5], [assignments, 4], [events, 3], [files, 3]], q)
            : [...pages.slice(0, 5), ...assignments.slice(0, 3), ...events.slice(0, 2), ...files.slice(0, 2)];
          if (q) {
            results.push(
              {
                id: '__page__',
                title: `New page “${q}”`,
                description: 'Create it inside this page',
                icon: 'page-plus',
                group: 'Create',
                run: (editor, range) => {
                  editor.chain().focus().deleteRange(range).run();
                  void store.create(store.currentId, { open: false, title: q }).then((meta) => {
                    if (meta && !editor.isDestroyed) insertMention(editor, null, meta.id, 'page');
                  });
                },
              },
              {
                id: '__assignment__',
                title: `New assignment “${q}”`,
                description: 'Add it to Assignments',
                icon: 'assignment',
                group: 'Create',
                run: (editor, range) => {
                  editor.chain().focus().deleteRange(range).run();
                  void planner.addAssignment({ title: q }).then((a) => {
                    if (a && !editor.isDestroyed) insertMention(editor, null, a.id, 'assignment');
                  });
                },
              },
            );
          }
          return results;
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: suggestionRenderer('Nothing found'),
      }),
    ];
  },
});
