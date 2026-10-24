import { TextSelection } from '@tiptap/pm/state';
import { Extension, type AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import { openUrl } from '../api';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Callout } from './callout';
import { Mention, PageLink } from './page-link';
import { SlashCommand } from './slash';
import { MentionSuggest } from './mention';
import { BlockHandle, type BlockHandleOptions } from './block-handle';
import { FloatSafe } from './float-safe';
import { ImageDrop } from './images';
import { FileBlock } from './file-block';
import { DatabaseNode } from './database-block.svelte';
import { Flashcard, FlashcardBack, FlashcardFront } from './flashcard';
import { InlineMath, MathBlock } from './math';
import { MathPaste } from './math-paste';
import { ui } from '../ui.svelte';

/** Editor-wide shortcuts that don't belong to a single node type. */
const Shortcuts = Extension.create({
  name: 'tdShortcuts',
  // Run after list/code keymaps so they get the first chance at Tab.
  priority: 50,
  addKeyboardShortcuts() {
    return {
      'Mod-k': ({ editor }) => {
        // Only selected text gets a link; otherwise Ctrl+K is search.
        const sel = editor.state.selection;
        if (sel.empty || !(sel instanceof TextSelection)) return false;
        // Only this editor's bubble menu answers (with two pages open side by side).
        window.dispatchEvent(new CustomEvent('td:edit-link', { detail: { editor } }));
        return true;
      },
      'Mod-d': ({ editor }) => {
        // Duplicate the current top-level block.
        const { $from } = editor.state.selection;
        if ($from.depth < 1) return false;
        const node = $from.node(1);
        const end = $from.after(1);
        editor.view.dispatch(editor.state.tr.insert(end, node));
        return true;
      },
      // Keep focus inside the editor instead of tabbing to other controls.
      Tab: () => true,
      'Shift-Tab': () => true,
    };
  },
});

/**
 * Enter at the end of an open toggle's summary moves into its body. The
 * stock handler always inserts a new paragraph, which strands the empty one
 * a freshly created toggle already has.
 */
const ToggleEnter = Extension.create({
  name: 'toggleEnter',
  priority: 200,
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor;
        const { $head, empty } = state.selection;
        if (!empty || $head.parent.type.name !== 'detailsSummary') return false;
        if ($head.parentOffset !== $head.parent.content.size) return false;
        const details = $head.node(-1);
        const contentPos = $head.after();
        const content = state.doc.nodeAt(contentPos);
        const first = content?.firstChild;
        if (!details.attrs.open || content?.type.name !== 'detailsContent') return false;
        if (!first || first.type.name !== 'paragraph' || first.content.size !== 0) return false;
        return editor.commands.setTextSelection(contentPos + 2);
      },
    };
  },
});

/** Ctrl/Cmd-click opens links in the system browser. */
const LinkOpener = Extension.create({
  name: 'linkOpener',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('linkOpener'),
        props: {
          handleClick(_view, _pos, event) {
            const a = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
            if (!a) return false;
            if (event.ctrlKey || event.metaKey || !_view.editable) {
              event.preventDefault();
              openUrl(a.href).catch(ui.error);
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

export function buildExtensions(handle: BlockHandleOptions): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      dropcursor: { color: 'var(--text)', width: 2 },
      codeBlock: { enableTabIndentation: true, tabSize: 2, HTMLAttributes: { spellcheck: 'false' } },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Details.configure({ persist: true, HTMLAttributes: { class: 'toggle' } }),
    DetailsSummary,
    DetailsContent,
    ToggleEnter,
    TableKit.configure({ table: { resizable: true, cellMinWidth: 80 } }),
    Image.configure({
      inline: false,
      allowBase64: false,
      // A page of hundreds of photos only loads and decodes what's on screen.
      HTMLAttributes: { loading: 'lazy', decoding: 'async' },
      resize: { enabled: true, directions: ['left', 'right'], minWidth: 80, minHeight: 40, alwaysPreserveAspectRatio: true },
    }),
    Highlight,
    Typography,
    CharacterCount,
    Placeholder.configure({
      includeChildren: true,
      showOnlyCurrent: true,
      // Decided from the node alone: this runs while the new document is
      // being drawn, when looking positions up in editor.state (still the old
      // one) can throw. Paragraphs in lists and tables are handled in app.css.
      placeholder: ({ node }) => {
        // Only lines of text get a hint. Containers count as "empty" too
        // (a new table, an empty quote), and would show it over their cells.
        if (!node.isTextblock) return '';
        if (node.type.name === 'heading') return `Heading ${node.attrs.level}`;
        if (node.type.name === 'detailsSummary') return 'Toggle';
        if (node.type.name === 'codeBlock') return '';
        if (node.type.name === 'flashcardFront') return 'Term or question';
        if (node.type.name === 'flashcardBack') return 'Definition or answer';
        return 'Write something, or type / for commands';
      },
    }),
    Callout,
    PageLink,
    Mention,
    FileBlock,
    DatabaseNode,
    InlineMath,
    MathBlock,
    MathPaste,
    Flashcard,
    FlashcardFront,
    FlashcardBack,
    SlashCommand,
    MentionSuggest,
    ImageDrop,
    LinkOpener,
    Shortcuts,
    BlockHandle.configure(handle),
    FloatSafe,
  ];
}
