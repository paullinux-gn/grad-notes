// Split view: opening a page beside another, editing both, resizing, and
// moving pages between the sides by dragging.
import { test, expect, open } from './fixtures';
import type { Locator, Page } from '@playwright/test';

test.use({ viewport: { width: 1360, height: 820 } });

const tree = (page: Page, title: string) => page.locator('[role=tree][aria-label=Pages] .row', { hasText: title }).first();
const sideName = (page: Page) => page.locator('.side .pane-head .name');
const mainCrumb = (page: Page) => page.locator('.titlebar .crumb.current');

test('split view: open, edit, swap, resize and close', async ({ page }) => {
  const wait = (ms = 400) => page.waitForTimeout(ms);
  await open(page);
  await tree(page, 'Getting started').click();
  await expect(page.locator('.titlebar')).toContainText('Getting started');

  await test.step('Ctrl+Shift+\\ opens an empty pane with a picker ready to type in', async () => {
    await page.keyboard.press('Control+Shift+Backslash');
    await expect(page.locator('.side .pane')).toHaveCount(1);
    await expect(page.locator('.side .picker input')).toBeFocused();
  });

  await test.step('typing a name and Enter opens that page beside', async () => {
    await page.keyboard.type('study');
    await wait(200);
    await page.keyboard.press('Enter');
    await expect(sideName(page)).toHaveText('Study plan');
    await expect(page.locator('.side .ProseMirror')).toHaveCount(1);
    await expect(page.locator('.scroller .ProseMirror')).toHaveCount(1);
  });

  await test.step('each side edits its own page', async () => {
    await page.locator('.scroller .ProseMirror p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' LEFT-EDIT');
    await page.locator('.side .ProseMirror p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' RIGHT-EDIT');
    await wait(1200);
    await expect(page.locator('.scroller .ProseMirror')).toContainText('LEFT-EDIT');
    await expect(page.locator('.scroller .ProseMirror')).not.toContainText('RIGHT-EDIT');
    await expect(page.locator('.side .ProseMirror')).toContainText('RIGHT-EDIT');
    await expect(page.locator('.side .ProseMirror')).not.toContainText('LEFT-EDIT');
  });

  await test.step('Ctrl+K in the side editor opens only one link box', async () => {
    await page.locator('.side .ProseMirror p').first().dblclick();
    await wait(150);
    await page.keyboard.press('Control+k');
    await wait();
    expect(await page.locator('.bubble input, .bubble-menu input').count()).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    await wait(200);
  });

  await test.step('Alt+click in the sidebar opens beside and leaves the main page', async () => {
    await tree(page, 'Projects').click({ modifiers: ['Alt'] });
    await expect(sideName(page)).toHaveText('Projects');
    await expect(page.locator('.titlebar')).toContainText('Getting started');
  });

  await test.step('the same page on both sides is caught, and the picker offered', async () => {
    await tree(page, 'Getting started').click({ modifiers: ['Alt'] });
    await expect(page.locator('.side')).toContainText('open on the left');
    await page.click('.side button:has-text("Choose another page")');
    await expect(page.locator('.side .picker input')).toHaveCount(1);
    await page.locator('.side .choices button', { hasText: 'Study plan' }).click();
    await expect(sideName(page)).toHaveText('Study plan');
  });

  await test.step('swap trades the sides and keeps the edits', async () => {
    await page.click('.side button[aria-label="Swap sides"]');
    await expect(page.locator('.titlebar')).toContainText('Study plan');
    await expect(sideName(page)).toHaveText('Getting started');
    await expect(page.locator('.scroller .ProseMirror')).toContainText('RIGHT-EDIT');
  });

  await test.step('dragging the divider widens the side pane', async () => {
    const d = (await page.locator('[role=separator][aria-label="Resize split view"]').boundingBox())!;
    await page.mouse.move(d.x + 1, d.y + 300);
    await page.mouse.down();
    await page.mouse.move(d.x - 200, d.y + 300, { steps: 8 });
    await page.mouse.up();
    await wait();
    const ratio = await page.evaluate(() => JSON.parse(localStorage.getItem('gradnotes.prefs.v1') || '{}').splitRatio);
    expect(ratio).toBeGreaterThan(0.55);
  });

  await test.step('Alt+Enter in search opens a database beside', async () => {
    await page.keyboard.press('Control+k');
    await page.keyboard.type('Reading list');
    await wait(500);
    await page.keyboard.press('Alt+Enter');
    await expect(sideName(page)).toHaveText('Reading list');
  });

  await test.step('split view and its width come back after a restart', async () => {
    await wait();
    await page.reload();
    await expect(sideName(page)).toHaveText('Reading list');
    const width = await page.locator('.side').evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(600);
  });

  await test.step('a narrow window hides the side pane; wide again brings it back', async () => {
    await page.setViewportSize({ width: 900, height: 820 });
    await expect(page.locator('.side')).toHaveCount(0);
    await page.setViewportSize({ width: 1360, height: 820 });
    await expect(page.locator('.side')).toHaveCount(1);
  });

  await test.step('open in the main view moves the page over and closes split view', async () => {
    await page.click('.side button[aria-label="Open in the main view"]');
    await expect(page.locator('.side')).toHaveCount(0);
    await expect(page.locator('.titlebar')).toContainText('Reading list');
  });

  await test.step('the title bar button opens it; the close button closes it', async () => {
    await page.click('.titlebar button[aria-label="Split view"]');
    await expect(page.locator('.side')).toHaveCount(1);
    await page.click('.side button[aria-label="Close split view"]');
    await expect(page.locator('.side')).toHaveCount(0);
  });
});

test('split view: drag and drop pages between the sides', async ({ page }) => {
  const wait = (ms = 400) => page.waitForTimeout(ms);
  const panes = async () => (await page.locator('.panes').boundingBox())!;

  /** Drags `source` with the mouse and drops it at (x, y), the way a person would. */
  async function dragTo(source: Locator, x: number, y: number) {
    await source.scrollIntoViewIfNeeded();
    const b = (await source.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 + 6, { steps: 4 });
    await page.mouse.move(x, y, { steps: 12 });
    await wait(500);
    await page.mouse.up();
    await wait(600);
  }

  await open(page);
  await tree(page, 'Getting started').click();
  await expect(mainCrumb(page)).toContainText('Getting started');
  await wait(500);
  const before = await page.locator('.scroller .ProseMirror').innerText();

  await test.step('a sidebar page dropped on the right opens beside', async () => {
    const r = await panes();
    await dragTo(tree(page, 'Study plan'), r.x + r.width * 0.78, r.y + r.height / 2);
    await expect(sideName(page)).toHaveText('Study plan');
    await expect(mainCrumb(page)).toContainText('Getting started');
    expect(await page.locator('.scroller .ProseMirror').innerText(), 'the drop pasted nothing into the editor').toBe(before);
  });

  await test.step('a sidebar page dropped on the left opens there', async () => {
    const r = await panes();
    await dragTo(tree(page, 'Projects'), r.x + r.width * 0.2, r.y + r.height / 2);
    await expect(mainCrumb(page)).toContainText('Projects');
    await expect(sideName(page)).toHaveText('Study plan');
  });

  await test.step('the side header dragged left swaps the sides', async () => {
    const r = await panes();
    await dragTo(page.locator('.side .pane-head .title'), r.x + r.width * 0.2, r.y + r.height / 2);
    await expect(mainCrumb(page)).toContainText('Study plan');
    await expect(sideName(page)).toHaveText('Projects');
  });

  await test.step('the title dragged right swaps them back', async () => {
    const r = await panes();
    await dragTo(mainCrumb(page), r.x + r.width * 0.8, r.y + r.height / 2);
    await expect(mainCrumb(page)).toContainText('Projects');
    await expect(sideName(page)).toHaveText('Study plan');
  });

  await test.step('with split view closed, the open page dragged right moves to the side', async () => {
    await page.click('.side button[aria-label="Close split view"]');
    await expect(page.locator('.side')).toHaveCount(0);
    await tree(page, 'Design review').click();
    await expect(mainCrumb(page)).toContainText('Design review');
    await wait();
    const r = await panes();
    await dragTo(mainCrumb(page), r.x + r.width * 0.8, r.y + r.height / 2);
    await expect(sideName(page)).toHaveText('Design review');
    await expect(mainCrumb(page)).not.toContainText('Design review');
  });

  await test.step('dragging within the sidebar still reorders pages', async () => {
    const order = async () =>
      (await page.locator('[role=tree][aria-label=Pages] .row').allInnerTexts()).map((t) => t.trim().split('\n')[0]);
    const before = await order();
    const target = (await tree(page, 'Getting started').boundingBox())!;
    await dragTo(tree(page, 'Design review'), target.x + target.width / 2, target.y + 4);
    await expect.poll(order).not.toEqual(before);
    await expect(page.locator('.drop')).toHaveCount(0);
  });
});
