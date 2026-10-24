// Math: typing formulas, the formula editor, pasting LaTeX, search, flashcards and exports.
import { test, expect, open } from './fixtures';
import type { Page } from '@playwright/test';

/** The open page's content as JSON text. */
const doc = (page: Page) => page.evaluate(() => JSON.stringify((window as any).__editor.getJSON()));

/** A new page called `title`, with the caret in its body. */
async function newPage(page: Page, title: string) {
  await open(page, '?fresh');
  await page.keyboard.press('Control+n');
  await expect(page.locator('h1.title')).toBeFocused();
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
  await expect(page.locator('.ProseMirror')).toBeFocused();
}

/** Pastes as if from the clipboard into the editor. */
async function paste(page: Page, data: Record<string, string>) {
  await page.evaluate((data) => {
    const dt = new DataTransfer();
    for (const [type, text] of Object.entries(data)) dt.setData(type, text);
    document.querySelector('.ProseMirror')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, data);
}

test('typing, editing and pasting formulas', async ({ page }) => {
  const editor = page.locator('.math-host textarea');
  await newPage(page, 'Kinematics');

  await test.step('$..$ becomes inline math; money stays text', async () => {
    await page.keyboard.type('The energy is $E=mc^2$ and money $5 or $10 stays.');
    await expect(page.locator('.math-inline .katex')).toHaveCount(1);
    expect(await doc(page)).toContain('$5 or $10');
  });

  await test.step('$$ and a space opens a block editor with backslash suggestions', async () => {
    await page.keyboard.press('Enter');
    await page.keyboard.type('$$ ');
    await expect(page.locator('.math-block .math-host textarea')).toBeFocused();
    await page.keyboard.type('\\fra');
    await expect(page.locator('.suggest button').first()).toBeVisible();
  });

  await test.step('a snippet fills in, and Tab steps through its slots', async () => {
    await page.keyboard.press('Enter');
    await expect(editor).toHaveValue('\\frac{}{}');
    await page.keyboard.type('v');
    await page.keyboard.press('Tab');
    await page.keyboard.type('t');
    await expect(editor).toHaveValue('\\frac{v}{t}');
    await page.keyboard.press('Tab');
    await page.keyboard.type(' = a');
    await expect(editor).toHaveValue('\\frac{v}{t} = a');
  });

  await test.step('Ctrl+Enter closes the block and the caret lands below it', async () => {
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('.math-host')).toHaveCount(0);
    expect(await doc(page)).toContain('\\\\frac{v}{t} = a');
    await page.keyboard.type('Next line after block');
    expect(await doc(page)).toContain('Next line after block');
  });

  await test.step('Ctrl+Shift+E opens an inline formula; the caret ends after it', async () => {
    await page.keyboard.press('Enter');
    await page.keyboard.type('Angle ');
    await page.keyboard.press('Control+Shift+E');
    await expect(page.locator('.math-pop textarea')).toBeFocused();
    await page.keyboard.type('\\theta');
    await expect(page.locator('.math-pop textarea')).toHaveValue('\\theta');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await expect(page.locator('.math-pop')).toHaveCount(0);
    await page.keyboard.type(' radians');
    const d = await doc(page);
    expect(d).toContain('"latex":"\\\\theta"');
    expect(d).toContain(' radians');
  });

  await test.step('clicking a formula edits it; clicking away saves', async () => {
    await page.locator('.math-inline').first().click();
    await expect(page.locator('.math-pop')).toHaveCount(1);
    await page.locator('.math-pop textarea').fill('E = mc^{2}');
    await page.mouse.click(1100, 700);
    await expect(page.locator('.math-pop')).toHaveCount(0);
    expect(await doc(page)).toContain('E = mc^{2}');
  });

  await test.step('pasted chatbot LaTeX becomes formulas', async () => {
    await page.locator('.ProseMirror p').last().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await paste(page, { 'text/plain': 'Using \\( F = ma \\):\n\n\\[\na = \\frac{F}{m}\n\\]\n\n- mass \\(m\\)\n- **force** $F$' });
    await expect(page.locator('.math-block .katex')).toHaveCount(2);
    await expect(page.locator('.ProseMirror ul .math-inline')).toHaveCount(2);
  });

  await test.step('pasted KaTeX HTML keeps its LaTeX', async () => {
    await paste(page, {
      'text/html':
        '<p>So <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">\\sqrt{x}</annotation></semantics></math></span><span class="katex-html">√x</span></span> works</p>',
      'text/plain': 'So √x works',
    });
    await expect.poll(() => doc(page)).toContain('\\\\sqrt{x}');
  });

  await test.step('a half-written formula shows an error', async () => {
    await page.locator('.math-inline').first().click();
    await page.locator('.math-pop textarea').fill('\\frac{1}{');
    await expect(page.locator('.math-pop .error')).toHaveCount(1);
    await page.keyboard.press('Escape');
  });
});

test('formulas in search, flashcards and exports', async ({ page }) => {
  await newPage(page, 'Physics formulas');
  const content = [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Mechanics' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Momentum ' }, { type: 'inlineMath', attrs: { latex: '\\vec{p} = m\\vec{v}' } }, { type: 'text', text: ' is conserved.' }] },
    { type: 'mathBlock', attrs: { latex: '\\sum_{i=1}^{n} F_i = \\frac{dp}{dt}' } },
    { type: 'mathBlock', attrs: { latex: '\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}' } },
    { type: 'mathBlock', attrs: { latex: 'A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix},\\quad \\ce{2H2 + O2 -> 2H2O}' } },
    { type: 'mathBlock', attrs: { latex: '|x| = \\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}' } },
    { type: 'flashcard', attrs: { id: 'mathcard1' }, content: [
      { type: 'flashcardFront', content: [{ type: 'text', text: 'Kinetic energy ' }, { type: 'inlineMath', attrs: { latex: 'E_k' } }] },
      { type: 'flashcardBack', content: [{ type: 'inlineMath', attrs: { latex: '\\tfrac{1}{2}mv^2' } }] },
    ] },
    { type: 'flashcard', attrs: { id: 'mathcard2' }, content: [
      { type: 'flashcardFront', content: [{ type: 'inlineMath', attrs: { latex: '\\nabla \\cdot \\vec{E}' } }] },
      { type: 'flashcardBack', content: [{ type: 'inlineMath', attrs: { latex: '\\rho/\\varepsilon_0' } }] },
    ] },
  ];
  await page.evaluate((c) => (window as any).__editor.chain().focus('end').insertContent(c).run(), content);

  await test.step('display formulas and chemistry typeset', async () => {
    await expect(page.locator('.math-block .katex')).toHaveCount(4);
    await expect.poll(() => page.locator('.katex').count()).toBeGreaterThanOrEqual(9);
  });

  await test.step('search finds the LaTeX inside a formula', async () => {
    // Let the autosave land so search sees the new page.
    await page.waitForTimeout(1200);
    await page.keyboard.press('Control+k');
    await page.keyboard.type('nabla');
    await expect(page.locator('.palette, [role=dialog]').first()).toContainText('Physics formulas');
    await page.keyboard.press('Escape');
  });

  await test.step('formula-only cards count, and study shows them typeset', async () => {
    await page.click('.sidebar >> text=Flashcards');
    await expect(page.locator('main')).toContainText(/2 cards|2 new|\b2\b/);
    await page.locator('button:has-text("Study")').first().click();
    await expect(page.locator('.face .katex').first()).toBeVisible();
    await page.keyboard.press('Escape');
  });

  await test.step('Markdown keeps $ and $$; Word gets real equations', async () => {
    await page.click('.sidebar >> text=Physics formulas');
    await expect(page.locator('.math-block .katex')).toHaveCount(4);
    const out = await page.evaluate(async () => {
      const json = (window as any).__editor.getJSON();
      const { toMarkdown } = await import('/src/lib/markdown.ts' as string);
      const { toDocx } = await import('/src/lib/docx.ts' as string);
      const bytes: Uint8Array = await toDocx(json, 'Physics formulas', { titleOf: () => 'x', image: async () => null });
      return { md: toMarkdown(json, 'Physics formulas', () => 'x') as string, docx: new TextDecoder().decode(bytes) };
    });
    expect(out.md).toContain('$\\vec{p} = m\\vec{v}$');
    expect(out.md).toContain('$$\n\\sum_{i=1}');
    // The archive is stored uncompressed, so its XML can be read as is.
    expect(out.docx).toContain('<m:oMathPara');
    expect(out.docx).toContain('<m:oMath');
    expect(out.docx).toContain('<m:f>');
    expect(out.docx).toContain('<m:d>');
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    test('moving through and editing an inline formula', async ({ page }) => {
      const pop = page.locator('.math-pop textarea');
      await newPage(page, 'Waves');
      await page.keyboard.type('Speed $v = f\\lambda$ of a wave');
      await expect(page.locator('.math-inline .katex')).toHaveCount(1);

      await test.step('an arrow key selects the formula; Enter edits it', async () => {
        await page.evaluate(() => {
          const ed = (window as any).__editor;
          let at = 0;
          ed.state.doc.descendants((n: any, pos: number) => {
            if (n.type.name === 'inlineMath' && !at) at = pos;
          });
          ed.commands.setTextSelection(at);
          ed.commands.focus();
        });
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('.math-inline.ProseMirror-selectednode')).toHaveCount(1);
        await page.keyboard.press('Enter');
        await expect(pop).toBeFocused();
      });

      await test.step('ArrowLeft at the start leaves, with the caret before the formula', async () => {
        await page.keyboard.press('Home');
        await page.keyboard.press('ArrowLeft');
        await expect(page.locator('.math-pop')).toHaveCount(0);
        await page.keyboard.type('X');
        expect(await doc(page)).toContain('Speed X');
      });

      await test.step('an edit undoes in one step', async () => {
        await page.locator('.math-inline').click();
        await pop.fill('v = \\lambda f');
        await page.keyboard.press('Enter');
        await expect(page.locator('.math-pop')).toHaveCount(0);
        expect(await doc(page)).toContain('v = \\\\lambda f');
        await page.keyboard.press('Control+z');
        await expect.poll(() => doc(page)).toContain('v = f\\\\lambda');
      });

      await test.step('Backspace in an empty formula removes it', async () => {
        await page.keyboard.press('End');
        await page.keyboard.press('Control+Shift+E');
        await expect(pop).toBeFocused();
        await page.keyboard.press('Backspace');
        await expect(page.locator('.math-pop')).toHaveCount(0);
        expect((await doc(page)).match(/inlineMath/g)?.length).toBe(1);
      });

      await test.step('a palette symbol wraps the selection', async () => {
        await page.keyboard.press('Enter');
        await page.keyboard.press('Control+Shift+E');
        await expect(pop).toBeFocused();
        await page.keyboard.type('x+1');
        await page.keyboard.press('Control+a');
        if (!(await page.locator('.palette').count())) await page.click('.pal-btn');
        await page.locator('.sym[aria-label="sqrt"]').click();
        await expect(pop).toHaveValue('\\sqrt{x+1}');
      });
    });
  });
}
