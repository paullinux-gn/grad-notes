// Opening the 49,000-row table and scrolling through it.
const out = [];
out.push(await timed('open Tasks', () => sidebarItem('Tasks').click(), () => document.querySelectorAll('.tr').length > 10));
const scroller = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 1000 && getComputedStyle(e).overflowY !== 'visible');
longTasks();
const frames = [];
let last = performance.now();
for (let i = 0; i < 60; i++) {
  scroller.scrollTop += 600;
  await new Promise((r) => requestAnimationFrame(r));
  const now = performance.now();
  frames.push(now - last);
  last = now;
}
frames.sort((a, b) => a - b);
out.push({ scrollFrame: { medianMs: Math.round(frames[30]), p95Ms: Math.round(frames[57]), worstMs: Math.round(frames[59]) }, longTasks: longTasks() });
return out;
