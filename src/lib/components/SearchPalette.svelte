<script lang="ts">
  import { split } from '../split.svelte';
  import PageIcon from './PageIcon.svelte';
  import { colorVar } from '../colors';
  import { importCalendar } from '../ics-import.svelte';
  import { exportWorkspace } from '../export-workspace';
  import { cards } from '../cards.svelte';
  import { databases } from '../databases.svelte';
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';
  import FileTile from '../ui/FileTile.svelte';
  import { api } from '../api';
  import { calendar } from '../calendar.svelte';
  import { clock } from '../clock.svelte';
  import { dueState, formatDate, formatDue, formatTime } from '../dates';
  import { rank } from '../editor/suggestion.svelte';
  import { KINDS, fileKind, library } from '../library.svelte';
  import { planner } from '../planner.svelte';
  import { store } from '../store.svelte';
  import { tags } from '../tags.svelte';
  import { ui } from '../ui.svelte';
  import { formatBytes, relativeTime } from '../time';
  import type { FileMeta, SearchHit } from '../types';

  /** One result row. Rows of the same group are listed together. */
  interface Row {
    key: string;
    group: string;
    title: string;
    icon?: string;
    emoji?: string;
    file?: FileMeta;
    /** CSS colour for the icon (course and event colours). */
    color?: string;
    path?: string;
    snippet?: string;
    meta?: string;
    metaClass?: string;
    run: () => void;
      /** Alt+Enter: open beside the current page instead. */
    side?: () => void;
  }

  let input: HTMLInputElement;
  let list = $state<HTMLDivElement>();
  let query = $state('');
  let hits = $state<SearchHit[]>([]);
  let selected = $state(0);
  let seq = 0;

  onMount(() => {
    input.focus();
    void run('');
  });

  // One search at a time: typing while one runs only remembers the latest
  // query, so fast typing in a big workspace never queues up stale searches.
  let busy = false;
  let next: string | null = null;

  async function run(q: string) {
    if (busy) {
      next = q;
      return;
    }
    busy = true;
    const mine = ++seq;
    try {
      const result = await api.search(q, 40);
      if (mine === seq && next === null) {
        hits = result;
        selected = 0;
      }
    } catch (e) {
      ui.error(e);
    } finally {
      busy = false;
      if (next !== null) {
        const q2 = next;
        next = null;
        void run(q2);
      }
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  function onInput() {
    clearTimeout(timer);
    selected = 0;
    timer = setTimeout(() => run(query), 60);
  }

  function close() {
    ui.searchOpen = false;
  }

  /** Splits an FTS snippet into plain and highlighted runs. */
  function parts(snippet: string): { text: string; hit: boolean }[] {
    const out: { text: string; hit: boolean }[] = [];
    for (const piece of snippet.split('\u0001')) {
      const [hit, rest] = piece.includes('\u0002') ? piece.split('\u0002') : [null, piece];
      if (hit !== null) out.push({ text: hit, hit: true });
      if (rest) out.push({ text: rest, hit: false });
    }
    return out;
  }

  function pathOf(id: string) {
    return store
      .ancestors(id)
      .map((a) => a.title || 'Untitled')
      .join(' / ');
  }

  const GOTO = [
    { title: 'Home', icon: 'home', keywords: 'today start dashboard', run: () => store.go('home') },
    { title: 'Quick Capture', icon: 'bolt', keywords: 'capture inbox note todo add', run: () => (ui.capture = { text: '' }) },
    { title: 'Assignments', icon: 'assignment', keywords: 'homework tasks due', run: () => store.go('assignments') },
    { title: 'Calendar', icon: 'calendar', keywords: 'schedule events week month', run: () => store.go('calendar') },
    { title: 'Flashcards', icon: 'cards', keywords: 'study cards decks review memorize quiz', run: () => store.go('cards') },
    { title: 'Study Flashcards', icon: 'cards', keywords: 'review due cards learn', run: () => void cards.study(null, 'All Decks') },
    { title: 'Import Calendar', icon: 'download', keywords: 'ics canvas google outlook schedule timetable', run: () => void importCalendar() },
    { title: 'Files', icon: 'files', keywords: 'library attachments documents', run: () => store.go('files') },
    { title: 'Export All Notes as Markdown', icon: 'download', keywords: 'export backup markdown md obsidian folder save all notes csv', run: () => void exportWorkspace() },
    { title: 'New Database', icon: 'database', keywords: 'table board tracker spreadsheet template kanban list', run: () => (ui.newDatabase = { parentId: null }) },
    { title: 'Import a Spreadsheet', icon: 'upload', keywords: 'csv excel sheets database table import', run: () => (ui.newDatabase = { parentId: null }) },
    { title: 'Settings', icon: 'settings', keywords: 'preferences theme accent color', run: () => (ui.settingsOpen = true) },
    { title: 'Keyboard Shortcuts', icon: 'keyboard', keywords: 'keys hotkeys help cheat sheet', run: () => (ui.shortcutsHelp = true) },
    { title: 'Trash', icon: 'trash', keywords: 'deleted restore', run: () => (ui.trashOpen = true) },
  ];

  const rows = $derived.by((): Row[] => {
    const q = query.trim();
    const out: Row[] = [];
    const pages = hits.map(
      (hit): Row => ({
        key: `p:${hit.id}`,
        group: q ? 'Pages' : 'Recently Edited',
        title: hit.title || 'Untitled',
        emoji: hit.icon || undefined,
        icon: hit.icon ? undefined : store.byId.get(hit.id)?.kind === 'database' ? 'database' : 'page',
        path: pathOf(hit.id) || undefined,
        snippet: hit.snippet || undefined,
        meta: relativeTime(hit.updatedAt),
        run: () => store.open(hit.id),
        side: () => split.show(hit.id),
      }),
    );
    const assignmentRow = (a: (typeof planner.live)[number]): Row => {
      const course = a.courseId ? planner.courseById.get(a.courseId) : undefined;
      return {
        key: `a:${a.id}`,
        group: q ? 'Assignments' : 'Up Next',
        title: a.title || 'Untitled',
        icon: a.status === 'done' ? 'check' : 'assignment',
        color: planner.courseColor(a.courseId),
        path: course?.name,
        meta: formatDue(a.dueDate, a.dueTime, clock.today),
        metaClass: dueState(a, clock.today, clock.time),
        run: () => planner.openAssignment(a.id),
      };
    };

    if (!q) {
      out.push(...pages.slice(0, 8));
      out.push(
        ...planner.live
          .filter((a) => a.status !== 'done' && a.dueDate)
          .slice(0, 3)
          .map(assignmentRow),
      );
      return out;
    }

    // "#exam" lists matching tags first.
    const tagQuery = q.replace(/^#/, '').toLowerCase();
    const tagRows = tags.used
      .filter((t) => t.includes(tagQuery))
      .slice(0, q.startsWith('#') ? 8 : 3)
      .map(
        (t): Row => ({
          key: `t:${t}`,
          group: 'Tags',
          title: `#${t}`,
          icon: 'tag',
          color: tags.color(t),
          meta: `${tags.counts.get(t) ?? 0} item${tags.counts.get(t) === 1 ? '' : 's'}`,
          run: () => store.openTag(t),
        }),
      );
    if (q.startsWith('#')) out.push(...tagRows);
    const courses = planner.courses.map((c) => ({ c, title: c.name, keywords: `${c.teacher} ${c.room} course class` }));
    out.push(
      ...rank(courses, q, 3).map(
        ({ c }): Row => ({
          key: `c:${c.id}`,
          group: 'Courses',
          title: c.name || 'Untitled',
          icon: 'book',
          color: colorVar(c.color),
          path: c.teacher || undefined,
          run: () => store.openCourse(c.id),
        }),
      ),
    );
    out.push(...pages);
    // Rows found by their values ("Tolkien" finds the book by its author).
    out.push(
      ...databases
        .findRows(q, 5)
        .filter(({ row }) => !hits.some((h) => h.id === row.id))
        .map(
          ({ row, prop, text }): Row => ({
            key: `r:${row.id}`,
            group: 'Database Rows',
            title: store.byId.get(row.id)?.title || 'Untitled',
            emoji: store.byId.get(row.id)?.icon || undefined,
            icon: store.byId.get(row.id)?.icon ? undefined : 'page',
            path: `${store.byId.get(row.dbId)?.title || 'Untitled database'} · ${prop.name}: ${text}`,
            run: () => store.open(row.id),
            side: () => split.show(row.id),
          }),
        ),
    );
    const tagWords = (list: string[]) => list.map((t) => `#${t} ${t}`).join(' ');
    const assignments = planner.live.map((a) => ({
      a,
      title: a.title,
      keywords: `${a.notes} ${a.courseId ? (planner.courseById.get(a.courseId)?.name ?? '') : ''} ${tagWords(a.tags)}`,
    }));
    out.push(...rank(assignments, q, 6).map(({ a }) => assignmentRow(a)));
    const events = planner.liveEvents.map((e) => ({ e, title: e.title, keywords: `${e.location} ${e.notes} ${tagWords(e.tags)}` }));
    out.push(
      ...rank(events, q, 5).map(
        ({ e }): Row => ({
          key: `e:${e.id}`,
          group: 'Events',
          title: e.title || 'Untitled',
          icon: 'calendar',
          color: planner.eventColor(e),
          path: e.location || undefined,
          meta: formatDate(e.startDate) + (e.startTime ? `, ${formatTime(e.startTime)}` : '') + (e.repeat !== 'none' ? ' · repeats' : ''),
          run: () => {
            calendar.show(e.startDate);
            planner.openEvent(e.id);
          },
        }),
      ),
    );
    const files = library.live.map((f) => ({ f, title: f.name, keywords: `${KINDS[fileKind(f)].label} ${tagWords(f.tags)}` }));
    out.push(
      ...rank(files, q, 5).map(
        ({ f }): Row => ({
          key: `f:${f.id}`,
          group: 'Files',
          title: f.name,
          file: f,
          path: KINDS[fileKind(f)].label,
          meta: formatBytes(f.size),
          run: () => library.preview(f.id),
        }),
      ),
    );
    if (!q.startsWith('#')) out.push(...tagRows);
    out.push(...rank(GOTO, q, 3).map((g): Row => ({ key: `g:${g.title}`, group: 'Go To', title: g.title, icon: g.icon, run: g.run })));
    out.push(
      { key: 'new-page', group: 'Create', title: `New page “${q}”`, icon: 'page-plus', meta: 'Page', run: () => void store.create(null, { title: q }) },
      { key: 'new-database', group: 'Create', title: `New database “${q}”`, icon: 'database', meta: 'Database', run: () => void databases.create({ title: q }) },
      {
        key: 'new-assignment',
        group: 'Create',
        title: `New assignment “${q}”`,
        icon: 'assignment',
        meta: 'Assignment',
        run: () => planner.newAssignment({ title: q }),
      },
      {
        key: 'new-event',
        group: 'Create',
        title: `New event “${q}”`,
        icon: 'calendar',
        meta: 'Event',
        run: () => planner.newEvent({ title: q, startDate: clock.today, endDate: clock.today, startTime: '09:00', endTime: '10:00' }),
      },
    );
    return out;
  });

  function choose(i: number, beside = false) {
    const row = rows[i];
    if (!row) return;
    close();
    if (beside && row.side) row.side();
    else row.run();
  }

  function onKey(e: KeyboardEvent) {
    const total = rows.length;
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      selected = total ? (selected + 1) % total : 0;
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      selected = total ? (selected - 1 + total) % total : 0;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(selected, e.altKey);
    }
  }

  $effect(() => {
    const i = selected;
    list?.querySelector(`[data-index="${i}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  const nothingFound = $derived(query.trim() !== '' && rows.every((r) => r.group === 'Create'));
</script>

<Modal onclose={close} width={640} top="16vh" label="Search" glass>
  <div class="search">
    <Icon name="search" size={20} stroke={2} />
    <input
      bind:this={input}
      bind:value={query}
      oninput={onInput}
      onkeydown={onKey}
      placeholder="Search pages, assignments, events and files"
      spellcheck="false"
      autocomplete="off"
    />
  </div>
  {#if rows.length}
    <div class="results" bind:this={list}>
      {#if nothingFound}
        <div class="none">Nothing matches “{query.trim()}”</div>
      {/if}
      {#each rows as row, i (row.key)}
        {#if i === 0 || rows[i - 1].group !== row.group}
          <div class="group">{row.group}</div>
        {/if}
        <button
          class="hit"
          class:selected={i === selected}
          data-index={i}
          onmousemove={() => (selected = i)}
          onclick={() => choose(i)}
        >
          <span class="hit-icon" style:color={row.color}>
            {#if row.file}<FileTile file={row.file} size={26} />
            {:else if row.emoji}<span class="emoji"><PageIcon icon={row.emoji} /></span>
            {:else if row.icon}<Icon name={row.icon} size={18} />{/if}
          </span>
          <span class="hit-main">
            <span class="hit-line">
              <span class="hit-title">{row.title}</span>
              {#if row.path}<span class="hit-path">{row.path}</span>{/if}
            </span>
            {#if row.snippet}
              <span class="hit-snippet">
                {#each parts(row.snippet) as p}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}
              </span>
            {/if}
          </span>
          {#if row.meta}<span class="hit-time {row.metaClass ?? ''}">{row.meta}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="foot">
      <span class="hint"><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
      <span class="hint"><kbd>Enter</kbd> Open</span>
      <span class="hint"><kbd>Esc</kbd> Close</span>
    </div>
  {/if}
</Modal>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 56px;
    /* The search icon (20px, centred 30px in) shares a column with the
       result icons below (6px list + 10px row padding + half of 28px). */
    padding: 0 20px;
    flex: none;
    color: var(--text-3);
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none;
    background: transparent;
    font-size: 19px;
    font-weight: 400;
    letter-spacing: -0.014em;
    color: var(--text);
  }
  input::placeholder {
    color: var(--text-3);
  }
  .results {
    overflow-y: auto;
    padding: 6px;
    box-shadow: inset 0 1px 0 var(--hairline);
  }
  .group {
    padding: 8px 10px 4px;
    font-size: var(--fs-caption);
    font-weight: var(--fw-600);
    letter-spacing: 0.01em;
    color: var(--text-3);
  }
  .hit {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 6px 12px 6px 10px;
    border-radius: var(--r-md);
    text-align: left;
  }
  .hit.selected {
    background: var(--fill-2);
  }
  .hit-icon {
    flex: none;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    color: var(--text-2);
  }
  .emoji {
    font-size: 19px;
    line-height: 1;
  }
  .hit-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .hit-line {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .hit-title {
    flex: none;
    max-width: 70%;
    font-size: var(--fs-callout);
    font-weight: var(--fw-550);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hit-path {
    min-width: 0;
    font-size: var(--fs-footnote);
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hit-snippet {
    font-size: var(--fs-ui);
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  mark {
    background: none;
    color: var(--text);
    font-weight: var(--fw-650);
  }
  .hit-time {
    flex: none;
    font-size: var(--fs-footnote);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .hit-time.overdue {
    color: var(--danger);
  }
  .hit-time.today {
    color: var(--c-orange);
  }
  .none {
    padding: 16px 16px 8px;
    text-align: center;
    color: var(--text-3);
    font-size: var(--fs-body-ui);
  }
  .foot {
    flex: none;
    display: flex;
    gap: 16px;
    height: 40px;
    align-items: center;
    padding: 0 16px;
    box-shadow: inset 0 1px 0 var(--hairline);
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .hint kbd + kbd {
    margin-left: -3px;
  }
</style>
