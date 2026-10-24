// First steps in a new install: the setup card, empty states that offer a
// way in, page starters and the keyboard shortcuts sheet.
import { test, expect, open } from './fixtures';

test('a new install guides you in', async ({ page }) => {
  const wait = (ms = 400) => page.waitForTimeout(ms);
  const setup = page.locator('.setup');
  const sheet = page.locator('[aria-label="Keyboard shortcuts"]');
  await open(page, '?fresh');

  await test.step('Home shows the setup card at 0 of 4', async () => {
    await page.click('.sidebar >> text=Home');
    await expect(setup).toHaveCount(1);
    await expect(setup).toContainText('0 of 4');
  });

  await test.step('the calendar explains itself and labels Import', async () => {
    await page.click('.sidebar >> text=Calendar');
    await expect(page.locator('.first-run')).toHaveCount(1);
    await expect(page.locator('.import-btn')).toBeVisible();
  });

  await test.step('empty Flashcards offers to start a deck with a card in it', async () => {
    await page.click('.sidebar >> text=Flashcards');
    const start = page.locator('button:has-text("Start a deck")');
    await expect(start).toHaveCount(1);
    await start.click();
    await expect(page.locator('.ProseMirror .flashcard, .ProseMirror [data-type="flashcard"]').first()).toBeVisible();
    await page.keyboard.type('Mitochondria');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Powerhouse of the cell');
    await wait(1500);
  });

  await test.step('a new page offers starters; Lecture notes fills it in', async () => {
    await page.keyboard.press('Control+n');
    await expect(page.locator('.starters')).toBeVisible();
    await page.click('.starter:has-text("Lecture notes")');
    await expect(page.locator('.starters')).toHaveCount(0);
    await expect(page.locator('.ProseMirror h2', { hasText: 'Key ideas' })).toHaveCount(1);
    await expect(page.locator('.ProseMirror h2', { hasText: 'Summary' })).toHaveCount(1);
    await expect(page.locator('h1.title')).toContainText('Lecture notes');
  });

  await test.step('the caret lands in the first empty block', async () => {
    await page.keyboard.type('Cells are the unit of life');
    await expect(page.locator('.ProseMirror')).toContainText('Cells are the unit');
  });

  await test.step('making a deck ticks off a setup step', async () => {
    await wait();
    await page.click('.sidebar >> text=Home');
    await expect(setup).toContainText('1 of 4');
  });

  await test.step('Ctrl+/ opens and closes the shortcuts sheet', async () => {
    await page.keyboard.press('Control+/');
    await expect(sheet).toHaveCount(1);
    await page.keyboard.press('Control+/');
    await expect(sheet).toHaveCount(0);
  });

  await test.step('Change Shortcuts opens Settings at the keyboard section', async () => {
    await page.keyboard.press('Control+/');
    await page.click('button:has-text("Change Shortcuts")');
    await expect(page.getByRole('dialog', { name: 'Settings' })).toContainText('Keyboard shortcuts');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const top = document.getElementById('settings-keyboard')?.getBoundingClientRect().top;
          return top !== undefined && top >= 0 && top < innerHeight;
        }),
      )
      .toBe(true);
    // Right away, while the shortcuts sheet is still fading out.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
  });

  await test.step('searching "shortcuts" opens the sheet', async () => {
    await page.keyboard.press('Control+k');
    await page.keyboard.type('shortcuts');
    await wait();
    await page.keyboard.press('Enter');
    await expect(sheet).toHaveCount(1);
    // While search is still fading out.
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });

  await test.step('hiding the setup card lasts after a restart', async () => {
    await page.click('.setup button[aria-label="Hide"]');
    await expect(setup).toHaveCount(0);
    await wait();
    await open(page);
    await page.click('.sidebar >> text=Home');
    await expect(page.locator('h1.view-title')).toBeVisible();
    await expect(setup).toHaveCount(0);
  });

  await test.step('Ctrl+Shift+L switches between light and dark', async () => {
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    const before = await theme();
    await page.keyboard.press('Control+Shift+KeyL');
    await expect.poll(theme).not.toBe(before);
  });
});
