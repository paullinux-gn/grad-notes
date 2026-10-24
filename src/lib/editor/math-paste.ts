/**
 * Pasting text that has LaTeX in it: the math comes in typeset (see
 * math/paste.ts). Pasted HTML with KaTeX or MathML is read by the math
 * nodes' own parse rules instead; code blocks always take text as it is.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { hasMath, textToBlocks } from '../math/paste';

export const MathPaste = Extension.create({
  name: 'mathPaste',

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('mathPaste'),
        props: {
          handlePaste(view, event) {
            const data = event.clipboardData;
            if (!data || !view.editable) return false;
            const { $from } = view.state.selection;
            if ($from.parent.type.spec.code || $from.marks().some((m) => m.type.spec.code)) return false;
            const html = data.getData('text/html');
            if (html && /class="?katex|<math[\s>]/i.test(html)) return false;
            const text = data.getData('text/plain');
            if (!text || !hasMath(text)) return false;
            const blocks = textToBlocks(text);
            if (!blocks.length) return false;
            // One paragraph goes into the line where the caret is.
            const content = blocks.length === 1 && blocks[0].type === 'paragraph' ? (blocks[0].content ?? []) : blocks;
            return editor.chain().focus().insertContent(content).run();
          },
        },
      }),
    ];
  },
});
