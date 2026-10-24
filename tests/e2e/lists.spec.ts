import { test, expect, open } from './fixtures';

test('numbered lists keep their numbers and text when Enter adds an item', async ({ page }) => {
  await open(page);
  await page.click('.sidebar >> text=Getting started');

  await page.evaluate(() => {
    const editor = (window as any).__editor;
    editor.commands.setContent({
      type: 'doc',
      content: [{
        type: 'orderedList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep this line' }] }] }],
      }],
    });
    // Focus the last text position inside the list. Focusing the document
    // end would put the caret after the list and test the exit-list behavior.
    let textEnd = 0;
    editor.state.doc.descendants((node: any, pos: number) => {
      if (node.isText) textEnd = pos + node.nodeSize;
    });
    editor.commands.setTextSelection(textEnd);
    editor.view.focus();
  });

  await expect(page.locator('.prose ol')).toHaveCSS('list-style-type', 'decimal');
  await page.keyboard.press('Enter');

  const items = await page.evaluate(() => (window as any).__editor.getJSON().content[0].content);
  expect(items).toHaveLength(2);
  expect(items[0].content[0].content[0].text).toBe('Keep this line');
  expect(items[1].content[0].content ?? []).toEqual([]);
});

test('H2 and H3 text stays visible when Enter creates the next block', async ({ page }) => {
  await open(page);
  await page.click('.sidebar >> text=Getting started');

  for (const level of [2, 3]) {
    await page.evaluate((headingLevel) => {
      const editor = (window as any).__editor;
      editor.commands.setContent({
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: headingLevel }, content: [{ type: 'text', text: `Keep H${headingLevel}` }] }],
      });
      editor.commands.focus('end');
    }, level);

    await page.keyboard.press('Enter');
    const result = await page.evaluate(() => (window as any).__editor.getJSON().content);
    expect(result[0].type).toBe('heading');
    expect(result[0].content[0].text).toBe(`Keep H${level}`);
  }
});

test('all basic block types keep their text fully rendered', async ({ page }) => {
  await open(page);
  await page.click('.sidebar >> text=Getting started');

  await page.evaluate(() => {
    const editor = (window as any).__editor;
    const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    editor.commands.setContent({
      type: 'doc',
      content: [
        paragraph('Text block'),
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Heading 1' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading 2' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Heading 3' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('Bulleted item')] }] },
        { type: 'orderedList', content: [{ type: 'listItem', content: [paragraph('Numbered item')] }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [paragraph('To-do item')] }] },
        { type: 'blockquote', content: [paragraph('Quote block')] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'Code block' }] },
        { type: 'callout', content: [paragraph('Callout text')] },
      ],
    });
  });

  const visibility = await page.locator('.prose > *').evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).contentVisibility),
  );
  // The editor keeps an empty paragraph at the end so users can continue
  // writing after a final non-paragraph block.
  expect(visibility.length).toBeGreaterThanOrEqual(10);
  expect(visibility.every((value) => value === 'visible')).toBe(true);

  const text = await page.evaluate(() => (window as any).__editor.getText());
  for (const content of ['Text block', 'Heading 1', 'Heading 2', 'Heading 3', 'Bulleted item', 'Numbered item', 'To-do item', 'Quote block', 'Code block', 'Callout text']) {
    expect(text).toContain(content);
  }
});
