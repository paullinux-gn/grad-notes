import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { clock } from '../clock.svelte';
import { planner } from '../planner.svelte';
import { store } from '../store.svelte';
import { ui } from '../ui.svelte';
import { databases } from '../databases.svelte';
import { insertFiles, insertImage, pickImageFile } from './images';
import { rank, suggestionRenderer, type MenuEntry } from './suggestion.svelte';
import { iconText } from '../page-icon';

const clear = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

/** The caret's position on screen, for anchoring popovers. */
function caretRect(editor: Editor): DOMRect {
  const c = editor.view.coordsAtPos(editor.state.selection.from);
  return new DOMRect(c.left, c.top, 0, c.bottom - c.top);
}

/** Inserts an inline link to a just-created assignment or event. */
function linkCreated(editor: Editor, kind: 'assignment' | 'event') {
  return (id: string) => {
    if (editor.isDestroyed) return;
    editor
      .chain()
      .focus()
      .insertContent([{ type: 'mention', attrs: { id, kind } }, { type: 'text', text: ' ' }])
      .run();
  };
}

export const SLASH_ITEMS: MenuEntry[] = [
  {
    id: 'text',
    group: 'Basic Blocks',
    title: 'Text',
    description: 'Plain paragraph',
    icon: 'text',
    keywords: 'paragraph plain',
    run: (e, r) => clear(e, r).setParagraph().run(),
  },
  {
    id: 'h1',
    group: 'Basic Blocks',
    title: 'Heading 1',
    description: 'Big section heading',
    label: 'H1',
    hint: '#',
    keywords: 'title h1 big',
    run: (e, r) => clear(e, r).setHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    group: 'Basic Blocks',
    title: 'Heading 2',
    description: 'Medium section heading',
    label: 'H2',
    hint: '##',
    keywords: 'subtitle h2',
    run: (e, r) => clear(e, r).setHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    group: 'Basic Blocks',
    title: 'Heading 3',
    description: 'Small section heading',
    label: 'H3',
    hint: '###',
    keywords: 'h3',
    run: (e, r) => clear(e, r).setHeading({ level: 3 }).run(),
  },
  {
    id: 'todo',
    group: 'Basic Blocks',
    title: 'To-do List',
    description: 'Track tasks with checkboxes',
    icon: 'todo',
    hint: '[]',
    keywords: 'todo task checkbox check checklist',
    run: (e, r) => clear(e, r).toggleTaskList().run(),
  },
  {
    id: 'bullet',
    group: 'Basic Blocks',
    title: 'Bulleted List',
    description: 'A simple bulleted list',
    icon: 'list',
    hint: '-',
    keywords: 'unordered ul bullets',
    run: (e, r) => clear(e, r).toggleBulletList().run(),
  },
  {
    id: 'numbered',
    group: 'Basic Blocks',
    title: 'Numbered List',
    description: 'A list with numbering',
    icon: 'list-ordered',
    hint: '1.',
    keywords: 'ordered ol numbers',
    run: (e, r) => clear(e, r).toggleOrderedList().run(),
  },
  {
    id: 'toggle',
    group: 'Basic Blocks',
    title: 'Toggle',
    description: 'Hide content inside a toggle',
    icon: 'toggle',
    keywords: 'collapse details expand fold',
    // New toggles start open so Enter in the summary moves into the body.
    run: (e, r) => clear(e, r).setParagraph().setDetails().updateAttributes('details', { open: true }).run(),
  },
  {
    id: 'quote',
    group: 'Basic Blocks',
    title: 'Quote',
    description: 'Capture a quotation',
    icon: 'quote',
    hint: '>',
    keywords: 'blockquote citation',
    run: (e, r) => clear(e, r).setParagraph().toggleBlockquote().run(),
  },
  {
    id: 'callout',
    group: 'Basic Blocks',
    title: 'Callout',
    description: 'Make a note stand out',
    icon: 'callout',
    keywords: 'note info tip warning box',
    run: (e, r) => clear(e, r).setParagraph().setCallout().run(),
  },
  {
    id: 'divider',
    group: 'Basic Blocks',
    title: 'Divider',
    description: 'Separate sections',
    icon: 'divider',
    hint: '---',
    keywords: 'hr rule line separator',
    run: (e, r) => clear(e, r).setHorizontalRule().run(),
  },
  {
    id: 'code',
    group: 'Basic Blocks',
    title: 'Code',
    description: 'A block of code',
    icon: 'code',
    hint: '```',
    keywords: 'snippet pre programming',
    run: (e, r) => clear(e, r).setCodeBlock().run(),
  },
  {
    id: 'math',
    group: 'Basic Blocks',
    title: 'Math Equation',
    description: 'A formula on its own line, in LaTeX',
    icon: 'sigma',
    hint: '$$',
    keywords: 'equation latex tex formula katex block display physics chemistry',
    run: (e, r) => clear(e, r).insertMathBlock().run(),
  },
  {
    id: 'inline-math',
    group: 'Basic Blocks',
    title: 'Inline Math',
    description: 'A formula within the sentence',
    icon: 'function',
    hint: 'Ctrl+Shift+E',
    keywords: 'equation latex tex formula katex inline',
    run: (e, r) => clear(e, r).insertInlineMath().run(),
  },
  {
    id: 'table',
    group: 'Basic Blocks',
    title: 'Table',
    description: 'Rows and columns',
    icon: 'table',
    keywords: 'grid spreadsheet',
    run: (e, r) => clear(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'image',
    group: 'Media',
    title: 'Image',
    description: 'Upload from your computer',
    icon: 'image',
    keywords: 'picture photo upload png jpg',
    run: (e, r) => {
      clear(e, r).run();
      void pickImageFile().then((file) => file && insertImage(e, file));
    },
  },
  {
    id: 'file',
    group: 'Media',
    title: 'File',
    description: 'Attach a file from your library',
    icon: 'paperclip',
    keywords: 'attachment upload pdf document library',
    run: (e, r) => {
      clear(e, r).run();
      ui.pickFile(caretRect(e), (files) => insertFiles(e, files));
    },
  },
  {
    id: 'assignment',
    group: 'Planner',
    title: 'Assignment',
    description: 'Add one and link it here',
    icon: 'assignment',
    keywords: 'homework task due deadline todo course',
    run: (e, r) => {
      clear(e, r).run();
      ui.assignmentSheet = { id: null, draft: {}, onCreated: linkCreated(e, 'assignment') };
    },
  },
  {
    id: 'event',
    group: 'Planner',
    title: 'Event',
    description: 'Add to your calendar and link it here',
    icon: 'calendar',
    keywords: 'meeting lecture class exam schedule calendar',
    run: (e, r) => {
      clear(e, r).run();
      ui.eventSheet = {
        id: null,
        draft: { startDate: clock.today, endDate: clock.today },
        onCreated: linkCreated(e, 'event'),
      };
    },
  },
  {
    id: 'page',
    group: 'Pages',
    title: 'Page',
    description: 'Embed a sub-page inside this page',
    icon: 'page-plus',
    keywords: 'subpage new child nested',
    run: (e, r) => {
      clear(e, r).run();
      const parent = store.currentId;
      void store.create(parent, { open: false }).then((meta) => {
        if (!meta || e.isDestroyed) return;
        e.chain().focus().insertContent({ type: 'pageLink', attrs: { id: meta.id } }).run();
        store.open(meta.id);
        ui.focusTitle = meta.id;
      });
    },
  },
  {
    id: 'database',
    group: 'Pages',
    title: 'Database',
    description: 'A table, board or tracker right here',
    icon: 'database',
    keywords: 'table board kanban tracker list gallery spreadsheet template notion inline',
    run: (e, r) => {
      clear(e, r).run();
      ui.newDatabase = {
        parentId: store.currentId,
        onCreated: (id) => {
          if (!e.isDestroyed) e.chain().focus().insertContent([{ type: 'databaseBlock', attrs: { id } }, { type: 'paragraph' }]).run();
        },
      };
    },
  },
  {
    id: 'linked-database',
    group: 'Pages',
    title: 'Linked Database',
    description: 'Show a database you already have',
    icon: 'database',
    keywords: 'existing embed view linked table board',
    run: (e, r) => {
      clear(e, r).run();
      const rect = caretRect(e);
      const list = databases.list;
      ui.openMenu({
        x: rect.left,
        y: rect.bottom + 6,
        items: list.length
          ? [
              { header: 'Show a database' },
              ...list.map((d) => ({
                label: d.title || 'Untitled database',
                icon: 'database',
                hint: iconText(d.icon) || undefined,
                action: () => {
                  if (!e.isDestroyed) e.chain().focus().insertContent([{ type: 'databaseBlock', attrs: { id: d.id } }, { type: 'paragraph' }]).run();
                },
              })),
            ]
          : [{ label: 'No databases yet: make one', icon: 'plus', action: () => (ui.newDatabase = { parentId: null }) }],
      });
    },
  },
  {
    id: 'link',
    group: 'Pages',
    title: 'Link',
    description: 'Mention a page, assignment or file',
    icon: 'at',
    hint: '@',
    keywords: 'mention reference wiki',
    run: (e, r) => clear(e, r).insertContent('@').run(),
  },
  {
    id: 'flashcard',
    group: 'Study',
    title: 'Flashcard',
    description: 'A term and its answer, to study later',
    icon: 'cards',
    keywords: 'card study term definition question answer quiz memorize anki vocabulary',
    run: (e, r) => clear(e, r).insertFlashcard().run(),
  },
  {
    id: 'date',
    group: 'Inline',
    title: 'Today’s Date',
    description: new Date().toLocaleDateString(undefined, { dateStyle: 'long' }),
    icon: 'calendar',
    keywords: 'today now time day',
    run: (e, r) =>
      clear(e, r)
        .insertContent(new Date().toLocaleDateString(undefined, { dateStyle: 'long' }) + ' ')
        .run(),
  },
];

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<MenuEntry, MenuEntry>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return $from.parent.type.name !== 'codeBlock' && !$from.parent.type.spec.code;
        },
        items: ({ query }) =>
          query ? rank(SLASH_ITEMS, query, 12).map((i) => ({ ...i, group: undefined })) : SLASH_ITEMS,
        command: ({ editor, range, props }) => props.run(editor, range),
        render: suggestionRenderer('No matching blocks'),
      }),
    ];
  },
});
