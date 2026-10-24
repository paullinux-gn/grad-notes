// Switching between the main views.
const out = [];
for (const v of ['Assignments', 'Calendar', 'Files', 'Flashcards', 'Home']) {
  out.push(await timed(v, () => sidebarItem(v).click(), () => document.querySelector('.view')));
  await sleep(1000);
}
return out;
