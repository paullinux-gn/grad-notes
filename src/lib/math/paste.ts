/**
 * Plain text with math in it (ChatGPT's copy button, a .md or .tex file, a
 * forum post) as editor content: \( … \) and $ … $ become inline formulas,
 * \[ … \] and $$ … $$ display blocks. The Markdown such text usually comes
 * with (headings, lists, bold, code) is kept as formatting too.
 */

import type { JSONContent } from '@tiptap/core';

/** Whether pasted text has any math worth converting. */
export function hasMath(text: string): boolean {
  return /\\\(|\\\[|\$\$|\\begin\{(equation|align|gather)\*?\}/.test(text) || inlineDollar.test(text);
}

// $…$ the way Pandoc reads it: no space just inside the dollars, and the
// closing one not followed by a digit (so "$5 and $10" stays money).
const inlineDollar = /(?<![\\$\w])\$(?=[^\s$])((?:\\.|[^$\\\n])*?[^\s\\$])\$(?!\d)/;

type Mark = { type: string };

/** Inline Markdown and math in a line of text. */
export function inlineContent(text: string, marks: Mark[] = []): JSONContent[] {
  const out: JSONContent[] = [];
  const push = (t: string) => {
    if (!t) return;
    const last = out.at(-1);
    if (last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) last.text += t;
    else out.push(marks.length ? { type: 'text', text: t, marks } : { type: 'text', text: t });
  };
  const rules: [RegExp, (m: RegExpExecArray) => JSONContent[]][] = [
    [/\\\(([\s\S]+?)\\\)/y, (m) => [{ type: 'inlineMath', attrs: { latex: m[1].trim() } }]],
    [new RegExp(inlineDollar.source, 'y'), (m) => [{ type: 'inlineMath', attrs: { latex: m[1].trim() } }]],
    [/`([^`\n]+)`/y, (m) => (marks.some((k) => k.type === 'code') ? [] : [{ type: 'text', text: m[1], marks: [...marks, { type: 'code' }] }])],
    [/\*\*(?=\S)([\s\S]+?\S)\*\*/y, (m) => inlineContent(m[1], [...marks, { type: 'bold' }])],
    [/__(?=\S)([\s\S]+?\S)__/y, (m) => inlineContent(m[1], [...marks, { type: 'bold' }])],
    [/(?<!\w)\*(?=[^\s*])([^*\n]+?[^\s*])\*(?!\w)/y, (m) => inlineContent(m[1], [...marks, { type: 'italic' }])],
    [/(?<!\w)_(?=[^\s_])([^_\n]+?[^\s_])_(?!\w)/y, (m) => inlineContent(m[1], [...marks, { type: 'italic' }])],
    [/\\([$\\*_`])/y, (m) => [{ type: 'text', text: m[1] }]],
  ];
  let i = 0;
  let plain = '';
  outer: while (i < text.length) {
    for (const [re, make] of rules) {
      re.lastIndex = i;
      const m = re.exec(text);
      if (!m) continue;
      const made = make(m);
      if (!made.length) continue;
      push(plain);
      plain = '';
      for (const n of made) {
        if (n.type === 'text' && !n.marks) push(n.text!);
        else out.push(n);
      }
      i = re.lastIndex;
      continue outer;
    }
    plain += text[i++];
  }
  push(plain);
  return out;
}

const para = (text: string): JSONContent => {
  const content = inlineContent(text);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};

/** Pasted text as blocks. */
export function textToBlocks(text: string): JSONContent[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: JSONContent[] = [];
  let list: { type: string; items: JSONContent[] } | null = null;
  const endList = () => {
    if (list) out.push({ type: list.type, content: list.items });
    list = null;
  };
  const addItem = (type: string, item: JSONContent) => {
    if (list?.type !== type) {
      endList();
      list = { type, items: [] };
    }
    list!.items.push(item);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // A code fence: everything to the closing fence, untouched.
    const fence = /^```(\w*)\s*$/.exec(trimmed);
    if (fence) {
      endList();
      const body: string[] = [];
      while (++i < lines.length && !/^```\s*$/.test(lines[i].trim())) body.push(lines[i]);
      out.push({ type: 'codeBlock', attrs: { language: fence[1] || null }, content: body.length ? [{ type: 'text', text: body.join('\n') }] : [] });
      continue;
    }

    // Display math: \[ … \], $$ … $$ or \begin{align} … \end{align}, on one line or several.
    const open = /^(\\\[|\$\$|\\begin\{(equation|align|gather|multline)(\*?)\})/.exec(trimmed);
    if (open) {
      const close = open[1] === '\\[' ? '\\]' : open[1] === '$$' ? '$$' : `\\end{${open[2]}${open[3]}}`;
      let body = trimmed.slice(open[1].length);
      let j = i;
      while (!body.includes(close) && j + 1 < lines.length) body += '\n' + lines[++j];
      const end = body.indexOf(close);
      if (end >= 0 && !body.slice(end + close.length).trim()) {
        endList();
        let latex = body.slice(0, end).trim();
        // An align environment is written for its own block; KaTeX wants aligned.
        const env = { align: 'aligned', multline: 'aligned', gather: 'gathered' }[open[2] as string];
        if (env) latex = `\\begin{${env}}${latex}\\end{${env}}`;
        out.push({ type: 'mathBlock', attrs: { latex } });
        i = j;
        continue;
      }
    }

    if (!trimmed) {
      endList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      endList();
      const content = inlineContent(heading[2].replace(/\s+#+$/, ''));
      out.push({ type: 'heading', attrs: { level: Math.min(3, heading[1].length) }, ...(content.length ? { content } : {}) });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      endList();
      out.push({ type: 'horizontalRule' });
      continue;
    }
    const task = /^[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(trimmed);
    if (task) {
      addItem('taskList', { type: 'taskItem', attrs: { checked: task[1] !== ' ' }, content: [para(task[2])] });
      continue;
    }
    const bullet = /^[-*+•]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      addItem('bulletList', { type: 'listItem', content: [para(bullet[1])] });
      continue;
    }
    const num = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (num) {
      addItem('orderedList', { type: 'listItem', content: [para(num[1])] });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      endList();
      const last = out.at(-1);
      if (last?.type === 'blockquote') last.content!.push(para(quote[1]));
      else out.push({ type: 'blockquote', content: [para(quote[1])] });
      continue;
    }
    endList();
    out.push(para(trimmed));
  }
  endList();
  return out;
}
