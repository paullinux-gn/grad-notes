// Opening pages of every size, and typing at the end of the biggest one.
const pages = await T.invoke('list_pages');
const roots = pages.filter((p) => !p.parentId && !p.deletedAt);
let book;
let size = 0;
for (const p of roots) {
  const n = ((await T.invoke('get_page', { id: p.id })).content || '').length;
  if (n > size) [book, size] = [p, n];
}
const blocks = () => document.querySelector('.prose')?.childElementCount ?? 0;
const open = async (p, min) => {
  sidebarPage(p.title).scrollIntoView();
  return { ...(await timed('open ' + p.title, () => sidebarPage(p.title).click(), () => blocks() >= min)), blocks: blocks() };
};
const out = [];
out.push({ ...(await open(book, 1000)), sizeKB: Math.round(size / 1024) });
// 40 characters at the end of it, one per frame: input to paint.
const prose = document.querySelector('.prose');
prose.focus();
const range = document.createRange();
range.selectNodeContents(prose.lastElementChild);
range.collapse(false);
getSelection().removeAllRanges();
getSelection().addRange(range);
longTasks();
const lat = [];
for (let i = 0; i < 40; i++) {
  const t0 = performance.now();
  document.execCommand('insertText', false, 'x');
  await new Promise((r) => requestAnimationFrame(r));
  lat.push(performance.now() - t0);
  await sleep(30);
}
await sleep(1200);
lat.sort((a, b) => a - b);
out.push({ typing: { medianMs: Math.round(lat[20]), p95Ms: Math.round(lat[38]), worstMs: Math.round(lat[39]) }, longTasks: longTasks() });
out.push(await open(roots.find((p) => p.title === 'Every to-do'), 1));
out.push(await open(roots.find((p) => p.title === 'Huge deck'), 1000));
out.push(await open(roots.find((p) => p !== book && p.title !== 'Getting started' && !/to-do|deck/.test(p.title)), 1));
sidebarItem('Home').click();
await sleep(10000);
out.push({ backHome: { heapMB: heapMB(), elements: document.getElementsByTagName('*').length } });
return out;
