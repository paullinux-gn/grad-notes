/**
 * Marks the page blocks that hold a database with `holds-float`. Blocks out
 * of sight skip painting (app.css), which seals each one in: a database's
 * menus and cell editors float over the page from inside it and would be
 * cut off at the block's edges. Marked blocks are never sealed. Only blocks
 * that can hold other blocks are looked into, so a page of thousands of
 * paragraphs costs next to nothing per keystroke.
 */

import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const FLOATS = 'databaseBlock';
const LISTS = new Set(['bulletList', 'orderedList', 'taskList']);

function holds(node: PMNode): boolean {
  if (node.type.name === FLOATS) return true;
  if (node.isTextblock || node.isLeaf) return false;
  let found = false;
  node.descendants((n) => {
    if (found || n.isTextblock) return false;
    if (n.type.name === FLOATS) found = true;
    return !found;
  });
  return found;
}

function marks(doc: PMNode): DecorationSet {
  const out: Decoration[] = [];
  doc.forEach((block, at) => {
    if (!holds(block)) return;
    out.push(Decoration.node(at, at + block.nodeSize, { class: 'holds-float' }));
    // The items of a long list are sealed one by one too.
    if (LISTS.has(block.type.name))
      block.forEach((item, off) => {
        if (holds(item)) out.push(Decoration.node(at + 1 + off, at + 1 + off + item.nodeSize, { class: 'holds-float' }));
      });
  });
  return DecorationSet.create(doc, out);
}

const key = new PluginKey<DecorationSet>('floatSafe');

export const FloatSafe = Extension.create({
  name: 'floatSafe',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => marks(state.doc),
          apply: (tr, set) => (tr.docChanged ? marks(tr.doc) : set),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});
