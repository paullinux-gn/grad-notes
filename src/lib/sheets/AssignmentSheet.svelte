<script lang="ts">
  import PageIcon from '../components/PageIcon.svelte';
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import FileTile from '../ui/FileTile.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Backlinks from '../ui/Backlinks.svelte';
  import TagRow from '../ui/TagRow.svelte';
  import StatusCheck from '../ui/StatusCheck.svelte';
  import { clock } from '../clock.svelte';
  import { colorVar, nextColor } from '../colors';
  import { addDays, dueState, formatDue, startOfWeek } from '../dates';
  import { openNotesPage } from '../item-actions';
  import { courseCategories, formatPercent, letterGrade, scorePercent } from '../grades';
  import { library } from '../library.svelte';
  import { planner } from '../planner.svelte';
  import { store } from '../store.svelte';
  import { relativeTime, formatBytes } from '../time';
  import { ui, type SheetState } from '../ui.svelte';
  import type { AssignmentPatch, AssignmentStatus, FileMeta } from '../types';

  let { sheet }: { sheet: SheetState<AssignmentPatch> } = $props();

  // The sheet is re-created per item, and closing clears the prop, so keep
  // what's needed after closing.
  // svelte-ignore state_referenced_locally
  const { id, onCreated } = sheet;
  const existing = $derived(id ? planner.assignmentById.get(id) : undefined);
  // svelte-ignore state_referenced_locally
  let draft = $state({
    title: '',
    courseId: null as string | null,
    dueDate: null as string | null,
    dueTime: null as string | null,
    status: 'todo' as AssignmentStatus,
    priority: 0,
    notes: '',
    fileIds: [] as string[],
    ...sheet.draft,
  });
  const form = $derived(existing ?? draft);
  const course = $derived(form.courseId ? planner.courseById.get(form.courseId) : undefined);
  const page = $derived(existing?.pageId ? store.byId.get(existing.pageId) : undefined);
  const files = $derived(form.fileIds.map((fid) => library.byId.get(fid)).filter((f): f is FileMeta => !!f && !f.deletedAt));
  const urgency = $derived(dueState(form, clock.today, clock.time));
  const percent = $derived(existing ? scorePercent(existing) : null);

  /** A number field's value: empty means "not set". */
  function points(raw: string): number | null {
    const n = Number(raw.replace(',', '.'));
    return raw.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
  }

  function categoryMenu(e: MouseEvent) {
    const current = existing?.category ?? '';
    const weights = course?.weights ?? {};
    ui.openMenuAt(
      e.currentTarget as Element,
      [
        { label: 'No Category', icon: 'x', checked: !current, action: () => set({ category: '' }) },
        ...courseCategories(course, planner.assignments).map((name) => ({
          label: name,
          hint: name in weights ? `${weights[name]}%` : undefined,
          checked: current === name,
          action: () => set({ category: name }),
        })),
        { separator: true },
        {
          label: 'New Category…',
          icon: 'plus',
          action: async () => {
            const res = await ui.prompt({ title: 'New Category', placeholder: 'Homework, Exams, Labs…', confirmLabel: 'Add', icon: 'assignment' });
            if (res) set({ category: res.value.trim() });
          },
        },
      ],
      { alignRight: true },
    );
  }

  let titleEl: HTMLInputElement;
  let dropping = $state(false);

  onMount(() => {
    if (!existing) titleEl.focus();
  });

  /** Edits the live assignment (autosaved) or the draft of a new one. */
  function set(patch: AssignmentPatch, { typing = false } = {}) {
    if (existing) planner.updateAssignment(existing.id, patch, { immediate: !typing });
    else Object.assign(draft, patch);
  }

  async function add() {
    if (!draft.title.trim()) {
      titleEl.focus();
      return;
    }
    ui.assignmentSheet = null;
    const a = await planner.addAssignment({ ...draft, title: draft.title.trim() });
    if (a) onCreated?.(a.id);
  }

  /** Closing never loses work: a new assignment with a title is kept. */
  function close() {
    if (!existing && draft.title.trim()) void add();
    else ui.assignmentSheet = null;
  }

  function cancel() {
    ui.assignmentSheet = null;
  }

  function courseMenu(e: MouseEvent) {
    ui.openMenuAt(
      e.currentTarget as Element,
      [
        { label: 'No Course', icon: 'x', checked: !form.courseId, action: () => set({ courseId: null }) },
        ...(planner.courses.length ? [{ separator: true } as const] : []),
        ...planner.courses.map((c) => ({
          label: c.name || 'Untitled',
          dot: colorVar(c.color),
          checked: form.courseId === c.id,
          action: () => set({ courseId: c.id }),
        })),
        { separator: true },
        {
          label: 'New Course…',
          icon: 'plus',
          action: async () => {
            const res = await ui.prompt({
              title: 'New Course',
              placeholder: 'Course name',
              confirmLabel: 'Add Course',
              icon: 'book',
              color: nextColor(planner.courses.map((c) => c.color)),
            });
            if (!res) return;
            const c = await planner.addCourse(res.value, res.color);
            if (c) set({ courseId: c.id });
          },
        },
      ],
      { alignRight: true },
    );
  }

  const quickDates = $derived([
    { label: 'Today', date: clock.today },
    { label: 'Tomorrow', date: addDays(clock.today, 1) },
    { label: 'Next Week', date: addDays(startOfWeek(clock.today, 1), 7) },
  ]);

  function attach(list: FileMeta[]) {
    const ids = [...form.fileIds];
    for (const f of list) if (!ids.includes(f.id)) ids.push(f.id);
    set({ fileIds: ids });
  }

  function detach(fid: string) {
    set({ fileIds: form.fileIds.filter((x) => x !== fid) });
  }

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dropping = true;
  }

  async function onDrop(e: DragEvent) {
    dropping = false;
    const list = Array.from(e.dataTransfer?.files ?? []);
    if (!list.length) return;
    e.preventDefault();
    attach(await library.add(list));
  }

  async function notesPage() {
    if (existing) {
      await openNotesPage('assignment', existing.id);
      return;
    }
    // A new assignment is saved first, so the page can link back to it.
    if (!draft.title.trim()) {
      titleEl.focus();
      return;
    }
    ui.assignmentSheet = null;
    const a = await planner.addAssignment({ ...draft, title: draft.title.trim() });
    if (!a) return;
    onCreated?.(a.id);
    await openNotesPage('assignment', a.id);
  }
</script>

<Modal onclose={close} label={existing ? 'Assignment' : 'New Assignment'}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sheet" class:dropping ondragover={onDragOver} ondragleave={(e) => e.currentTarget === e.target && (dropping = false)} ondrop={onDrop}>
    <header class="modal-head">
      <StatusCheck
        done={form.status === 'done'}
        color={planner.courseColor(form.courseId)}
        size={20}
        label={form.status === 'done' ? 'Mark as not done' : 'Mark as done'}
        ontoggle={() => set({ status: form.status === 'done' ? 'todo' : 'done' })}
      />
      <input
        class="title"
        class:done={form.status === 'done'}
        bind:this={titleEl}
        value={form.title}
        placeholder={existing ? 'Untitled' : 'New assignment'}
        spellcheck="false"
        oninput={(e) => set({ title: e.currentTarget.value }, { typing: true })}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (existing) close();
            else void add();
          }
        }}
      />
      <button class="icon-btn" onclick={close} aria-label="Close"><Icon name="x" /></button>
    </header>

    <div class="modal-body">
      <div class="group">
        <div class="group-row">
          <div class="row-label">Course</div>
          <button class="btn small raised picker" onclick={courseMenu}>
            {#if course}<span class="dot" style:--dot={colorVar(course.color)}></span>{course.name || 'Untitled'}{:else}<span class="muted">None</span>{/if}
            <Icon name="chevron-down" size={12} stroke={2.2} />
          </button>
        </div>
        <div class="group-row due-row">
          <div class="row-label">
            Due
            <small class="due-state {urgency}">{form.dueDate ? formatDue(form.dueDate, form.dueTime, clock.today) : 'No due date'}</small>
          </div>
          <div class="due">
            <div class="due-fields">
              <label class="field date">
                <input
                  type="date"
                  value={form.dueDate ?? ''}
                  aria-label="Due date"
                  onchange={(e) => set({ dueDate: e.currentTarget.value || null })}
                />
              </label>
              {#if form.dueDate}
                {#if form.dueTime !== null}
                  <label class="field time">
                    <input type="time" value={form.dueTime} aria-label="Due time" onchange={(e) => set({ dueTime: e.currentTarget.value || null })} />
                  </label>
                  <button class="icon-btn" onclick={() => set({ dueTime: null })} data-tip="Remove time"><Icon name="x" size={14} /></button>
                {:else}
                  <button class="btn small raised" onclick={() => set({ dueTime: '23:59' })}><Icon name="clock" size={13} stroke={2} /> Add Time</button>
                {/if}
              {/if}
            </div>
            <div class="quick">
              {#each quickDates as q (q.label)}
                <button class="chip" class:on={form.dueDate === q.date} onclick={() => set({ dueDate: q.date })}>{q.label}</button>
              {/each}
              {#if form.dueDate}<button class="chip" onclick={() => set({ dueDate: null })}>None</button>{/if}
            </div>
          </div>
        </div>
        <div class="group-row">
          <div class="row-label">Status</div>
          <Segmented
            label="Status"
            value={form.status}
            onchange={(v) => set({ status: v })}
            options={[
              { value: 'todo', label: 'To Do' },
              { value: 'doing', label: 'In Progress' },
              { value: 'done', label: 'Done' },
            ]}
          />
        </div>
        <div class="group-row">
          <div class="row-label">Priority</div>
          <Segmented
            label="Priority"
            value={form.priority}
            onchange={(v) => set({ priority: v })}
            options={[
              { value: 0, label: 'None' },
              { value: 1, label: 'Low' },
              { value: 2, label: 'Medium' },
              { value: 3, label: 'High' },
            ]}
          />
        </div>
      </div>

      {#if existing}
        <div class="group tags-group">
        <div class="group-row tags-row">
          <div class="row-label">Tags</div>
          <TagRow table="assignments" id={existing.id} compact />
        </div>
        </div>
      {/if}

      {#if existing}
        <h3 class="group-title">Grade</h3>
        <div class="group">
          <div class="group-row">
            <div class="row-label">
              Score
              <small>{percent !== null ? `${formatPercent(percent)} · ${letterGrade(percent)}` : 'Points earned out of points possible'}</small>
            </div>
            <div class="score">
              <label class="field num">
                <input
                  type="number"
                  inputmode="decimal"
                  min="0"
                  step="any"
                  value={existing.score ?? ''}
                  placeholder="—"
                  aria-label="Points earned"
                  oninput={(e) => set({ score: points(e.currentTarget.value) }, { typing: true })}
                />
              </label>
              <span class="slash">/</span>
              <label class="field num">
                <input
                  type="number"
                  inputmode="decimal"
                  min="0"
                  step="any"
                  value={existing.maxScore ?? ''}
                  placeholder="—"
                  aria-label="Points possible"
                  oninput={(e) => set({ maxScore: points(e.currentTarget.value) }, { typing: true })}
                />
              </label>
            </div>
          </div>
          <div class="group-row">
            <div class="row-label">
              Category
              {#if course && Object.keys(course.weights).length}<small>Weighted in {course.name || 'the course'}’s grade</small>{/if}
            </div>
            <button class="btn small raised picker" onclick={categoryMenu}>
              {#if existing.category}{existing.category}{:else}<span class="muted">None</span>{/if}
              <Icon name="chevron-down" size={12} stroke={2.2} />
            </button>
          </div>
        </div>
      {/if}

      <h3 class="group-title">Notes</h3>
      <div class="group">
        <div class="group-row stack">
          <textarea
            class="field notes"
            value={form.notes}
            placeholder="Instructions, requirements, links…"
            oninput={(e) => set({ notes: e.currentTarget.value }, { typing: true })}
          ></textarea>
        </div>
        <div class="group-row">
          <div class="row-label">
            Notes page
            <small>{page && !page.deletedAt ? 'Long-form notes in your pages' : 'Write it up as a full page'}</small>
          </div>
          {#if page && !page.deletedAt}
            <button class="btn small raised" onclick={notesPage}>
              {#if page.icon}<span><PageIcon icon={page.icon} /></span>{:else}<Icon name="page" size={14} />{/if}
              <span class="page-name">{page.title || 'Untitled'}</span>
              <Icon name="arrow-right" size={13} stroke={2} />
            </button>
          {:else}
            <button class="btn small raised" onclick={notesPage}><Icon name="page-plus" size={14} /> Create Page</button>
          {/if}
        </div>
      </div>

      <h3 class="group-title">
        <span>Attachments</span>
        <button
          class="btn small raised"
          onclick={(e) => ui.pickFile(e.currentTarget as Element, attach, { exclude: form.fileIds })}
        ><Icon name="paperclip" size={13} stroke={2} /> Attach</button>
      </h3>
      <div class="group">
        {#each files as f (f.id)}
          <div class="group-row file">
            <button class="file-main" onclick={() => library.preview(f.id)}>
              <FileTile file={f} size={30} />
              <span class="file-text">
                <span class="file-name">{f.name}</span>
                <span class="file-meta">{f.missing ? 'Missing' : formatBytes(f.size)}</span>
              </span>
            </button>
            <button class="icon-btn" onclick={() => library.open(f.id)} data-tip="Open"><Icon name="external" size={15} /></button>
            <button class="icon-btn" onclick={() => detach(f.id)} data-tip="Remove"><Icon name="x" size={15} /></button>
          </div>
        {:else}
          <div class="group-row empty-files">
            <Icon name="upload" size={15} stroke={2} />
            Drop files here, or attach from your Files library.
          </div>
        {/each}
      </div>

      {#if existing}<Backlinks id={existing.id} inSheet />{/if}
    </div>

    <footer class="modal-foot">
      {#if existing}
        <span>Created {relativeTime(existing.createdAt)}</span>
        <div class="actions">
          <button class="btn small destructive" onclick={() => planner.trash('assignments', existing.id)}>Move to Trash</button>
          <button class="btn small primary" onclick={close}>Done</button>
        </div>
      {:else}
        <span>Changes are saved automatically.</span>
        <div class="actions">
          <button class="btn small" onclick={cancel}>Cancel</button>
          <button class="btn small primary" onclick={add} disabled={!draft.title.trim()}>Add Assignment</button>
        </div>
      {/if}
    </footer>

    {#if dropping}
      <div class="drop-hint"><Icon name="paperclip" size={18} stroke={2} /> Drop to attach</div>
    {/if}
  </div>
</Modal>

<style>
  .sheet {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }
  .title {
    flex: 1;
    min-width: 0;
    height: 36px;
    border: none;
    background: transparent;
    font-size: 17px;
    font-weight: var(--fw-650);
    letter-spacing: -0.016em;
    color: var(--text);
  }
  .title.done {
    color: var(--text-3);
    text-decoration: line-through;
    text-decoration-color: var(--text-4);
  }
  .picker {
    gap: 8px;
    max-width: 240px;
  }
  .muted {
    color: var(--text-3);
  }
  .picker :global(svg) {
    color: var(--text-3);
  }

  .due-row {
    align-items: flex-start;
    padding-top: 12px;
    padding-bottom: 12px;
  }
  .due-state {
    font-variant-numeric: tabular-nums;
  }
  .due-state.overdue {
    color: var(--danger) !important;
  }
  .due-state.today {
    color: var(--c-orange) !important;
  }
  .due {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }
  .due-fields {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .field.date {
    width: 148px;
  }
  .field.time {
    width: 128px;
  }
  .quick {
    display: flex;
    gap: 6px;
  }
  .quick .chip {
    height: 24px;
    padding: 0 10px;
    font-size: var(--fs-footnote);
    background: var(--raised);
    box-shadow: 0 0 0 0.5px var(--hairline);
  }
  .quick .chip.on {
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: none;
  }

  .tags-group {
    margin-top: 8px;
  }
  .score {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .field.num {
    width: 80px;
  }
  .field.num input {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .slash {
    color: var(--text-3);
  }
  .tags-row {
    min-height: 48px;
  }
  .modal-body :global(.backlinks) {
    margin-top: 0;
  }
  .notes {
    min-height: 84px;
  }
  .page-name {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file {
    gap: 4px;
    padding: 6px 10px 6px 10px;
  }
  .file-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 2px 6px 2px 6px;
    border-radius: var(--r-sm);
    text-align: left;
    transition: background-color var(--dur-fast) var(--ease);
  }
  .file-main:hover {
    background: var(--fill);
  }
  .file-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .file-name {
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file-meta {
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
  .empty-files {
    justify-content: center;
    gap: 8px;
    min-height: 56px;
    font-size: var(--fs-ui);
    color: var(--text-3);
  }

  .drop-hint {
    position: absolute;
    inset: 8px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 8px;
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--bg-elevated) 86%, transparent);
    box-shadow: inset 0 0 0 2px var(--accent);
    font-size: var(--fs-callout);
    font-weight: var(--fw-600);
    color: var(--text);
    pointer-events: none;
    z-index: 2;
  }
</style>
