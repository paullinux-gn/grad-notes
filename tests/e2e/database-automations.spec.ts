// Databases: the timeline and form views, row templates, sub-items,
// automations (and undoing what they did) and button properties.
import type { Page } from '@playwright/test';
import { test, expect, open } from './fixtures';

const cell = (page: Page, r: number, c: number) => page.locator(`.td[data-r="${r}"][data-c="${c}"]`);
const colOf = async (page: Page, name: string) =>
  (await page.locator('.head .th').allTextContents()).findIndex((t) => t.trim().startsWith(name));

test('timeline, form, templates, sub-items, automations and buttons', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 860 });
  await open(page);
  await page.click('.sidebar >> text=Reading list');
  const rowCount = page.locator('.db-row:has-text("Reading list") .count');

  await test.step('a timeline view: schedule a row, drag it, stretch it', async () => {
    await page.click('.add-view');
    await page.click('.menu .item:has-text("Timeline")');
    await expect(page.locator('.tl .tr')).toHaveCount(4);
    const sc = (await page.locator('.tl .scroller').boundingBox())!;
    await page.locator('.tl .tr').first().locator('.lane').hover({ position: { x: 10, y: 18 }, force: true });
    await page.mouse.move(sc.x + 600, sc.y + 48 + 18);
    await page.waitForTimeout(150);
    await page.mouse.click(sc.x + 600, sc.y + 48 + 18);
    const bar = page.locator('.tl .b');
    await expect(bar).toHaveCount(1);

    // Three days to the right (22px a day at the week scale).
    const label = await bar.getAttribute('aria-label');
    const b1 = (await bar.boundingBox())!;
    await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
    await page.mouse.down();
    await page.mouse.move(b1.x + b1.width / 2 + 40, b1.y + b1.height / 2, { steps: 5 });
    await page.mouse.move(b1.x + b1.width / 2 + 66, b1.y + b1.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(bar).not.toHaveAttribute('aria-label', label!);

    // Four more days on its end.
    const b2 = (await bar.boundingBox())!;
    await page.mouse.move(b2.x + b2.width - 2, b2.y + b2.height / 2);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.width - 2 + 88, b2.y + b2.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(bar).toHaveAttribute('aria-label', /5 days/);
    await page.locator('.tl [role=radio]:has-text("Months"), .tl .bar button:has-text("Months")').first().click();
  });

  await test.step('a form view adds a row and requires a title', async () => {
    await page.click('.add-view');
    await page.click('.menu .item:has-text("Form")');
    await page.fill('.form input[id^="ff-title"]', 'Dune');
    await page.click('.form .choice:has-text("Reading")');
    await page.fill('.form input[type=text][placeholder="0"], .form input[inputmode=decimal]', '412');
    await page.click('.form button[type=submit]');
    await expect(page.locator('.form .sent')).toHaveCount(1);
    await expect(rowCount).toHaveText('5');
    await page.click('.form .sent button:has-text("Add another")');
    await page.click('.form button[type=submit]');
    await expect(page.locator('.form .error').first()).toBeVisible();
  });

  await test.step('a row template, and a row made from it', async () => {
    await page.click('.tab:has-text("Table")');
    await page.click('.new-more');
    await page.click('.popover .pop-item:has-text("New template")');
    await page.waitForTimeout(500);
    await page.keyboard.type('Book report');
    await page.click('.ProseMirror');
    await page.keyboard.type('Summary and favourite quote');
    await expect(page.locator('.tpl-banner')).toHaveCount(1);
    await page.waitForTimeout(800);
    await page.click('.db-row:has-text("Reading list") .nav-main');
    await expect(rowCount).toHaveText('5');
    await page.click('.new-more');
    await page.click('.popover .pop-item:has-text("Book report")');
    await expect(rowCount).toHaveText('6');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await expect(page.locator('.td[data-c="0"]', { hasText: 'Book report' })).toBeVisible();
  });

  await test.step('sub-items nest under their parent and fold', async () => {
    await page.click('.tools .icon-btn[aria-label="View settings"]');
    await page.click('.popover button:has-text("Turn on")');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await expect(page.locator('.head .th', { hasText: 'Parent item' })).toBeVisible();
    await expect(page.locator('.head .th', { hasText: 'Sub-items' })).toBeVisible();
    await cell(page, 0, 0).hover();
    await cell(page, 0, 0).locator('.open[aria-label="Add a sub-item"]').click({ force: true });
    await page.waitForTimeout(300);
    await page.keyboard.type('Chapter one notes');
    await page.keyboard.press('Enter');
    await expect(page.locator('.twisty')).toHaveCount(1);
    await expect(cell(page, 1, 0)).toContainText('Chapter one');
    await page.locator('.twisty').click();
    await expect(cell(page, 1, 0)).not.toContainText('Chapter one');
    await page.locator('.twisty').click();
    await expect(cell(page, 1, 0)).toContainText('Chapter one');
  });

  await test.step('an automation sets a date, and undo takes it back too', async () => {
    await page.click('.tools .icon-btn[aria-label="Automations"]');
    await page.click('.popover .pop-item:has-text("New automation")');
    await expect(page.locator('.popover .summary')).toHaveText(/When Status becomes Finished, set Finished to today/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const st = await colOf(page, 'Status');
    const fin = await colOf(page, 'Finished');
    await cell(page, 3, st).click();
    await page.click('.popover .opt:has-text("Finished")');
    await expect(cell(page, 3, fin)).not.toHaveText(/^\s*$/);
    await page.keyboard.press('Control+z');
    await expect(cell(page, 3, fin)).toHaveText(/^\s*$/);
  });

  await test.step('a button property sets the status when pressed', async () => {
    await page.click('.th.add');
    await page.click('.popover .pop-item:has-text("Button")');
    await page.fill('.popover input[aria-label="Button text"]', 'Start reading');
    await page.click('.popover .pop-item:has-text("Add an action")');
    const selects = page.locator('.popover .action select');
    await selects.nth(1).selectOption({ label: 'Status' });
    await page.waitForTimeout(150);
    await selects.nth(2).selectOption({ label: 'Reading' });
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const st = await colOf(page, 'Status');
    const button = page.locator('.td[data-r="4"] .v-button');
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expect(cell(page, 4, st)).toContainText('Reading');
  });
});
