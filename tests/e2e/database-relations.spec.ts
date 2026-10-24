// Databases: relations and rollups between two databases, importing CSV
// (small and large), filters, bulk delete with undo, and the trash.
import type { Page } from '@playwright/test';
import { test, expect, open } from './fixtures';

const cell = (page: Page, r: number, c: number) => page.locator(`.td[data-r="${r}"][data-c="${c}"]`);
const colOf = async (page: Page, name: string) =>
  (await page.locator('.head .th').allTextContents()).findIndex((t) => t.trim().startsWith(name));

async function newDatabase(page: Page, template: string, name: string) {
  await page.click('.section-head:has-text("Databases") .section-add', { force: true });
  await page.click(`.tile:has-text("${template}")`);
  await page.waitForTimeout(500);
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
}

async function addRows(page: Page, titles: string[]) {
  for (const t of titles) {
    await page.click('button.new');
    await page.waitForTimeout(300);
    await page.keyboard.type(t);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
  }
}

/** Imports CSV text through the new-database sheet. */
async function importCsv(page: Page, name: string, csv: string) {
  await page.click('.section-head:has-text("Databases") .section-add', { force: true });
  await page.setInputFiles('input[type=file][accept*=csv]', { name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
}

test('a two-way relation and a rollup over it', async ({ page }) => {
  await open(page);
  await newDatabase(page, 'Projects', 'Big projects');
  await page.click('.tab:has-text("All projects")');
  await addRows(page, ['Science fair', 'History essay']);
  await newDatabase(page, 'Tasks', 'Steps');
  await page.click('.tab:has-text("All tasks")');
  await addRows(page, ['Pick a topic', 'Build model', 'Write outline']);

  await test.step('a two-way relation property', async () => {
    await page.click('.th.add');
    await page.click('.db-pop .pop-item:has-text("Relation")');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Project');
    await page.locator('.db-pop select').first().selectOption({ label: 'Big projects' });
    await page.locator('.db-pop .pop-row:has-text("Two-way") button[role=switch]').click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await expect(page.locator('.head .th', { hasText: 'Project' })).toBeVisible();
  });

  await test.step('linking each task to a project', async () => {
    const rel = await colOf(page, 'Project');
    for (const [r, project] of [[0, 'Science fair'], [1, 'Science fair'], [2, 'History essay']] as const) {
      await cell(page, r, rel).click();
      await page.click(`.db-pop .pop-item:has-text("${project}")`);
      await page.waitForTimeout(150);
      await page.keyboard.press('Escape');
      await expect(cell(page, r, rel)).toContainText(project);
    }
    const st = await colOf(page, 'Status');
    await cell(page, 0, st).click();
    await page.click('.db-pop .opt:has-text("Done")');
    await expect(cell(page, 0, st)).toContainText('Done');
  });

  await test.step('the projects get the other side of the relation', async () => {
    await page.click('.sidebar .db-row:has-text("Big projects") .nav-main');
    await page.click('.tab:has-text("All projects")');
    await expect(page.locator('.td', { hasText: 'Write outline' })).toBeVisible();
  });

  await test.step('a rollup counts the related tasks', async () => {
    await page.click('.th.add');
    await page.click('.db-pop .pop-item:has-text("Rollup")');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Tasks done');
    await page.locator('.db-pop select').nth(0).selectOption({ index: 1 });
    await page.waitForTimeout(200);
    await page.locator('.db-pop select').nth(1).selectOption({ label: 'Status' });
    await page.locator('.db-pop select').nth(2).selectOption({ label: 'Count values' });
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    const rc = await colOf(page, 'Tasks done');
    expect(rc).toBeGreaterThanOrEqual(0);
    const titles = (await page.locator('.td[data-c="0"]').allInnerTexts()).map((t) => t.trim());
    const values = (await page.locator(`.td[data-c="${rc}"]`).allInnerTexts()).map((t) => t.trim());
    const byTitle = Object.fromEntries(titles.map((t, i) => [t.replace(/\s*Open$/, ''), values[i]]));
    expect(byTitle).toMatchObject({ 'Science fair': '2', 'History essay': '1' });
  });
});

test('CSV import, filters, bulk delete and the trash', async ({ page }) => {
  await open(page);

  await test.step('importing a CSV makes a database with typed columns', async () => {
    await importCsv(
      page,
      'people.csv',
      'Name,Email,Course,Score,Joined,Active\n' +
        'Ada Lovelace,ada@example.com,Math,98,2026-09-01,yes\n' +
        'Alan Turing,alan@example.com,CS,95,2026-09-03,no\n' +
        'Grace Hopper,grace@example.com,CS,99,Sep 5 2026,yes\n' +
        'Katherine Johnson,kj@example.com,Math,97,2026-09-08,yes\n',
    );
    await expect(page.locator('h1.title')).toHaveText('people');
    await expect(page.locator('.tr')).toHaveCount(4);
    const heads = (await page.locator('.head .th').allTextContents()).map((h) => h.trim());
    expect(heads).toEqual(expect.arrayContaining(['Name', 'Email', 'Course', 'Score', 'Joined', 'Active']));
  });

  await test.step('the filter, settings and property menus open', async () => {
    await page.click('.tools .icon-btn[aria-label="Filter"]');
    await page.click('.db-pop .add');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.click('.tools .icon-btn[aria-label="View settings"]');
    await expect(page.locator('.db-pop').last()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('.th:has-text("Course")').click();
    await expect(page.locator('.db-pop').last()).toBeVisible();
    await page.keyboard.press('Escape');
  });

  await test.step('deleting a picked row, then undoing it', async () => {
    const rows = page.locator('.tr');
    await rows.first().hover();
    await rows.first().locator('.pick').click();
    await page.click('.bulk .destructive');
    await expect(rows).toHaveCount(3);
    await page.click('.toast button:has-text("Undo"), button:has-text("Undo")');
    await expect(rows).toHaveCount(4);
  });

  await test.step('a whole database goes to the trash', async () => {
    await page.click('.titlebar .icon-btn[data-tip="More"]');
    await page.click('.menu .item:has-text("Move to Trash")');
    await expect(page.locator('.sidebar .db-row:has-text("people")')).toHaveCount(0);
    await page.click('.titlebar .trash');
    await expect(page.locator('text=people').first()).toBeVisible();
  });
});

test('a 3000-row import stays quick to sort and search', async ({ page }) => {
  await open(page);
  const lines = ['Name,Course,Score,Due,Done'];
  const courses = ['Math', 'CS', 'Physics', 'History'];
  for (let i = 0; i < 3000; i++) {
    lines.push(`Item ${i},${courses[i % 4]},${(i * 37) % 101},2026-10-${String((i % 28) + 1).padStart(2, '0')},${i % 2 ? 'no' : 'yes'}`);
  }
  await importCsv(page, 'big.csv', lines.join('\n') + '\n');
  await expect(cell(page, 0, 0)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.db-row:has-text("big") .count')).toHaveText('3000');

  await test.step('sorting by a column', async () => {
    await page.click('.th:has-text("Score")');
    const sort = page.locator('.db-pop .pop-item:has-text("Sort descending"), .db-pop .pop-item:has-text("Descending")');
    await sort.first().click();
    await expect(cell(page, 0, await colOf(page, 'Score'))).toHaveText(/100/);
  });

  await test.step('searching the rows', async () => {
    await page.click('[aria-label="Search"]');
    await page.locator('[aria-label="Search rows"]').fill('Item 2999');
    await expect(page.locator('.tr')).toHaveCount(1);
    await expect(cell(page, 0, 0)).toContainText('Item 2999');
  });
});
