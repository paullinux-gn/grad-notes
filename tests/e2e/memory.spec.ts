// Going round the app many times must not keep growing memory: pages,
// databases, search and the calendar let go of what they made when you leave.
import { test, expect, open } from './fixtures';

test.use({ viewport: { width: 1360, height: 860 } });

test('memory stays flat while moving around the app', async ({ page }) => {
  test.setTimeout(180_000);
  const wait = (ms = 150) => page.waitForTimeout(ms);
  const cdp = await page.context().newCDPSession(page);

  /** Live JS heap in MB and DOM counters, after collecting garbage. */
  async function measure() {
    for (let i = 0; i < 3; i++) {
      await cdp.send('HeapProfiler.collectGarbage');
      await wait(50);
    }
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    const counters = await cdp.send('Memory.getDOMCounters');
    return { heap: usedSize / 1048576, nodes: counters.nodes, listeners: counters.jsEventListeners };
  }

  async function round() {
    await page.click('.sidebar >> text=Reading list');
    await wait();
    for (const view of ['Shelf', 'By status', 'Table']) {
      await page.click(`.tab:has-text("${view}")`);
      await wait();
    }
    await page.locator('.td[data-r="0"][data-c="0"]').hover();
    await page.locator('.td[data-r="0"][data-c="0"] .open').last().click({ force: true });
    await wait(300);
    await page.click('.sidebar >> text=Getting started');
    await wait(300);
    await page.click('.sidebar >> text=Home');
    await wait();
    await page.click('.sidebar >> text=Calendar');
    await wait();
    await page.keyboard.press('Control+k');
    await page.keyboard.type('cell');
    await wait();
    await page.keyboard.press('Escape');
    await page.click('.sidebar >> text=Files');
    await wait();
  }

  await open(page);
  // Warm up first, so caches and lazily loaded code are in place.
  for (let i = 0; i < 4; i++) await round();
  const before = await measure();
  for (let i = 0; i < 16; i++) await round();
  const after = await measure();
  test.info().annotations.push({
    type: 'memory',
    description: `heap ${before.heap.toFixed(1)} → ${after.heap.toFixed(1)} MB, DOM nodes ${before.nodes} → ${after.nodes}, listeners ${before.listeners} → ${after.listeners}`,
  });

  // Generous limits: a real leak (every page or view kept alive) grows far past these in 16 rounds.
  await test.step('the JS heap grows by less than 8 MB', async () => {
    expect(after.heap - before.heap).toBeLessThan(8);
  });
  await test.step('DOM nodes and listeners do not pile up', async () => {
    expect(after.nodes - before.nodes).toBeLessThan(1500);
    expect(after.listeners - before.listeners).toBeLessThan(300);
  });
});
