// Shared by the scenario files (run.mjs puts this in front of each).
const T = window.__TAURI_INTERNALS__;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
async function until(fn, timeout = 60000) {
  const t0 = performance.now();
  while (!fn()) {
    if (performance.now() - t0 > timeout) throw new Error('timed out');
    await sleep(4);
  }
}
// Long tasks (main-thread work over 50 ms) since the last call.
if (!window.__lt) {
  window.__lt = [];
  new PerformanceObserver((l) => window.__lt.push(...l.getEntries().map((e) => Math.round(e.duration)))).observe({ type: 'longtask', buffered: true });
}
const longTasks = () => {
  const a = window.__lt.splice(0);
  return { count: a.length, longestMs: Math.max(0, ...a) };
};
// Time from an action until `done()` holds and the next frame is painted.
async function timed(label, action, done) {
  longTasks();
  const t0 = performance.now();
  await action();
  await until(done);
  await frame();
  const ms = Math.round(performance.now() - t0);
  await sleep(300);
  return { label, ms, longTasks: longTasks() };
}
const heapMB = () => Math.round(performance.memory.usedJSHeapSize / 1048576);
const sidebarPage = (title) => [...document.querySelectorAll('.sidebar .row')].find((r) => r.querySelector('.title')?.textContent === title);
const sidebarItem = (label) =>
  [...document.querySelectorAll('.sidebar .nav-main, .sidebar .row')].find((e) => (e.querySelector('.label, .title')?.textContent ?? '').trim() === label);
