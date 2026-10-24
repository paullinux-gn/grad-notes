// Exports: what goes into a PDF, CSV and Markdown. (The files themselves are
// written by the Rust side, so here the layout and text going into them is
// checked.)
import { test, expect, open } from './fixtures';

test.use({ viewport: { width: 1360, height: 820 } });

test('a PDF prints the page, even with a page open beside it', async ({ page }) => {
  await open(page);
  await page.click('[role=tree][aria-label=Pages] .row >> text=Getting started');
  await page.locator('[role=tree][aria-label=Pages] .row', { hasText: 'Projects' }).first().click({ modifiers: ['Alt'] });
  await expect(page.locator('.side .pane')).toHaveCount(1);
  // What Export as PDF does before printing.
  await page.evaluate(() => document.documentElement.classList.add('printing'));
  await page.emulateMedia({ media: 'print' });
  const shown = (sel: string) => page.locator(sel).first().evaluate((el) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === 'fixed' ? el.getBoundingClientRect().height > 0 && el.getClientRects().length > 0 : false);
  expect(await shown('.panes'), 'the pane holding the page').toBe(true);
  expect(await shown('.scroller .page .ProseMirror'), 'the page itself').toBe(true);
  expect(await shown('.side'), 'the side pane').toBe(false);
  expect(await shown('.sidebar'), 'the sidebar').toBe(false);
  await expect(page.locator('.scroller .page .ProseMirror')).toContainText('Try it');
});

test('CSV guards formulas, and Markdown fences code with backticks in it', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(async () => {
    const csv = await import('/src/lib/db/csv.ts' as string);
    const md = await import('/src/lib/markdown.ts' as string);
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fence with ' }, { type: 'text', text: '```', marks: [{ type: 'code' }] }] }] };
    return {
      guarded: ['=SUM(A1)', '+1 more', '-3', '-3.5', '@home', 'plain', '-x'].map(csv.guardCell),
      back: csv.unguardCell("'=SUM(A1)"),
      md: md.toMarkdown(doc, '', () => ''),
    };
  });
  expect(out.guarded).toEqual(["'=SUM(A1)", "'+1 more", '-3', '-3.5', "'@home", 'plain', "'-x"]);
  expect(out.back).toBe('=SUM(A1)');
  expect(out.md).toContain('Fence with ```` ``` ````');
});

test('Export All Notes writes folders like the sidebar, links that resolve, attachments and CSV', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(async () => {
    const { store } = await import('/src/lib/store.svelte.ts' as string);
    const { databases } = await import('/src/lib/databases.svelte.ts' as string);
    const { library } = await import('/src/lib/library.svelte.ts' as string);
    const { api } = await import('/src/lib/api.ts' as string);
    const { exportWorkspace } = await import('/src/lib/export-workspace.ts' as string);
    const byTitle = (t: string) => [...store.byId.values()].find((p: any) => p.title === t && !p.deletedAt) as any;
    const [picture, doc] = library.files;
    // A second "Cell vocabulary" at the top, pointing at the one in Biology.
    await store.create(null, {
      title: 'Cell vocabulary',
      open: false,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'mention', attrs: { id: store.children(byTitle('Biology').id).find((p: any) => p.title === 'Cell vocabulary').id, kind: 'page' } }] },
        { type: 'image', attrs: { src: `tdfile://localhost/${picture.stored}`, alt: 'diagram' } },
        { type: 'fileBlock', attrs: { id: doc.id } },
      ],
    });
    const list = databases.list.find((d: any) => d.title === 'Reading list');
    await databases.ensure([list.id]);
    const row = databases.rowsOf(list.id)[0];
    await api.updatePage(row.id, { content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Loved it' }] }] }) });
    await exportWorkspace();
    return { files: (window as any).__workspaceExport as Record<string, any>, row: databases.title(row), picture: picture.name, doc: doc.name };
  });
  const paths = Object.keys(out.files);
  expect(paths).toContain('Biology/Biology.md');
  expect(paths).toContain('Biology/Cell vocabulary.md');
  expect(paths).toContain('Cell vocabulary.md');
  expect(paths).toContain('Databases/Reading list.csv');
  expect(paths).toContain(`Databases/Reading list/${out.row}.md`);
  expect(paths.filter((p) => p.startsWith('Databases/Reading list/')), 'only rows with notes get a page').toHaveLength(1);

  const top: string = out.files['Cell vocabulary.md'];
  expect(top.startsWith('---\n'), 'front matter').toBe(true);
  expect(top).toMatch(/\ncreated: \d{4}-\d\d-\d\dT\d\d:\d\d\n/);
  expect(top, 'two pages share the name, so the link uses the path').toContain('[[Biology/Cell vocabulary|Cell vocabulary]]');
  expect(top).toMatch(/!\[diagram\]\(attachments\/[^)]+\)/);
  expect(top).toContain(`📎 [${out.doc}](attachments/`);
  expect(out.files['Biology/Cell vocabulary.md']).toContain('# Cell vocabulary');

  const copies = paths.filter((p) => p.startsWith('attachments/'));
  expect(copies).toHaveLength(2);
  for (const p of copies) expect(out.files[p]).toHaveProperty('copied');
  const nested = top.match(/!\[diagram\]\((attachments\/[^)]+)\)/)![1];
  expect(copies.map((p) => p.split('/').map(encodeURIComponent).join('/'))).toContain(nested);

  const csv: string = out.files['Databases/Reading list.csv'];
  expect(csv.charCodeAt(0), 'byte order mark for Excel').toBe(0xfeff);
  expect(csv).toContain(out.row);
  expect(out.files[`Databases/Reading list/${out.row}.md`]).toContain('Loved it');
});

test('export names: safe on Windows, links relative to the page', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(async () => {
    const m = await import('/src/lib/export-workspace.ts' as string);
    return {
      names: ['a/b: c?', 'CON', 'trailing. ', '', '   '].map(m.fileName),
      link: m.linkFrom('Biology/Week 1/Notes.md', 'attachments/cell diagram.png'),
    };
  });
  expect(out.names).toEqual(['a b c', 'CON (page)', 'trailing', 'Untitled', 'Untitled']);
  expect(out.link).toBe('../../attachments/cell%20diagram.png');
});

test('Markdown keeps money as text and formulas as math, and pastes back the same', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(async () => {
    const md = await import('/src/lib/markdown.ts' as string);
    const paste = await import('/src/lib/math/paste.ts' as string);
    const t = (text: string) => ({ type: 'text', text });
    const im = (latex: string) => ({ type: 'inlineMath', attrs: { latex } });
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [t('Costs $5 and $10, area '), im('\\pi r^2'), t(', padded '), im(' x + 1 '), t(', empty '), im('  ')] },
        { type: 'mathBlock', attrs: { latex: '\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n' } },
      ],
    };
    const text = md.toMarkdown(doc, 'Math', () => '');
    // What pasting the export (minus its title) brings back.
    const back = paste.textToBlocks(text.split('\n').slice(2).join('\n'));
    const flat = (nodes: any[]): any[] => nodes.flatMap((n) => [n, ...flat(n.content ?? [])]);
    return {
      text,
      maths: flat(back).filter((n) => n.type === 'inlineMath' || n.type === 'mathBlock').map((n) => n.attrs.latex),
      words: flat(back).filter((n) => n.type === 'text').map((n) => n.text).join(''),
    };
  });
  expect(out.text).toContain('Costs \\$5 and \\$10, area $\\pi r^2$, padded $x + 1$, empty \n');
  expect(out.text).toContain('$$\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n$$');
  expect(out.maths).toEqual(['\\pi r^2', 'x + 1', '\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}']);
  expect(out.words).toContain('Costs $5 and $10, area ');
});
