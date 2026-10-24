/**
 * What every interface test starts from: a fresh browser (so the stand-in
 * storage is empty and seeds the example pages), and a watch on the page's
 * errors. A test fails if the app throws or logs an error, even when every
 * step it checks went right.
 */
import { test as base, expect, type Page } from '@playwright/test';

export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`uncaught: ${e.stack ?? e}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });
      await use(errors);
      expect(errors, 'errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Opens the app (with `query`, like '?fresh') and waits for it to be ready to use. */
export async function open(page: Page, query = '') {
  await page.goto('/' + query);
  await page.locator('.sidebar').waitFor();
  await page.waitForTimeout(300);
}

/** The mod key as Playwright names it: shortcuts use Ctrl on Windows and Linux. */
export const MOD = 'Control';
